import logging
import time
import asyncio
import uuid
from datetime import datetime
from typing import Dict, Any, Optional, List
from app.core.firebase import firebase_manager
from app.schemas.irrigation import (
    SystemStatus,
    TelemetryData,
    ControlSettings,
    IrrigationSchedule,
    CreateScheduleRequest,
    UpdateScheduleRequest
)

logger = logging.getLogger(__name__)

class IrrigationService:
    @staticmethod
    def get_system_status() -> SystemStatus:
        telemetry_raw = firebase_manager.get_telemetry()
        control_raw = firebase_manager.get_control()

        telemetry = TelemetryData(**telemetry_raw)
        control = ControlSettings(**control_raw)

        safety_warning = None
        # Safety Check: Water level too low
        if telemetry.water_level < control.water_min_safety:
            safety_warning = f"CẢNH BÁO: Mực nước bể ({telemetry.water_level:.1f}%) thấp hơn ngưỡng an toàn ({control.water_min_safety:.1f}%). Máy bơm bị khóa để chống cháy!"
            # Enforce pump OFF if currently ON
            if telemetry.pump_state:
                firebase_manager.update_telemetry({"pump_state": False})
                firebase_manager.update_control({"pump_manual_command": False})
                telemetry.pump_state = False

        return SystemStatus(
            telemetry=telemetry,
            control=control,
            safety_warning=safety_warning,
            is_connected=True
        )

    @staticmethod
    def set_pump_state(state: bool) -> Dict[str, Any]:
        telemetry = firebase_manager.get_telemetry()
        control = firebase_manager.get_control()

        # Safety interlock: Cannot turn ON if water is below minimum safety threshold
        water_level = telemetry.get("water_level", 0.0)
        water_min_safety = control.get("water_min_safety", 15.0)

        if state and water_level < water_min_safety:
            return {
                "success": False,
                "message": f"Không thể bật máy bơm! Mực nước bể ({water_level:.1f}%) thấp hơn mức an toàn ({water_min_safety:.1f}%). Vui lòng châm thêm nước vào bể.",
                "pump_state": False
            }

        # Update manual command in control node
        firebase_manager.update_control({"pump_manual_command": state})
        # If in manual mode, also update telemetry pump state immediately
        if control.get("mode") == "manual" or not state:
            firebase_manager.update_telemetry({"pump_state": state})

        logger.info(f"Pump state command set to: {state}")
        return {
            "success": True,
            "message": "Đã gửi lệnh bật máy bơm thành công." if state else "Đã gửi lệnh tắt máy bơm thành công.",
            "pump_state": state
        }

    @staticmethod
    def set_mode(mode: str) -> Dict[str, Any]:
        mode = mode.lower()
        if mode not in ["auto", "manual"]:
            return {
                "success": False,
                "message": "Chế độ không hợp lệ. Chọn 'auto' hoặc 'manual'."
            }

        firebase_manager.update_control({"mode": mode})

        # When switching to auto mode, evaluate auto irrigation immediately
        if mode == "auto":
            IrrigationService.evaluate_auto_irrigation()

        logger.info(f"System mode set to: {mode}")
        return {
            "success": True,
            "message": f"Đã chuyển sang chế độ {'Tự động (Auto)' if mode == 'auto' else 'Thủ công (Manual)'}.",
            "mode": mode
        }

    @staticmethod
    def set_thresholds(
        soil_threshold: Optional[float] = None,
        water_min_safety: Optional[float] = None,
        max_pump_duration_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        update_data = {}
        if soil_threshold is not None:
            update_data["soil_threshold"] = soil_threshold
        if water_min_safety is not None:
            update_data["water_min_safety"] = water_min_safety
        if max_pump_duration_seconds is not None:
            update_data["max_pump_duration_seconds"] = max_pump_duration_seconds

        if update_data:
            firebase_manager.update_control(update_data)
            # Re-evaluate auto logic if in auto mode
            control = firebase_manager.get_control()
            if control.get("mode") == "auto":
                IrrigationService.evaluate_auto_irrigation()

        return {
            "success": True,
            "message": "Cập nhật ngưỡng thành công.",
            "control": firebase_manager.get_control()
        }

    @staticmethod
    def evaluate_auto_irrigation():
        """Evaluates auto logic based on telemetry and thresholds"""
        telemetry = firebase_manager.get_telemetry()
        control = firebase_manager.get_control()

        if control.get("mode") != "auto":
            return

        soil_moisture = telemetry.get("soil_moisture", 50.0)
        water_level = telemetry.get("water_level", 0.0)
        soil_threshold = control.get("soil_threshold", 40.0)
        water_min_safety = control.get("water_min_safety", 15.0)
        current_pump_state = telemetry.get("pump_state", False)

        # Condition to turn pump ON:
        # Soil moisture is below threshold AND water level is above safety minimum
        if soil_moisture < soil_threshold and water_level >= water_min_safety:
            if not current_pump_state:
                logger.info(f"Auto mode: soil moisture {soil_moisture}% < {soil_threshold}%. Turning pump ON.")
                firebase_manager.update_telemetry({"pump_state": True})
                firebase_manager.update_control({"pump_manual_command": True})

        # Condition to turn pump OFF:
        # Soil moisture reached target (soil_threshold + 10% hysteresis) OR water level is critically low
        elif (soil_moisture >= (soil_threshold + 10.0)) or (water_level < water_min_safety):
            if current_pump_state:
                reason = "Water level critically low" if water_level < water_min_safety else "Soil moisture target reached"
                logger.info(f"Auto mode: turning pump OFF. Reason: {reason}.")
                firebase_manager.update_telemetry({"pump_state": False})
                firebase_manager.update_control({"pump_manual_command": False})

    @staticmethod
    def get_history(limit: int = 50):
        return firebase_manager.get_history(limit=limit)

    @staticmethod
    def get_schedules() -> List[Dict[str, Any]]:
        schedules_dict = firebase_manager.get_schedules()
        return list(schedules_dict.values())

    @staticmethod
    def create_schedule(data: CreateScheduleRequest) -> Dict[str, Any]:
        sched_id = f"sched_{uuid.uuid4().hex[:6]}"
        schedule_item = {
            "id": sched_id,
            "name": data.name,
            "time": data.time,
            "duration_seconds": data.duration_seconds,
            "days_of_week": data.days_of_week,
            "enabled": data.enabled,
            "last_run": None
        }
        return firebase_manager.save_schedule(schedule_item)

    @staticmethod
    def update_schedule(schedule_id: str, data: UpdateScheduleRequest) -> Optional[Dict[str, Any]]:
        schedules = firebase_manager.get_schedules()
        if schedule_id not in schedules:
            return None
        item = schedules[schedule_id]
        if data.name is not None:
            item["name"] = data.name
        if data.time is not None:
            item["time"] = data.time
        if data.duration_seconds is not None:
            item["duration_seconds"] = data.duration_seconds
        if data.days_of_week is not None:
            item["days_of_week"] = data.days_of_week
        if data.enabled is not None:
            item["enabled"] = data.enabled
        return firebase_manager.save_schedule(item)

    @staticmethod
    def toggle_schedule(schedule_id: str) -> Optional[Dict[str, Any]]:
        schedules = firebase_manager.get_schedules()
        if schedule_id not in schedules:
            return None
        item = schedules[schedule_id]
        item["enabled"] = not item.get("enabled", False)
        return firebase_manager.save_schedule(item)

    @staticmethod
    def delete_schedule(schedule_id: str) -> bool:
        return firebase_manager.delete_schedule(schedule_id)

    @staticmethod
    async def _delayed_pump_off(duration_seconds: int, schedule_name: str):
        """Tự động tắt máy bơm sau khi chạy hết thời lượng lịch tưới"""
        try:
            logger.info(f"Schedule '{schedule_name}': Đang tưới trong {duration_seconds}s...")
            await asyncio.sleep(duration_seconds)
            logger.info(f"Schedule '{schedule_name}': Hết thời gian tưới {duration_seconds}s. Tắt máy bơm.")
            IrrigationService.set_pump_state(False)
        except asyncio.CancelledError:
            logger.info(f"Schedule '{schedule_name}': Delayed pump off cancelled.")
            IrrigationService.set_pump_state(False)
        except Exception as e:
            logger.error(f"Error in _delayed_pump_off: {e}")
            IrrigationService.set_pump_state(False)

    @staticmethod
    async def check_and_run_schedules():
        """Hàm kiểm tra lịch tưới chạy ngầm định kỳ"""
        now = datetime.now()
        current_time_str = now.strftime("%H:%M")
        current_weekday = now.weekday()  # 0=Monday, 6=Sunday
        now_ts = time.time()

        schedules = firebase_manager.get_schedules()
        for sched_id, item in list(schedules.items()):
            if not item.get("enabled", False):
                continue

            days = item.get("days_of_week", [])
            if current_weekday not in days:
                continue

            sched_time = item.get("time")
            if sched_time != current_time_str:
                continue

            last_run = item.get("last_run")
            # Ngăn chạy lặp lại trong cùng 1 phút (chỉ chạy nếu chưa chạy hoặc cách hơn 65 giây)
            if last_run and (now_ts - last_run) < 65:
                continue

            # Kiểm tra an toàn mực nước bể
            telemetry = firebase_manager.get_telemetry()
            control = firebase_manager.get_control()
            water_level = telemetry.get("water_level", 0.0)
            water_min_safety = control.get("water_min_safety", 15.0)

            sched_name = item.get("name", sched_id)
            duration = item.get("duration_seconds", 60)

            # Cập nhật last_run ngay để không kích hoạt trùng
            item["last_run"] = now_ts
            firebase_manager.save_schedule(item)

            if water_level < water_min_safety:
                logger.warning(
                    f"Lịch '{sched_name}' bị bỏ qua vì mực nước bể ({water_level:.1f}%) < mức an toàn ({water_min_safety:.1f}%)!"
                )
                continue

            logger.info(f"KÍCH HOẠT LỊCH TƯỚI: '{sched_name}' ({current_time_str}) trong {duration}s!")
            # Bật máy bơm
            res = IrrigationService.set_pump_state(True)
            if res.get("success"):
                # Hẹn giờ tắt máy bơm
                asyncio.create_task(IrrigationService._delayed_pump_off(duration, sched_name))

irrigation_service = IrrigationService()

