from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """Application settings."""

    # API
    API_TITLE: str = "KlimatPolski API"
    API_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # AWS S3
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = "klimatpolski-data"
    AWS_REGION: str = "eu-central-1"

    # Copernicus CDS
    COPERNICUS_UID: str = ""
    COPERNICUS_PASSWORD: str = ""
    CDS_CACHE_DIR: str = str(Path.home() / ".cache" / "cds")

    # Data processing
    DATA_DIR: str = "data"
    CACHE_DIR: str = ".cache"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
