using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
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
        int? pcId,
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

        var (success, error, data) = await ExecuteAsync(commandType, @params, programs, ct);

        var result = BuildResult(commandId, traceId, pcId, success, error, data);
        cache.Store(commandId, result.ToJsonString());

        logger.LogInformation(
            "command={Type} trace={Trace} success={Success} error={Error}",
            commandType, traceId, success, error);

        return result;
    }

    private async Task<(bool success, string? error, string? data)> ExecuteAsync(
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
                    return (true, null, null);

                case "unlock":
                    _screenLocker.Unlock();
                    IsLocked = false;
                    return (true, null, null);

                case "protect_on":
                    _taskManager.Disable();
                    IsProtected = true;
                    return (true, null, null);

                case "protect_off":
                    _taskManager.Enable();
                    IsProtected = false;
                    return (true, null, null);

                case "launch":
                    var slugs = @params?["programs"]?.AsArray()
                        .Select(s => s?.GetValue<string>() ?? "")
                        .Where(s => s.Length > 0)
                        .ToList() ?? [];
                    var (ls, le) = await new LaunchCommand(programs).ExecuteAsync(slugs, ct);
                    return (ls, le, null);

                case "reboot":
                    var rDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/r /t {rDelay}");
                    return (true, null, null);

                case "shutdown":
                    var sDelay = @params?["delay_sec"]?.GetValue<int>() ?? 30;
                    System.Diagnostics.Process.Start("shutdown", $"/s /t {sDelay}");
                    return (true, null, null);

                case "ping":
                    return (true, null, null);

                case "screenshot":
                    var imgData = TakeScreenshot();
                    return (true, null, imgData);

                default:
                    return (false, $"Unknown command type: {commandType}", null);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Command {Type} failed", commandType);
            return (false, ex.Message, null);
        }
    }

    // ── Screenshot ───────────────────────────────────────────────────────────

    private string TakeScreenshot()
    {
        // Try to spawn in interactive user session (required when service runs in Session 0)
        uint sessionId = WTSGetActiveConsoleSessionId();
        if (sessionId != 0xFFFFFFFF && WTSQueryUserToken(sessionId, out IntPtr token))
        {
            CloseHandle(token);
            return CaptureScreenInUserSession(sessionId);
        }
        // Fallback: no interactive session (VM / test env) — capture directly
        return ScreenCapture.CaptureBase64Jpeg();
    }

    private string CaptureScreenInUserSession(uint sessionId)
    {
        const uint STARTF_USESTDHANDLES = 0x00000100;
        const uint CREATE_NO_WINDOW = 0x08000000;
        const uint HANDLE_FLAG_INHERIT = 1;

        if (!WTSQueryUserToken(sessionId, out IntPtr userToken))
            throw new Win32Exception(Marshal.GetLastWin32Error(), "WTSQueryUserToken failed");

        IntPtr hRead = IntPtr.Zero, hWrite = IntPtr.Zero;
        try
        {
            var sa = new SECURITY_ATTRIBUTES
            {
                nLength = (uint)Marshal.SizeOf<SECURITY_ATTRIBUTES>(),
                bInheritHandle = true,
            };
            if (!CreatePipe(out hRead, out hWrite, ref sa, 0))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreatePipe failed");

            SetHandleInformation(hRead, HANDLE_FLAG_INHERIT, 0);

            var exePath = System.Diagnostics.Process.GetCurrentProcess().MainModule!.FileName;
            var si = new STARTUPINFO
            {
                cb = Marshal.SizeOf<STARTUPINFO>(),
                dwFlags = STARTF_USESTDHANDLES,
                hStdInput = IntPtr.Zero,
                hStdOutput = hWrite,
                hStdError = IntPtr.Zero,
            };

            if (!CreateProcessAsUser(userToken, null, $"\"{exePath}\" --screenshot",
                    IntPtr.Zero, IntPtr.Zero, true, CREATE_NO_WINDOW,
                    IntPtr.Zero, null, ref si, out var pi))
                throw new Win32Exception(Marshal.GetLastWin32Error(), "CreateProcessAsUser failed");

            CloseHandle(hWrite);
            hWrite = IntPtr.Zero;
            CloseHandle(pi.hThread);

            var output = new StringBuilder();
            var buf = new byte[8192];
            while (true)
            {
                if (!ReadFile(hRead, buf, (uint)buf.Length, out uint bytesRead, IntPtr.Zero) || bytesRead == 0)
                    break;
                output.Append(Encoding.ASCII.GetString(buf, 0, (int)bytesRead));
            }

            WaitForSingleObject(pi.hProcess, 15_000);
            CloseHandle(pi.hProcess);

            return output.ToString().Trim();
        }
        finally
        {
            CloseHandle(userToken);
            if (hRead != IntPtr.Zero) CloseHandle(hRead);
            if (hWrite != IntPtr.Zero) CloseHandle(hWrite);
        }
    }

    // ── P/Invoke ─────────────────────────────────────────────────────────────

    [DllImport("kernel32.dll")]
    private static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("Wtsapi32.dll", SetLastError = true)]
    private static extern bool WTSQueryUserToken(uint SessionId, out IntPtr phToken);

    [DllImport("advapi32.dll", SetLastError = true)]
    private static extern bool CreateProcessAsUser(
        IntPtr hToken, string? lpApplicationName, string lpCommandLine,
        IntPtr lpProcessAttributes, IntPtr lpThreadAttributes,
        bool bInheritHandles, uint dwCreationFlags,
        IntPtr lpEnvironment, string? lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr hReadPipe, out IntPtr hWritePipe,
        ref SECURITY_ATTRIBUTES lpPipeAttributes, uint nSize);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr hObject, uint dwMask, uint dwFlags);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool ReadFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToRead,
        out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CloseHandle(IntPtr hObject);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

    [StructLayout(LayoutKind.Sequential)]
    private struct STARTUPINFO
    {
        public int cb;
        public IntPtr lpReserved, lpDesktop, lpTitle;
        public uint dwX, dwY, dwXSize, dwYSize;
        public uint dwXCountChars, dwYCountChars, dwFillAttribute, dwFlags;
        public ushort wShowWindow, cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput, hStdOutput, hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess, hThread;
        public uint dwProcessId, dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public uint nLength;
        public IntPtr lpSecurityDescriptor;
        public bool bInheritHandle;
    }

    // ── Result builder ───────────────────────────────────────────────────────

    private static JsonNode BuildResult(string commandId, string traceId, int? pcId, bool success, string? error, string? data = null)
    {
        var obj = new JsonObject
        {
            ["type"] = "command_result",
            ["protocol_version"] = 1,
            ["message_id"] = Guid.NewGuid().ToString(),
            ["command_id"] = commandId,
            ["trace_id"] = traceId,
            ["pc_id"] = pcId,
            ["success"] = success,
            ["error"] = error,
            ["executed_at"] = DateTime.UtcNow.ToString("O"),
        };
        if (data != null)
            obj["data"] = data;
        return obj;
    }
}
