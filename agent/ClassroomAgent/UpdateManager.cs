using System.Diagnostics;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json.Nodes;

namespace ClassroomAgent;

public class UpdateManager(ILogger<UpdateManager> logger, IHostApplicationLifetime lifetime)
{
    private static readonly string InstallDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ClassroomAgent");
    private static readonly string PendingDir = Path.Combine(InstallDir, "pending");
    private static readonly string UpdaterExe = Path.Combine(InstallDir, "ClassroomUpdater.exe");
    private const string ServiceName = "ClassroomAgent";

    public async Task HandleUpdateAvailableAsync(JsonNode msg, CancellationToken ct)
    {
        var version = msg["version"]?.GetValue<string>() ?? "?";
        var downloadUrl = msg["download_url"]?.GetValue<string>() ?? "";
        var expectedSha256 = msg["sha256"]?.GetValue<string>() ?? "";

        logger.LogInformation("Update available: v{Version}", version);

        if (string.IsNullOrEmpty(downloadUrl))
        {
            logger.LogWarning("update_available missing download_url");
            return;
        }

        var pendingPath = Path.Combine(PendingDir, $"agent_v{version}.exe");

        try
        {
            Directory.CreateDirectory(PendingDir);
            await DownloadAsync(downloadUrl, pendingPath, ct);
            VerifySha256(pendingPath, expectedSha256);
            LaunchUpdaterAndStop(pendingPath);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Update failed, staying on current version");
            try { File.Delete(pendingPath); } catch { }
        }
    }

    private async Task DownloadAsync(string url, string destPath, CancellationToken ct)
    {
        logger.LogInformation("Downloading update from {Url}", url);
        using var client = new HttpClient();
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        await using var fs = File.Create(destPath);
        await response.Content.CopyToAsync(fs, ct);
        logger.LogInformation("Download complete: {Path}", destPath);
    }

    private void VerifySha256(string filePath, string expectedHex)
    {
        if (string.IsNullOrEmpty(expectedHex)) return;

        var hash = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(filePath))).ToLowerInvariant();
        if (!hash.Equals(expectedHex.ToLowerInvariant(), StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"SHA256 mismatch: expected={expectedHex} actual={hash}");
        }
        logger.LogInformation("SHA256 verified OK");
    }

    private void LaunchUpdaterAndStop(string newExePath)
    {
        if (!File.Exists(UpdaterExe))
        {
            logger.LogError("ClassroomUpdater.exe not found at {Path}", UpdaterExe);
            return;
        }

        var pid = Process.GetCurrentProcess().Id;
        var args = $"--service-pid {pid} --new-path \"{newExePath}\" --service-name {ServiceName}";

        logger.LogInformation("Launching ClassroomUpdater, then stopping self");
        Process.Start(new ProcessStartInfo(UpdaterExe, args)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        });

        // Stop the host — Windows SCM will not restart since we're doing a controlled stop
        // ClassroomUpdater will start us again after replacing the binary
        lifetime.StopApplication();
    }
}
