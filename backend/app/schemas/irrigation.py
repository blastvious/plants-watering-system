from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import time

class TelemetryData(BaseModel):
    soil_moisture: float = Field(..., description="Độ ẩm đất hiện tại (%)", ge=0.0, le=100.0)
    water_level: float = Field(..., description="Mực nước bể chứa hiện tại (%)", ge=0.0, le=100.0)
    temperature: float = Field(..., description="Nhiệt độ môi trường (°C)", ge=-20.0, le=70.0)
    pump_state: bool = Field(False, description="Trạng thái máy bơm (true: ON, false: OFF)")
    last_updated: float = Field(default_factory=time.time, description="Thời điểm cập nhật timestamp")

class ControlSettings(BaseModel):
    mode: str = Field("auto", description="Chế độ hoạt động: 'auto' hoặc 'manual'")
    pump_manual_command: bool = Field(False, description="Lệnh bật tắt thủ công khi ở chế độ manual")
    soil_threshold: float = Field(40.0, description="Ngưỡng độ ẩm kích hoạt bơm tự động (%)", ge=0.0, le=100.0)
    water_min_safety: float = Field(15.0, description="Ngưỡng mực nước tối thiểu cho phép bơm (%)", ge=0.0, le=100.0)
    max_pump_duration_seconds: int = Field(60, description="Thời gian bơm tối đa mỗi lần (giây)", ge=5, le=600)

class SystemStatus(BaseModel):
    telemetry: TelemetryData
    control: ControlSettings
    safety_warning: Optional[str] = None
    is_connected: bool = True

class PumpCommandRequest(BaseModel):
    state: bool = Field(..., description="Lệnh bật (true) hoặc tắt (false) máy bơm")

class ModeCommandRequest(BaseModel):
    mode: str = Field(..., description="Chế độ hoạt động: 'auto' hoặc 'manual'")

class ThresholdSettingsRequest(BaseModel):
    soil_threshold: Optional[float] = Field(None, ge=0.0, le=100.0)
    water_min_safety: Optional[float] = Field(None, ge=0.0, le=100.0)
    max_pump_duration_seconds: Optional[int] = Field(None, ge=5, le=600)

class HistoryRecord(BaseModel):
    timestamp: float
    soil_moisture: float
    water_level: float
    temperature: float
    pump_state: bool

