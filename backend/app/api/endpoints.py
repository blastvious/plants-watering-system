import asyncio
import json
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from app.schemas.irrigation import (
    SystemStatus,
    PumpCommandRequest,
    ModeCommandRequest,
    ThresholdSettingsRequest,
    TelemetryData,
    HistoryRecord,
    IrrigationSchedule,
    CreateScheduleRequest,
    UpdateScheduleRequest
)
from app.services.irrigation_service import irrigation_service
from app.core.firebase import firebase_manager

logger = logging.getLogger(__name__)

router = APIRouter()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Remaining: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.disconnect(dead)

manager = ConnectionManager()

# Hook firebase update events to broadcast to all web clients
def on_state_updated(state: Dict[str, Any]):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            status = irrigation_service.get_system_status().model_dump()
            asyncio.create_task(manager.broadcast({"type": "STATUS_UPDATE", "data": status}))
    except Exception as e:
        logger.debug(f"Broadcast skip: {e}")

firebase_manager.subscribe(on_state_updated)

@router.get("/status", response_model=SystemStatus)
def get_status():
    """Lấy trạng thái cảm biến và thông số hệ thống hiện tại"""
    return irrigation_service.get_system_status()

@router.post("/pump")
def set_pump(request: PumpCommandRequest):
    """Điều khiển bật/tắt máy bơm thủ công (kiểm tra an toàn mực nước)"""
    result = irrigation_service.set_pump_state(request.state)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/mode")
def set_mode(request: ModeCommandRequest):
    """Chuyển đổi chế độ hoạt động giữa Tự động (auto) và Thủ công (manual)"""
    result = irrigation_service.set_mode(request.mode)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result

@router.post("/thresholds")
def update_thresholds(request: ThresholdSettingsRequest):
    """Cập nhật các ngưỡng độ ẩm kích hoạt và ngưỡng mực nước an toàn"""
    result = irrigation_service.set_thresholds(
        soil_threshold=request.soil_threshold,
        water_min_safety=request.water_min_safety,
        max_pump_duration_seconds=request.max_pump_duration_seconds
    )
    return result

@router.post("/telemetry")
def update_telemetry(data: TelemetryData):
    """Cập nhật dữ liệu đo lường từ thiết bị ESP32 hoặc bộ mô phỏng"""
    updated = firebase_manager.update_telemetry(data.model_dump(exclude_unset=True))
    # Re-evaluate auto irrigation
    irrigation_service.evaluate_auto_irrigation()
    return {"success": True, "telemetry": updated}

@router.get("/history")
def get_history(limit: int = 30):
    """Lấy lịch sử dữ liệu cảm biến để vẽ đồ thị"""
    return irrigation_service.get_history(limit=limit)

@router.get("/schedules")
def get_schedules():
    """Lấy danh sách các lịch tưới định kỳ"""
    return irrigation_service.get_schedules()

@router.post("/schedules")
def create_schedule(request: CreateScheduleRequest):
    """Tạo mới một lịch tưới định kỳ"""
    return irrigation_service.create_schedule(request)

@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: str, request: UpdateScheduleRequest):
    """Cập nhật thông tin lịch tưới"""
    updated = irrigation_service.update_schedule(schedule_id, request)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch tưới với ID này")
    return updated

@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: str):
    """Xóa một lịch tưới định kỳ"""
    success = irrigation_service.delete_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch tưới để xóa")
    return {"success": True, "message": "Đã xóa lịch tưới thành công"}

@router.post("/schedules/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str):
    """Bật hoặc tắt nhanh trạng thái kích hoạt của lịch tưới"""
    updated = irrigation_service.toggle_schedule(schedule_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Không tìm thấy lịch tưới với ID này")
    return updated

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial status right upon connection
        init_status = irrigation_service.get_system_status().model_dump()
        await websocket.send_json({"type": "STATUS_UPDATE", "data": init_status})

        # Keep connection alive and handle incoming client requests if any
        while True:
            data = await websocket.receive_text()
            # Can receive ping or command from frontend
            try:
                msg = json.loads(data)
                if msg.get("action") == "PING":
                    await websocket.send_json({"type": "PONG"})
                elif msg.get("action") == "TOGGLE_PUMP":
                    state = msg.get("state", False)
                    res = irrigation_service.set_pump_state(state)
                    await websocket.send_json({"type": "ACTION_RESULT", "data": res})
            except Exception as ex:
                logger.error(f"Error handling ws message: {ex}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

