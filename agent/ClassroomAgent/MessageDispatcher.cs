using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text.Json.Nodes;
using ClassroomAgent.Commands;
using ClassroomAgent.Protection;

namespace ClassroomAgent;

public class MessageDispatcher(
    ILogger<MessageDispatcher> logger,
    IdempotencyCache cache)
{
    public bool IsLocked { get; private set; }
    public bool IsProtected { get; private set; }

    private readonly ScreenLocker _screenLocker = new();
    private readonly TaskManagerBlocker _taskManager = new();

    public async Task<JsonNode?> HandleAsync(
        string json,
        List<AllowedProgram> programs,
        CancellationToken ct)
    {
        var node = JsonNode.Parse(json);
        if (node == null) return null;

        var type = node["type"]?.GetValue<string>();
        if (type != "command") return null;

        var commandId = node["command_id"]?.GetValue<string>() ?? "";
        var traceId = node["trace_id"]?.GetValue<string>() ?? "";
        var commandType = node["command_type"]?.GetValue<string>() ?? "";
        var @params = node["params"]?.AsObject();

        if (cache.TryGet(commandId, out var cached))
        {
            logger.LogDebug("Duplicate command {CommandId}, returning cached result", commandId);
            return JsonNode.Parse(cached);
        }

        var (success, error, data) = await ExecuteAsync(commandType, @params, programs, ct);

        var result = BuildResult(commandId, traceId, success, error, data);
        cache.Store(commandId, result.ToJsonString());

        logger.LogInformation(
            "command={Type} trace={Trace} success={Success} error={Error}",
            commandType, traceId, success, error);

        return result;
    }

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);

    private async Task<(bool success, string? error, string? data)> ExecuteAsync(
        string commandType,
        JsonObject? @params,
        List<AllowedProgram> programs,
        CancellationToken ct)
    {
        try
        {
            switch (commandType)
            {
                case "lock":
                    _screenLocker.Lock();
                    IsLocked = true;
                    return (true, null, null);

                case "unlock":
                    _screenLocker.Unlock();
                    IsLocked = false;
                    return (true, null, null);

                case "protect_on":
                    _taskManager.Disable();
                    IsProtected = true;
                    return (true, null, null);

                case "protect_off":
                    _taskManager.Enable();
                    IsProtected = false;
                    return (true, null, null);

                case "launch":
                    var slugs = @params?["programs"]?.AsArray()
                        .Select(s => s?.GetValue<string>() ?? "")
                        .Where(s => s.Length > 0)
                        .ToList() ?? [];
                    var (ls, le) = await new LaunchCommand(programs).ExecuteAsync(slugs, ct);
                    return (ls, le, null);

                case "reboot":
                    var rDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/r /t {rDelay}");
                    return (true, null, null);

                case "shutdown":
                    var sDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/s /t {sDelay}");
                    return (true, null, null);

                case "ping":
                    return (true, null, null);

                case "screenshot":
                    var imgData = CaptureScreen();
                    return (true, null, imgData);

                default:
                    return (false, $"Unknown command type: {commandType}", null);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Command {Type} failed", commandType);
            return (false, ex.Message, null);
        }
    }

    private string CaptureScreen()
    {
        var w = GetSystemMetrics(0);
        var h = GetSystemMetrics(1);
        using var bmp = new Bitmap(w, h);
        using var gfx = Graphics.FromImage(bmp);
        gfx.CopyFromScreen(0, 0, 0, 0, new Size(w, h));

        // Scale down to max 1280px wide to keep payload small
        Bitmap final = bmp;
        if (w > 1280)
        {
            int newH = (int)(h * 1280.0 / w);
            final = new Bitmap(bmp, new Size(1280, newH));
        }

        using var ms = new System.IO.MemoryStream();
        var jpegEncoder = ImageCodecInfo.GetImageEncoders()
            .First(e => e.FormatID == ImageFormat.Jpeg.Guid);
        using var encoderParams = new EncoderParameters(1);
        encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, 75L);
        final.Save(ms, jpegEncoder, encoderParams);

        if (!ReferenceEquals(final, bmp)) final.Dispose();
        return Convert.ToBase64String(ms.ToArray());
    }

    private static JsonNode BuildResult(string commandId, string traceId, bool success, string? error, string? data = null)
    {
        var obj = new JsonObject
        {
            ["type"] = "command_result",
            ["protocol_version"] = 1,
            ["message_id"] = Guid.NewGuid().ToString(),
            ["command_id"] = commandId,
            ["trace_id"] = traceId,
            ["success"] = success,
            ["error"] = error,
            ["executed_at"] = DateTime.UtcNow.ToString("O"),
        };
        if (data != null)
            obj["data"] = data;
        return obj;
    }
}
