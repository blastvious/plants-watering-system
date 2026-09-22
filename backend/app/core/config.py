import os
from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Irrigation System NT131"
    API_V1_STR: str = "/api"
    
    # Firebase configuration
    FIREBASE_DATABASE_URL: str = os.getenv("FIREBASE_DATABASE_URL", "https://plants-watering-8cb40-default-rtdb.firebaseio.com")
    FIREBASE_CREDENTIALS_PATH: Optional[str] = os.getenv("FIREBASE_CREDENTIALS_PATH", "serviceAccountKey.json")
    USE_MOCK_FIREBASE: bool = os.getenv("USE_MOCK_FIREBASE", "false").lower() in ("true", "1", "yes")

    # Safety limits
    DEFAULT_SOIL_THRESHOLD: float = 40.0       # Activate pump if soil moisture < 40%
    DEFAULT_WATER_MIN_SAFETY: float = 15.0     # Disallow pumping if tank water < 15%
    DEFAULT_MAX_PUMP_SECONDS: int = 60         # Cutoff pump after 60 seconds continuous run

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

