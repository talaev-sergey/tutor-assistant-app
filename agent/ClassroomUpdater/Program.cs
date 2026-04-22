using ClassroomUpdater;

// Args: --service-pid <pid> --new-path <path> --service-name <name>
var args = ParseArgs(Environment.GetCommandLineArgs()[1..]);

if (!args.TryGetValue("service-pid", out var pidStr) ||
    !args.TryGetValue("new-path", out var newPath) ||
    !args.TryGetValue("service-name", out var serviceName))
{
    Console.Error.WriteLine("Usage: ClassroomUpdater --service-pid <pid> --new-path <path> --service-name <name>");
    return 1;
}

var updater = new Updater(int.Parse(pidStr!), newPath!, serviceName!);
return await updater.RunAsync();

static Dictionary<string, string> ParseArgs(string[] args)
{
    var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    for (int i = 0; i < args.Length - 1; i++)
        if (args[i].StartsWith("--"))
            result[args[i][2..]] = args[i + 1];
    return result;
}
