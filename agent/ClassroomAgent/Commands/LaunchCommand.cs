using System.Diagnostics;

namespace ClassroomAgent.Commands;

public class LaunchCommand(List<AllowedProgram> allowedPrograms)
{
    public Task<(bool success, string? error)> ExecuteAsync(List<string> slugs, CancellationToken ct)
    {
        var errors = new List<string>();

        foreach (var slug in slugs)
        {
            var program = allowedPrograms.FirstOrDefault(p =>
                p.Slug.Equals(slug, StringComparison.OrdinalIgnoreCase));

            if (program == null)
            {
                errors.Add($"'{slug}' not in allowlist");
                continue;
            }

            if (!File.Exists(program.WindowsPath))
            {
                errors.Add($"'{slug}' not found at {program.WindowsPath}");
                continue;
            }

            Process.Start(new ProcessStartInfo
            {
                FileName = program.WindowsPath,
                UseShellExecute = true,
            });
        }

        if (errors.Count > 0)
            return Task.FromResult((false, string.Join("; ", errors)));

        return Task.FromResult((true, (string?)null));
    }
}
