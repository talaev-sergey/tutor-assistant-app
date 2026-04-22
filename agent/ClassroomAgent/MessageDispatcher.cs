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

        var (success, error) = await ExecuteAsync(commandType, @params, programs, ct);

        var result = BuildResult(commandId, traceId, success, error);
        cache.Store(commandId, result.ToJsonString());

        logger.LogInformation(
            "command={Type} trace={Trace} success={Success} error={Error}",
            commandType, traceId, success, error);

        return result;
    }

    private async Task<(bool success, string? error)> ExecuteAsync(
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
                    return (true, null);

                case "unlock":
                    _screenLocker.Unlock();
                    IsLocked = false;
                    return (true, null);

                case "protect_on":
                    _taskManager.Disable();
                    IsProtected = true;
                    return (true, null);

                case "protect_off":
                    _taskManager.Enable();
                    IsProtected = false;
                    return (true, null);

                case "launch":
                    var slugs = @params?["programs"]?.AsArray()
                        .Select(s => s?.GetValue<string>() ?? "")
                        .Where(s => s.Length > 0)
                        .ToList() ?? [];
                    return await new LaunchCommand(programs).ExecuteAsync(slugs, ct);

                case "reboot":
                    var rDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/r /t {rDelay}");
                    return (true, null);

                case "shutdown":
                    var sDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/s /t {sDelay}");
                    return (true, null);

                case "ping":
                    return (true, null);

                default:
                    return (false, $"Unknown command type: {commandType}");
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Command {Type} failed", commandType);
            return (false, ex.Message);
        }
    }

    private static JsonNode BuildResult(string commandId, string traceId, bool success, string? error) =>
        new JsonObject
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
}
