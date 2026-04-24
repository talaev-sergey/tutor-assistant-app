using System.Diagnostics;
using System.ServiceProcess;
using System.Text.Json;

namespace ClassroomInstaller;

public class SetupForm : Form
{
    private static readonly string InstallDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "ClassroomAgent");
    private const string ServiceName = "ClassroomAgent";

    private readonly TextBox _txtPcName;
    private readonly TextBox _txtBackendUrl;
    private readonly TextBox _txtToken;
    private readonly Button _btnToggleToken;
    private readonly Button _btnInstall;
    private readonly Label _lblStatus;
    private readonly ProgressBar _progress;

    public SetupForm()
    {
        Text = "Classroom Agent — Установка";
        Size = new Size(500, 370);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 9.5f);
        BackColor = Color.White;

        // Header
        var header = new Panel { Dock = DockStyle.Top, Height = 70, BackColor = Color.FromArgb(30, 30, 30) };
        var lblTitle = new Label
        {
            Text = "Classroom Agent", ForeColor = Color.White,
            Font = new Font("Segoe UI", 16, FontStyle.Bold),
            AutoSize = true, Location = new Point(20, 12),
        };
        var lblSub = new Label
        {
            Text = "Управление классными компьютерами", ForeColor = Color.Silver,
            AutoSize = true, Location = new Point(22, 42),
        };
        header.Controls.AddRange([lblTitle, lblSub]);

        // Form fields
        var panel = new Panel { Location = new Point(0, 70), Width = 500, Height = 220 };

        _txtPcName = MakeField(panel, "Имя компьютера:", Environment.MachineName, 20);
        _txtBackendUrl = MakeField(panel, "Адрес сервера:", "ws://classroomctl.local:8082/ws", 80);

        // Token row with show/hide
        var lblToken = new Label { Text = "Токен:", Location = new Point(20, 140), AutoSize = true };
        _txtToken = new TextBox
        {
            Location = new Point(20, 160), Width = 380, UseSystemPasswordChar = true,
            BorderStyle = BorderStyle.FixedSingle, Height = 24,
        };
        _btnToggleToken = new Button
        {
            Text = "👁", Location = new Point(408, 158), Width = 52, Height = 28,
            FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
        };
        _btnToggleToken.FlatAppearance.BorderColor = Color.Silver;
        _btnToggleToken.Click += (_, _) =>
            _txtToken.UseSystemPasswordChar = !_txtToken.UseSystemPasswordChar;
        panel.Controls.AddRange([lblToken, _txtToken, _btnToggleToken]);

        // Install button
        _btnInstall = new Button
        {
            Text = "Установить", Location = new Point(20, 200),
            Width = 440, Height = 38, BackColor = Color.FromArgb(0, 120, 212),
            ForeColor = Color.White, FlatStyle = FlatStyle.Flat, Cursor = Cursors.Hand,
            Font = new Font("Segoe UI", 10, FontStyle.Bold),
        };
        _btnInstall.FlatAppearance.BorderSize = 0;
        _btnInstall.Click += OnInstallClick;
        panel.Controls.Add(_btnInstall);

        // Status / progress
        _progress = new ProgressBar
        {
            Location = new Point(20, 250), Width = 440, Height = 8,
            Style = ProgressBarStyle.Continuous, Visible = false,
        };
        _lblStatus = new Label
        {
            Location = new Point(20, 264), Width = 440, Height = 20,
            ForeColor = Color.Gray, TextAlign = ContentAlignment.MiddleLeft,
        };
        panel.Controls.AddRange([_progress, _lblStatus]);

        Controls.AddRange([header, panel]);

        // Pre-fill from existing config
        TryLoadExistingConfig();
    }

    private static TextBox MakeField(Panel panel, string label, string placeholder, int top)
    {
        panel.Controls.Add(new Label { Text = label, Location = new Point(20, top), AutoSize = true });
        var txt = new TextBox
        {
            Location = new Point(20, top + 20), Width = 440,
            Text = placeholder, BorderStyle = BorderStyle.FixedSingle, Height = 24,
        };
        panel.Controls.Add(txt);
        return txt;
    }

    private void TryLoadExistingConfig()
    {
        var path = Path.Combine(InstallDir, "appsettings.json");
        if (!File.Exists(path)) return;
        try
        {
            var json = JsonDocument.Parse(File.ReadAllText(path));
            var agent = json.RootElement.GetProperty("Agent");
            _txtPcName.Text = agent.GetProperty("PcName").GetString() ?? _txtPcName.Text;
            _txtBackendUrl.Text = agent.GetProperty("BackendUrl").GetString() ?? _txtBackendUrl.Text;
            _txtToken.Text = agent.GetProperty("Token").GetString() ?? "";
        }
        catch { /* ignore, use defaults */ }
    }

    private async void OnInstallClick(object? sender, EventArgs e)
    {
        if (!Validate()) return;

        _btnInstall.Enabled = false;
        _progress.Visible = true;
        _progress.Value = 0;

        try
        {
            await Task.Run(RunInstallation);
            SetStatus("✓ Агент успешно установлен и запущен", Color.Green);
            _progress.Value = 100;
            MessageBox.Show("Classroom Agent установлен!\n\nСервис ClassroomAgent запущен.",
                "Готово", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            SetStatus($"✗ Ошибка: {ex.Message}", Color.Red);
            _progress.Visible = false;
            MessageBox.Show($"Ошибка установки:\n\n{ex.Message}",
                "Ошибка", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally
        {
            _btnInstall.Enabled = true;
        }
    }

    private void RunInstallation()
    {
        SetStatus("Создание директории...", Color.Gray);
        Directory.CreateDirectory(InstallDir);
        Directory.CreateDirectory(Path.Combine(InstallDir, "logs"));
        Directory.CreateDirectory(Path.Combine(InstallDir, "backup"));
        Directory.CreateDirectory(Path.Combine(InstallDir, "pending"));
        SetProgress(20);

        SetStatus("Копирование файлов...", Color.Gray);
        var sourceDir = AppContext.BaseDirectory;
        foreach (var file in new[] { "ClassroomAgent.exe", "ClassroomUpdater.exe" })
        {
            var src = Path.Combine(sourceDir, file);
            if (File.Exists(src))
                File.Copy(src, Path.Combine(InstallDir, file), overwrite: true);
        }
        SetProgress(45);

        SetStatus("Сохранение конфигурации...", Color.Gray);
        WriteConfig();
        SetProgress(60);

        SetStatus("Настройка брандмауэра (mDNS)...", Color.Gray);
        AllowMdnsFirewall();
        SetProgress(75);

        SetStatus("Установка службы Windows...", Color.Gray);
        InstallService();
        SetProgress(90);

        SetStatus("Запуск службы...", Color.Gray);
        StartService();
        SetProgress(100);
    }

    // Allow UDP 5353 inbound so Windows native mDNS can receive classroomctl.local announcements
    private static void AllowMdnsFirewall()
    {
        const string ruleName = "Classroom mDNS";
        // Delete old rule if exists (idempotent)
        RunSc2("netsh", $"advfirewall firewall delete rule name=\"{ruleName}\"");
        RunSc2("netsh", $"advfirewall firewall add rule name=\"{ruleName}\" dir=in action=allow protocol=UDP localport=5353 profile=any");
    }

    private static void RunSc2(string exe, string args)
    {
        using var p = Process.Start(new ProcessStartInfo(exe, args)
        {
            CreateNoWindow = true, UseShellExecute = false,
            RedirectStandardOutput = true, RedirectStandardError = true,
        })!;
        p.WaitForExit(5000);
    }

    private void WriteConfig()
    {
        var pcName = InvokeRequired
            ? (string)Invoke(() => _txtPcName.Text)
            : _txtPcName.Text;
        var backendUrl = InvokeRequired
            ? (string)Invoke(() => _txtBackendUrl.Text)
            : _txtBackendUrl.Text;
        var token = InvokeRequired
            ? (string)Invoke(() => _txtToken.Text)
            : _txtToken.Text;

        var config = new
        {
            Agent = new { BackendUrl = backendUrl, Token = token, PcName = pcName },
            Serilog = new { MinimumLevel = "Information" },
        };
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(Path.Combine(InstallDir, "appsettings.json"), json);
    }

    private static void InstallService()
    {
        var exePath = Path.Combine(InstallDir, "ClassroomAgent.exe");

        // Stop and remove existing service if present
        try
        {
            using var existing = new ServiceController(ServiceName);
            if (existing.Status != ServiceControllerStatus.Stopped)
                existing.Stop();
        }
        catch { /* service doesn't exist yet */ }

        RunSc($"delete {ServiceName}");
        Thread.Sleep(1500);

        RunSc($"create {ServiceName} binPath= \"{exePath}\" start= auto obj= LocalSystem DisplayName= \"Classroom Agent\"");
        RunSc($"description {ServiceName} \"Classroom PC management agent\"");
        RunSc($"failure {ServiceName} reset= 60 actions= restart/5000/restart/5000/restart/5000");
    }

    private static void StartService()
    {
        using var svc = new ServiceController(ServiceName);
        if (svc.Status != ServiceControllerStatus.Running)
        {
            svc.Start();
            svc.WaitForStatus(ServiceControllerStatus.Running, TimeSpan.FromSeconds(15));
        }
    }

    private static void RunSc(string args)
    {
        using var p = Process.Start(new ProcessStartInfo("sc.exe", args)
        {
            CreateNoWindow = true, UseShellExecute = false,
            RedirectStandardOutput = true, RedirectStandardError = true,
        })!;
        p.WaitForExit(5000);
    }

    private new bool Validate()
    {
        if (string.IsNullOrWhiteSpace(_txtPcName.Text))
        { MessageBox.Show("Введите имя компьютера.", "Проверка", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false; }
        if (string.IsNullOrWhiteSpace(_txtBackendUrl.Text) || !_txtBackendUrl.Text.StartsWith("ws"))
        { MessageBox.Show("Введите корректный адрес сервера (ws:// или wss://).", "Проверка", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false; }
        if (string.IsNullOrWhiteSpace(_txtToken.Text))
        { MessageBox.Show("Введите токен агента.", "Проверка", MessageBoxButtons.OK, MessageBoxIcon.Warning); return false; }
        return true;
    }

    private void SetStatus(string text, Color color) =>
        Invoke(() => { _lblStatus.Text = text; _lblStatus.ForeColor = color; });

    private void SetProgress(int value) =>
        Invoke(() => _progress.Value = value);
}
