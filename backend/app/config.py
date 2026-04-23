import socket
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./app.db"
    bot_token: str = ""
    admin_telegram_id: int = 0
    webapp_url: str = ""
    webapp_port: int = 5173
    jwt_secret: str = "change-me-in-production"
    jwt_expire_hours: int = 24
    app_version: str = "1.0.0"
    debug: bool = False


def _detect_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


settings = Settings()


def get_webapp_url() -> str:
    """Return WEBAPP_URL from config, or auto-detect current LAN IP."""
    if settings.webapp_url:
        return settings.webapp_url.rstrip("/")
    return f"http://{_detect_lan_ip()}:{settings.webapp_port}"
