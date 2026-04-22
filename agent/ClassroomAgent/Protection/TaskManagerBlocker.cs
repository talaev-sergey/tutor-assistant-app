using Microsoft.Win32;

namespace ClassroomAgent.Protection;

public class TaskManagerBlocker
{
    private const string PolicyKey =
        @"Software\Microsoft\Windows\CurrentVersion\Policies\System";

    public void Disable()
    {
        using var key = Registry.CurrentUser.CreateSubKey(PolicyKey);
        key.SetValue("DisableTaskMgr", 1, RegistryValueKind.DWord);
    }

    public void Enable()
    {
        using var key = Registry.CurrentUser.OpenSubKey(PolicyKey, writable: true);
        key?.DeleteValue("DisableTaskMgr", throwOnMissingValue: false);
    }
}
