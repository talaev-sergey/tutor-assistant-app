using System.Runtime.InteropServices;

namespace ClassroomAgent.Protection;

public class ScreenLocker
{
    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool LockWorkStation();

    public void Lock()
    {
        if (!LockWorkStation())
            throw new InvalidOperationException(
                $"LockWorkStation failed: {Marshal.GetLastWin32Error()}");
    }

    // Windows does not provide a public API to programmatically unlock a session.
    // Unlock is tracked as state only; the user unlocks with their credentials.
    public void Unlock() { }
}
