#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["rich", "questionary"]
# ///
"""
Classroom Control — установщик хоста (Linux).

Использование:
    sudo uv run deploy/scripts/install_host.py
"""

import os
import sys
import secrets
import subprocess
import textwrap
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich.table import Table
from rich import print as rprint
import questionary
from questionary import Style

console = Console()

SECRETS_DIR = Path("/etc/classroom-control")
SECRETS_FILE = SECRETS_DIR / "secrets"
INSTALL_DIR = Path("/opt/classroom")
BACKEND_DIR = INSTALL_DIR / "backend"
SERVICE_NAME = "classroom-backend"
SERVICE_FILE = Path(f"/etc/systemd/system/{SERVICE_NAME}.service")

QUESTIONARY_STYLE = Style([
    ("qmark", "fg:#00d7ff bold"),
    ("question", "bold"),
    ("answer", "fg:#00ff87 bold"),
    ("pointer", "fg:#00d7ff bold"),
    ("highlighted", "fg:#00d7ff bold"),
    ("selected", "fg:#00ff87"),
])


def header():
    console.print(Panel.fit(
        "[bold cyan]Classroom Control[/bold cyan] — Установка хоста\n"
        "[dim]Управление компьютерами класса через Telegram[/dim]",
        border_style="cyan",
        padding=(1, 4),
    ))
    console.print()


def step(n: int, total: int, title: str):
    console.rule(f"[bold cyan][{n}/{total}][/bold cyan] {title}", style="cyan")
    console.print()


def ok(msg: str):
    rprint(f"  [bold green]✓[/bold green] {msg}")


def warn(msg: str):
    rprint(f"  [bold yellow]![/bold yellow] {msg}")


def fail(msg: str):
    rprint(f"  [bold red]✗[/bold red] {msg}")
    sys.exit(1)


def check_root():
    if os.geteuid() != 0:
        console.print(Panel(
            "[bold red]Запустите установщик от root:[/bold red]\n\n"
            "  [bold]sudo uv run deploy/scripts/install_host.py[/bold]",
            border_style="red",
        ))
        sys.exit(1)


def ask_config() -> dict:
    step(1, 4, "Конфигурация")

    bot_token = questionary.password(
        "Telegram Bot Token (от @BotFather):",
        style=QUESTIONARY_STYLE,
    ).ask()
    if not bot_token:
        fail("Bot Token обязателен")

    admin_id = questionary.text(
        "Ваш Telegram ID (от @userinfobot, можно пропустить):",
        default="",
        style=QUESTIONARY_STYLE,
    ).ask() or "0"

    console.print()
    return {
        "BOT_TOKEN": bot_token.strip(),
        "ADMIN_TELEGRAM_ID": admin_id.strip(),
        "DATABASE_URL": f"sqlite:///{BACKEND_DIR / 'app.db'}",
        "PORT": "8082",
        "WEBAPP_URL": "",
    }


def generate_secrets(config: dict) -> dict:
    step(2, 4, "Генерация секретов")

    jwt_secret = secrets.token_hex(32)
    ok(f"JWT_SECRET сгенерирован ({len(jwt_secret)} символов)")

    config["JWT_SECRET"] = jwt_secret
    return config


def write_secrets(config: dict):
    step(3, 4, "Сохранение конфигурации")

    SECRETS_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    ok(f"Директория {SECRETS_DIR} создана")

    lines = [
        "# Classroom Control — secrets (авто-сгенерировано, не редактировать вручную)",
        f"DATABASE_URL={config['DATABASE_URL']}",
        f"BOT_TOKEN={config['BOT_TOKEN']}",
        f"ADMIN_TELEGRAM_ID={config['ADMIN_TELEGRAM_ID']}",
        f"JWT_SECRET={config['JWT_SECRET']}",
        f"APP_VERSION=1.0.0",
        f"DEBUG=false",
    ]
    if config["WEBAPP_URL"]:
        lines.append(f"WEBAPP_URL={config['WEBAPP_URL']}")

    SECRETS_FILE.write_text("\n".join(lines) + "\n")
    SECRETS_FILE.chmod(0o600)
    ok(f"{SECRETS_FILE} записан (режим 600, только root)")

    # Verify no world-readable
    stat = SECRETS_FILE.stat()
    if stat.st_mode & 0o077:
        warn("Права доступа установлены некорректно — исправляю")
        SECRETS_FILE.chmod(0o600)


def install_service(config: dict):
    step(4, 4, "Установка systemd-сервиса")

    port = config["PORT"]
    unit = textwrap.dedent(f"""\
        [Unit]
        Description=Classroom Control Backend
        After=network.target
        Wants=network-online.target

        [Service]
        Type=simple
        User=root
        WorkingDirectory={BACKEND_DIR}
        ExecStart={BACKEND_DIR}/.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port {port}
        Restart=always
        RestartSec=5
        EnvironmentFile={SECRETS_FILE}

        [Install]
        WantedBy=multi-user.target
    """)

    SERVICE_FILE.write_text(unit)
    ok(f"Сервис {SERVICE_FILE} записан")

    _run("systemctl daemon-reload")
    ok("systemctl daemon-reload")

    if _service_exists():
        _run(f"systemctl restart {SERVICE_NAME}")
        ok(f"Сервис {SERVICE_NAME} перезапущен")
    else:
        _run(f"systemctl enable {SERVICE_NAME}")
        _run(f"systemctl start {SERVICE_NAME}")
        ok(f"Сервис {SERVICE_NAME} включён и запущен")


def _service_exists() -> bool:
    result = subprocess.run(
        ["systemctl", "is-active", SERVICE_NAME],
        capture_output=True, text=True,
    )
    return result.stdout.strip() in ("active", "inactive", "failed")


def _run(cmd: str):
    result = subprocess.run(cmd.split(), capture_output=True, text=True)
    if result.returncode != 0:
        warn(f"  {cmd}: {result.stderr.strip()}")


def show_summary(config: dict):
    console.print()
    table = Table(show_header=False, border_style="green", box=None, padding=(0, 2))
    table.add_column(style="dim")
    table.add_column(style="bold green")

    table.add_row("Сервис", SERVICE_NAME)
    table.add_row("Порт", config["PORT"])
    table.add_row("БД", config["DATABASE_URL"].removeprefix("sqlite:///"))
    table.add_row("Секреты", str(SECRETS_FILE))
    table.add_row("JWT_SECRET", "✓ авто-сгенерирован")
    table.add_row("BOT_TOKEN", "✓ сохранён")

    console.print(Panel(
        table,
        title="[bold green]Установка завершена[/bold green]",
        border_style="green",
        padding=(1, 2),
    ))
    console.print()
    rprint(f"  Проверить статус: [bold]systemctl status {SERVICE_NAME}[/bold]")
    rprint(f"  Логи:             [bold]journalctl -u {SERVICE_NAME} -f[/bold]")
    console.print()


def main():
    header()
    check_root()

    config = ask_config()
    config = generate_secrets(config)
    write_secrets(config)
    install_service(config)
    show_summary(config)


if __name__ == "__main__":
    main()
