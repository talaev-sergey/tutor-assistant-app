using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Net.NetworkInformation;

namespace ClassroomAgent;

public class WebSocketClient(
    AgentConfig config,
    MessageDispatcher dispatcher,
    ILogger logger)
{
    private const int HeartbeatIntervalSec = 15;
    private const int MaxDelaySeconds = 60;
    private const string AgentVersion = "1.0.0";
    private const int ProtocolVersion = 1;

    private int? _pcId;
    private readonly List<AllowedProgram> _allowedPrograms = [];

    public async Task RunAsync(CancellationToken ct)
    {
        var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await ConnectAndRunAsync(ct);
                attempt = 0;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                var delay = GetReconnectDelay(attempt++);
                logger.LogWarning("Disconnected: {Message}. Reconnect in {Delay:F1}s", ex.Message, delay.TotalSeconds);
                await Task.Delay(delay, ct);
            }
        }
    }

    private async Task ConnectAndRunAsync(CancellationToken ct)
    {
        using var ws = new ClientWebSocket();
        ws.Options.SetRequestHeader("Authorization", $"Bearer {config.Token}");

        logger.LogInformation("Connecting to {Url}", config.BackendUrl);
        await ws.ConnectAsync(new Uri(config.BackendUrl), ct);
        logger.LogInformation("Connected");

        await SendRegisterAsync(ws, ct);

        using var heartbeatTimer = new PeriodicTimer(TimeSpan.FromSeconds(HeartbeatIntervalSec));
        var heartbeatTask = HeartbeatLoopAsync(ws, heartbeatTimer, ct);
        var receiveTask = ReceiveLoopAsync(ws, ct);

        await Task.WhenAny(heartbeatTask, receiveTask);

        if (ws.State == WebSocketState.Open)
            await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "Shutdown", CancellationToken.None);

        await heartbeatTask;
        await receiveTask;
    }

    private async Task SendRegisterAsync(ClientWebSocket ws, CancellationToken ct)
    {
        var msg = new JsonObject
        {
            ["type"] = "register",
            ["protocol_version"] = ProtocolVersion,
            ["message_id"] = Guid.NewGuid().ToString(),
            ["agent_version"] = AgentVersion,
            ["pc_name"] = config.PcName,
            ["machine_fingerprint"] = GetMachineFingerprint(),
            ["hostname"] = Environment.MachineName,
            ["ip_local"] = GetLocalIp(),
            ["os_version"] = Environment.OSVersion.ToString(),
            ["update_channel"] = "stable",
        };
        await SendJsonAsync(ws, msg, ct);
        logger.LogInformation("Sent register: pc_name={PcName}", config.PcName);
    }

    private async Task HeartbeatLoopAsync(ClientWebSocket ws, PeriodicTimer timer, CancellationToken ct)
    {
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                if (ws.State != WebSocketState.Open) break;

                var msg = new JsonObject
                {
                    ["type"] = "heartbeat",
                    ["protocol_version"] = ProtocolVersion,
                    ["message_id"] = Guid.NewGuid().ToString(),
                    ["agent_version"] = AgentVersion,
                    ["pc_id"] = _pcId,
                    ["status"] = new JsonObject
                    {
                        ["locked"] = dispatcher.IsLocked,
                        ["protected"] = dispatcher.IsProtected,
                        ["active_user"] = Environment.UserName,
                        ["cpu_pct"] = 0,
                        ["ram_pct"] = 0,
                    },
                };
                await SendJsonAsync(ws, msg, ct);
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception ex)
        {
            logger.LogWarning("Heartbeat error: {Message}", ex.Message);
        }
    }

    private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[64 * 1024];
        var sb = new StringBuilder();

        while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
        {
            sb.Clear();
            WebSocketReceiveResult result;

            do
            {
                result = await ws.ReceiveAsync(buffer, ct);
                if (result.MessageType == WebSocketMessageType.Close) return;
                sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            } while (!result.EndOfMessage);

            var json = sb.ToString();
            _ = Task.Run(async () =>
            {
                try
                {
                    var response = await dispatcher.HandleAsync(json, _allowedPrograms, ct);
                    if (response != null)
                        await SendJsonAsync(ws, response, ct);
                }
                catch (Exception ex)
                {
                    logger.LogError("Handle error: {Message}", ex.Message);
                }
            }, ct);

            var node = JsonNode.Parse(json);
            var type = node?["type"]?.GetValue<string>();

            if (type == "register_ack")
            {
                _pcId = node?["pc_id"]?.GetValue<int>();
                var accepted = node?["accepted"]?.GetValue<bool>() ?? false;
                if (!accepted)
                {
                    var reason = node?["reason"]?.GetValue<string>() ?? "unknown";
                    logger.LogError("Registration rejected: {Reason}", reason);
                    await ws.CloseAsync(WebSocketCloseStatus.PolicyViolation, reason, ct);
                    return;
                }

                _allowedPrograms.Clear();
                var programs = node?["allowed_programs"]?.AsArray();
                if (programs != null)
                    foreach (var p in programs)
                        _allowedPrograms.Add(new AllowedProgram(
                            p!["slug"]!.GetValue<string>(),
                            p["name"]!.GetValue<string>(),
                            p["windows_path"]!.GetValue<string>()));

                var pending = node?["pending_commands"]?.AsArray();
                if (pending != null)
                    foreach (var cmd in pending)
                    {
                        var response = await dispatcher.HandleAsync(cmd!.ToJsonString(), _allowedPrograms, ct);
                        if (response != null)
                            await SendJsonAsync(ws, response, ct);
                    }

                logger.LogInformation("Registered: pc_id={PcId}, programs={Count}", _pcId, _allowedPrograms.Count);
            }
        }
    }

    private async Task SendJsonAsync(ClientWebSocket ws, JsonNode msg, CancellationToken ct)
    {
        var bytes = Encoding.UTF8.GetBytes(msg.ToJsonString());
        await ws.SendAsync(bytes, WebSocketMessageType.Text, true, ct);
    }

    private static TimeSpan GetReconnectDelay(int attempt)
    {
        var baseDelay = Math.Min(Math.Pow(2, attempt), MaxDelaySeconds);
        var jitter = baseDelay * 0.2 * (Random.Shared.NextDouble() * 2 - 1);
        return TimeSpan.FromSeconds(Math.Max(1, baseDelay + jitter));
    }

    private static string GetMachineFingerprint()
    {
        var parts = new List<string> { Environment.MachineName };
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211
                && nic.OperationalStatus == OperationalStatus.Up)
            {
                parts.Add(nic.GetPhysicalAddress().ToString());
                break;
            }
        }
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(string.Join("|", parts)));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static string GetLocalIp()
    {
        foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (nic.NetworkInterfaceType is NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211
                && nic.OperationalStatus == OperationalStatus.Up)
            {
                foreach (var addr in nic.GetIPProperties().UnicastAddresses)
                {
                    if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
                        return addr.Address.ToString();
                }
            }
        }
        return "unknown";
    }
}

public record AllowedProgram(string Slug, string Name, string WindowsPath);
