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
        if (!await WaitForProcessExitAsync(servicePid, timeoutSec: 10))
        {
            Log("Process did not exit in time, killing...");
            try { Process.GetProcessById(servicePid).Kill(); } catch { }
            await Task.Delay(1000);
        }
        Log("Old agent process exited");

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
            Rollback(backupExe, agentExe, serviceName);
            return 1;
        }

        // 4. Start service
        try
        {
            StartService(serviceName);
            Log("Service started");
        }
        catch (Exception ex)
        {
            Log($"Service start failed: {ex.Message} — rolling back");
            Rollback(backupExe, agentExe, serviceName);
            return 1;
        }

        // 5. Verify service stays running for 30 seconds
        Log("Verifying service stability (30s)...");
        await Task.Delay(TimeSpan.FromSeconds(30));

        if (!IsServiceRunning(serviceName))
        {
            Log("Service crashed — rolling back");
            Rollback(backupExe, agentExe, serviceName);
            return 1;
        }

        Log("Update successful!");

        // Clean up pending file
        try { File.Delete(newPath); } catch { }

        return 0;
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
            return true; // process already gone
        }
    }

    private static void StartService(string name)
    {
        using var svc = new ServiceController(name);
        if (svc.Status != ServiceControllerStatus.Running)
        {
            svc.Start();
            svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
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

    private static void Rollback(string backupExe, string agentExe, string serviceName)
    {
        Log("Starting rollback...");
        try
        {
            if (File.Exists(backupExe))
            {
                File.Copy(backupExe, agentExe, overwrite: true);
                StartService(serviceName);
                Log("Rollback successful");
            }
            else
            {
                Log("No backup found, cannot rollback");
            }
        }
        catch (Exception ex)
        {
            Log($"Rollback failed: {ex.Message}");
        }
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
