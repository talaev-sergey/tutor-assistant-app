using Microsoft.Extensions.Options;

namespace ClassroomAgent;

public class Worker(
    ILogger<Worker> logger,
    IOptions<AgentConfig> config,
    MessageDispatcher dispatcher) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        logger.LogInformation("ClassroomAgent starting, backend={Url}", config.Value.BackendUrl);

        var client = new WebSocketClient(
            config.Value,
            dispatcher,
            logger);

        await client.RunAsync(ct);

        logger.LogInformation("ClassroomAgent stopped");
    }
}
