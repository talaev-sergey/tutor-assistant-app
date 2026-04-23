from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./app.db"
    bot_token: str = ""
    admin_telegram_id: int = 0
    webapp_url: str = ""
    jwt_secret: str = "change-me-in-production"
    jwt_expire_hours: int = 24
    app_version: str = "1.0.0"
    debug: bool = False


settings = Settings()
