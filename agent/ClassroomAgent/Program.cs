using ClassroomAgent;
using ClassroomAgent.Security;
using Serilog;
using Serilog.Events;

var logDir = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
    "ClassroomAgent", "logs");
Directory.CreateDirectory(logDir);

Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft", LogEventLevel.Warning)
    .WriteTo.File(
        Path.Combine(logDir, "agent.log"),
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 5,
        fileSizeLimitBytes: 10 * 1024 * 1024)
    .WriteTo.EventLog("ClassroomAgent", manageEventSource: false)
    .CreateLogger();

try
{
    var builder = Host.CreateApplicationBuilder(args);

    builder.Services.AddWindowsService(options =>
        options.ServiceName = "ClassroomAgent");

    builder.Services.Configure<AgentConfig>(
        builder.Configuration.GetSection("Agent"));

    builder.Services.AddSingleton<TokenStorage>();
    builder.Services.AddSingleton<IdempotencyCache>();
    builder.Services.AddSingleton<MessageDispatcher>();
    builder.Services.AddHostedService<Worker>();

    builder.Logging.ClearProviders();
    builder.Logging.AddSerilog();

    var host = builder.Build();
    await host.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Agent terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}
