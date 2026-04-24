using System.Diagnostics;
using System.ServiceProcess;

namespace ClassroomUpdater;

public class Updater(int servicePid, string newPath, string serviceName)
{
    private static readonly string InstallDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ClassroomAgent");

    public async Task<int> RunAsync()
    {
        var agentExe = Path.Combine(InstallDir, "ClassroomAgent.exe");
        var backupExe = Path.Combine(InstallDir, "backup", "ClassroomAgent.previous.exe");

        Log($"ClassroomUpdater started: pid={servicePid} new={newPath} service={serviceName}");

        // 1. Wait for the old agent process to exit
        if (!await WaitForProcessExitAsync(servicePid, timeoutSec: 15))
        {
            Log("Process did not exit in time, killing...");
            try { Process.GetProcessById(servicePid).Kill(); } catch { }
            await Task.Delay(2000);
        }
        Log("Old agent process exited");

        // Give SCM time to fully release the binary and mark service Stopped
        await Task.Delay(3000);

        // 2. Backup
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(backupExe)!);
            if (File.Exists(agentExe))
            {
                File.Copy(agentExe, backupExe, overwrite: true);
                Log($"Backup created: {backupExe}");
            }
        }
        catch (Exception ex)
        {
            Log($"Backup failed: {ex.Message}");
            return 1;
        }

        // 3. Copy new binary
        try
        {
            File.Copy(newPath, agentExe, overwrite: true);
            Log($"New binary copied: {agentExe}");
        }
        catch (Exception ex)
        {
            Log($"Copy failed: {ex.Message} — rolling back");
            await RollbackAsync(backupExe, agentExe);
            return 1;
        }

        // Give Windows Defender time to scan the new binary before SCM touches it
        await Task.Delay(5000);

        // 4. Start service
        try
        {
            StartService(serviceName);
            Log("Service started");
        }
        catch (Exception ex)
        {
            Log($"Service start failed: {ex.Message} — rolling back");
            await RollbackAsync(backupExe, agentExe);
            return 1;
        }

        // 5. Verify service stays running for 30 seconds
        Log("Verifying service stability (30s)...");
        await Task.Delay(TimeSpan.FromSeconds(30));

        if (!IsServiceRunning(serviceName))
        {
            Log("Service crashed — rolling back");
            await RollbackAsync(backupExe, agentExe);
            return 1;
        }

        Log("Update successful!");
        try { File.Delete(newPath); } catch { }
        return 0;
    }

    private static async Task RollbackAsync(string backupExe, string agentExe)
    {
        Log("Starting rollback...");
        if (!File.Exists(backupExe))
        {
            Log("No backup found, cannot rollback");
            return;
        }

        // Stop service and kill any lingering processes before overwriting
        StopServiceSafe();
        await Task.Delay(3000);

        for (int attempt = 1; attempt <= 5; attempt++)
        {
            try
            {
                File.Copy(backupExe, agentExe, overwrite: true);
                Log("Rollback binary restored");
                break;
            }
            catch (Exception ex)
            {
                Log($"Rollback copy attempt {attempt} failed: {ex.Message}");
                if (attempt < 5) await Task.Delay(2000);
            }
        }

        try
        {
            StartService(ServiceName(agentExe));
            Log("Rollback: service started");
        }
        catch (Exception ex)
        {
            Log($"Rollback: service start failed: {ex.Message}");
        }
    }

    private static string ServiceName(string agentExe) => "ClassroomAgent";

    private static void StopServiceSafe()
    {
        try
        {
            using var svc = new ServiceController("ClassroomAgent");
            if (svc.Status == ServiceControllerStatus.Running)
            {
                svc.Stop();
                svc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(10));
            }
        }
        catch { }
    }

    private static async Task<bool> WaitForProcessExitAsync(int pid, int timeoutSec)
    {
        try
        {
            var proc = Process.GetProcessById(pid);
            var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
            while (!proc.HasExited && !cts.Token.IsCancellationRequested)
                await Task.Delay(500, cts.Token).ContinueWith(_ => { });
            return proc.HasExited;
        }
        catch (ArgumentException)
        {
            return true;
        }
    }

    private static void StartService(string name)
    {
        using var svc = new ServiceController(name);
        if (svc.Status != ServiceControllerStatus.Running)
        {
            svc.Start();
            svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(60));
        }
    }

    private static bool IsServiceRunning(string name)
    {
        try
        {
            using var svc = new ServiceController(name);
            return svc.Status == ServiceControllerStatus.Running;
        }
        catch { return false; }
    }

    private static void Log(string msg)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {msg}";
        Console.WriteLine(line);
        try
        {
            var logDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
                "ClassroomAgent", "logs");
            Directory.CreateDirectory(logDir);
            File.AppendAllText(Path.Combine(logDir, "updater.log"), line + Environment.NewLine);
        }
        catch { }
    }
}
