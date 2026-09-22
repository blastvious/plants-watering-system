import logging
import os
import time
from typing import Dict, Any, Optional, List, Callable
import firebase_admin
from firebase_admin import credentials, db
from app.core.config import settings

logger = logging.getLogger(__name__)

class FirebaseManager:
    def __init__(self):
        self.is_initialized = False
        self.mock_mode = settings.USE_MOCK_FIREBASE
        self.db_ref = None
        self._listeners: List[Callable[[Dict[str, Any]], None]] = []

        # Local in-memory state (used for fallback or cache)
        self._local_state = {
            "telemetry": {
                "soil_moisture": 42.5,
                "water_level": 75.0,
                "temperature": 28.5,
                "pump_state": False,
                "last_updated": time.time()
            },
            "control": {
                "mode": "auto",
                "pump_manual_command": False,
                "soil_threshold": settings.DEFAULT_SOIL_THRESHOLD,
                "water_min_safety": settings.DEFAULT_WATER_MIN_SAFETY,
                "max_pump_duration_seconds": settings.DEFAULT_MAX_PUMP_SECONDS
            },
            "history": [],
            "schedules": {
                "sched_01": {
                    "id": "sched_01",
                    "name": "Tưới buổi sáng",
                    "time": "06:30",
                    "duration_seconds": 60,
                    "days_of_week": [0, 1, 2, 3, 4, 5, 6],
                    "enabled": True,
                    "last_run": None
                },
                "sched_02": {
                    "id": "sched_02",
                    "name": "Tưới chiều mát",
                    "time": "17:30",
                    "duration_seconds": 45,
                    "days_of_week": [0, 1, 2, 3, 4, 5, 6],
                    "enabled": False,
                    "last_run": None
                }
            }
        }

        self.initialize()

    def initialize(self):
        cred_path = settings.FIREBASE_CREDENTIALS_PATH
        db_url = settings.FIREBASE_DATABASE_URL

        # Auto-detect Firebase credential JSON file
        actual_cred_path = None
        search_dirs = [
            os.getcwd(),
            os.path.dirname(os.path.dirname(os.path.dirname(__file__))), # backend dir
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))) # root dir
        ]
        if cred_path and os.path.exists(cred_path):
            actual_cred_path = cred_path
        else:
            for s_dir in search_dirs:
                if os.path.isdir(s_dir):
                    for fname in os.listdir(s_dir):
                        if fname.endswith(".json") and ("firebase-adminsdk" in fname or fname == "serviceAccountKey.json"):
                            actual_cred_path = os.path.join(s_dir, fname)
                            break
                if actual_cred_path:
                    break

        # Check if credentials file exists and real mode is requested
        if not self.mock_mode and actual_cred_path and os.path.exists(actual_cred_path):
            try:
                if not firebase_admin._apps:
                    cred = credentials.Certificate(actual_cred_path)
                    firebase_admin.initialize_app(cred, {
                        'databaseURL': db_url
                    })
                self.db_ref = db.reference('irrigation_system')
                self.is_initialized = True
                self.mock_mode = False
                logger.info(f"Firebase Admin SDK initialized successfully using key: {os.path.basename(actual_cred_path)}")

                # Sync initial schema if empty
                snapshot = self.db_ref.get()
                if not snapshot:
                    logger.info("Firebase empty. Uploading initial local state...")
                    self.db_ref.set(self._local_state)
                else:
                    logger.info("Syncing state from Firebase Cloud...")
                    if isinstance(snapshot, dict):
                        self._local_state.update(snapshot)
                # Start Firebase live listener
                self._start_firebase_listener()
                return
            except Exception as e:
                logger.error(f"Failed to initialize Firebase Admin SDK: {e}. Falling back to simulation mode.")

        # Fallback / Mock mode
        self.mock_mode = True
        self.is_initialized = True
        logger.warning("Operating in MOCK/SIMULATION mode. Connect Firebase credentials file to switch to live cloud database.")

    def _start_firebase_listener(self):
        """Listen to realtime updates on Firebase RTDB"""
        if self.db_ref:
            def listener(event):
                try:
                    path = event.path
                    data = event.data
                    if path == "/":
                        if isinstance(data, dict):
                            self._local_state.update(data)
                    elif path.startswith("/telemetry"):
                        key = path.replace("/telemetry/", "").strip("/")
                        if key and isinstance(self._local_state["telemetry"], dict):
                            self._local_state["telemetry"][key] = data
                        elif not key and isinstance(data, dict):
                            self._local_state["telemetry"] = data
                    elif path.startswith("/control"):
                        key = path.replace("/control/", "").strip("/")
                        if key and isinstance(self._local_state["control"], dict):
                            self._local_state["control"][key] = data
                        elif not key and isinstance(data, dict):
                            self._local_state["control"] = data
                    elif path.startswith("/schedules"):
                        key = path.replace("/schedules/", "").strip("/")
                        if key:
                            if data is None:
                                self._local_state.get("schedules", {}).pop(key, None)
                            else:
                                self._local_state.setdefault("schedules", {})[key] = data
                        elif isinstance(data, dict):
                            self._local_state["schedules"] = data

                    self._notify_subscribers()
                except Exception as ex:
                    logger.error(f"Error in Firebase listener event: {ex}")

            try:
                self.db_ref.listen(listener)
            except Exception as e:
                logger.error(f"Could not attach Firebase live listener: {e}")

    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        """Register a callback for updates (e.g. WebSocket pusher)"""
        self._listeners.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], None]):
        if callback in self._listeners:
            self._listeners.remove(callback)

    def _notify_subscribers(self):
        for listener in self._listeners:
            try:
                listener(self.get_full_state())
            except Exception as e:
                logger.error(f"Error notifying subscriber: {e}")

    def get_full_state(self) -> Dict[str, Any]:
        if not self.mock_mode and self.db_ref:
            try:
                remote_data = self.db_ref.get()
                if remote_data:
                    self._local_state.update(remote_data)
            except Exception as e:
                logger.error(f"Error reading from Firebase: {e}")
        return self._local_state

    def get_telemetry(self) -> Dict[str, Any]:
        state = self.get_full_state()
        return state.get("telemetry", {})

    def update_telemetry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        data["last_updated"] = time.time()
        self._local_state["telemetry"].update(data)

        if not self.mock_mode and self.db_ref:
            try:
                self.db_ref.child("telemetry").update(data)
            except Exception as e:
                logger.error(f"Failed to update telemetry to Firebase: {e}")

        # Add to history
        self.add_history_record({
            "timestamp": data["last_updated"],
            "soil_moisture": data.get("soil_moisture", self._local_state["telemetry"]["soil_moisture"]),
            "water_level": data.get("water_level", self._local_state["telemetry"]["water_level"]),
            "temperature": data.get("temperature", self._local_state["telemetry"]["temperature"]),
            "pump_state": data.get("pump_state", self._local_state["telemetry"]["pump_state"])
        })

        self._notify_subscribers()
        return self._local_state["telemetry"]

    def get_control(self) -> Dict[str, Any]:
        state = self.get_full_state()
        return state.get("control", {})

    def update_control(self, data: Dict[str, Any]) -> Dict[str, Any]:
        self._local_state["control"].update(data)

        if not self.mock_mode and self.db_ref:
            try:
                self.db_ref.child("control").update(data)
            except Exception as e:
                logger.error(f"Failed to update control to Firebase: {e}")

        self._notify_subscribers()
        return self._local_state["control"]

    def add_history_record(self, record: Dict[str, Any]):
        history: List = self._local_state.setdefault("history", [])
        history.append(record)
        # Keep last 100 entries
        if len(history) > 100:
            self._local_state["history"] = history[-100:]

        if not self.mock_mode and self.db_ref:
            try:
                # Push with timestamp
                self.db_ref.child("history").push(record)
            except Exception as e:
                logger.error(f"Failed to push history record to Firebase: {e}")

    def get_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        history = self._local_state.get("history", [])
        if isinstance(history, dict):
            # Firebase push keys converted to list
            records = list(history.values())
        else:
            records = list(history)
        return records[-limit:]

    def get_schedules(self) -> Dict[str, Dict[str, Any]]:
        return self._local_state.get("schedules", {})

    def save_schedule(self, schedule: Dict[str, Any]) -> Dict[str, Any]:
        sched_id = schedule.get("id")
        if not sched_id:
            return {}
        schedules = self._local_state.setdefault("schedules", {})
        schedules[sched_id] = schedule

        if not self.mock_mode and self.db_ref:
            try:
                self.db_ref.child("schedules").child(sched_id).set(schedule)
            except Exception as e:
                logger.error(f"Failed to save schedule to Firebase: {e}")

        self._notify_subscribers()
        return schedule

    def delete_schedule(self, schedule_id: str) -> bool:
        schedules = self._local_state.get("schedules", {})
        if schedule_id in schedules:
            del schedules[schedule_id]

            if not self.mock_mode and self.db_ref:
                try:
                    self.db_ref.child("schedules").child(schedule_id).delete()
                except Exception as e:
                    logger.error(f"Failed to delete schedule from Firebase: {e}")

            self._notify_subscribers()
            return True
        return False

firebase_manager = FirebaseManager()

