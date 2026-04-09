import os
from dotenv import load_dotenv

load_dotenv()


def parse_cors_origins(value: str) -> list[str]:
    if not value:
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    return [item.strip() for item in value.split(",") if item.strip()]


class Settings:
    def __init__(self) -> None:
        self.DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
        self.SECRET_KEY: str = os.getenv("SECRET_KEY", "").strip()
        self.ALGORITHM: str = os.getenv("ALGORITHM", "HS256").strip()
        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = int(
            os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
        )

        self.OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
        self.OPENAI_BASE_URL: str = os.getenv(
            "OPENAI_BASE_URL", "https://api.openai.com/v1"
        ).strip()
        self.OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4.1-mini").strip()
        self.OPENAI_EMBEDDING_MODEL: str = os.getenv(
            "OPENAI_EMBEDDING_MODEL",
            "text-embedding-3-small",
        ).strip()

        self.BACKEND_CORS_ORIGINS: list[str] = parse_cors_origins(
            os.getenv("BACKEND_CORS_ORIGINS", "")
        )

        self.MAX_UPLOAD_SIZE_BYTES: int = int(
            os.getenv("MAX_UPLOAD_SIZE_BYTES", str(10 * 1024 * 1024))
        )
        self.UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads").strip() or "uploads"

        self._validate()

    def _validate(self) -> None:
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL is required.")

        if not self.SECRET_KEY:
            raise ValueError("SECRET_KEY is required.")

        if len(self.SECRET_KEY) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long.")

        if self.ACCESS_TOKEN_EXPIRE_MINUTES <= 0:
            raise ValueError("ACCESS_TOKEN_EXPIRE_MINUTES must be greater than 0.")

        if self.MAX_UPLOAD_SIZE_BYTES <= 0:
            raise ValueError("MAX_UPLOAD_SIZE_BYTES must be greater than 0.")


settings = Settings()