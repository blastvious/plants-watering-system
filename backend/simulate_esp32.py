#!/usr/bin/env python3
"""
ESP32 Hardware Simulator for Smart Irrigation System
Mô phỏng hoạt động phần cứng Vietduino ESP32 và các cảm biến:
- Cảm biến độ ẩm đất (Soil Moisture)
- Cảm biến mực nước bể (Water Level)
- Cảm biến nhiệt độ (Temperature)
- Relay điều khiển máy bơm R385

Khi máy bơm BẬT:
- Độ ẩm đất tăng dần (+2.5% mỗi chu kỳ)
- Mực nước trong bể giảm dần (-1.5% mỗi chu kỳ)

Khi máy bơm TẮT:
- Độ ẩm đất khô dần tự nhiên (-0.3% mỗi chu kỳ)
- Mực nước trong bể giữ nguyên
"""

import time
import random
import requests
import sys

API_URL = "http://localhost:8000/api"

def main():
    print("==================================================")
    print("   ESP32 SMART IRRIGATION HARDWARE SIMULATOR     ")
    print("==================================================")
    print(f"Connecting to Backend API: {API_URL}")
    print("Press Ctrl+C to stop simulation.\n")

    soil_moisture = 38.0  # Ban đầu đất hơi khô (< 40%)
    water_level = 80.0    # Ban đầu bể đầy nước 80%
    temperature = 29.5
    pump_state = False

    while True:
        try:
            # 1. Lấy trạng thái điều khiển hiện tại từ Backend (để biết lệnh bật/tắt bơm)
            res = requests.get(f"{API_URL}/status", timeout=3)
            if res.status_code == 200:
                status_data = res.json()
                telemetry = status_data.get("telemetry", {})
                control = status_data.get("control", {})
                pump_state = telemetry.get("pump_state", False)
                mode = control.get("mode", "auto")
            else:
                print(f"[WARN] Backend returned status code: {res.status_code}")

            # 2. Cập nhật vật lý các cảm biến dựa trên trạng thái máy bơm
            if pump_state:
                # Bơm đang chạy: nước vào đất, nước bể vơi đi
                soil_moisture = min(95.0, soil_moisture + 2.5 + random.uniform(-0.2, 0.5))
                water_level = max(0.0, water_level - 1.2 - random.uniform(-0.1, 0.2))
                pump_status_str = "\033[92m[BƠM ĐANG CHẠY]\033[0m"
            else:
                # Bơm tắt: đất khô dần, nước bể giữ nguyên
                soil_moisture = max(10.0, soil_moisture - 0.25 - random.uniform(-0.05, 0.1))
                pump_status_str = "\033[90m[Bơm Tắt]\033[0m"

            # Nhiệt độ dao động nhẹ
            temperature = round(29.0 + random.uniform(-1.0, 1.5), 1)
            soil_moisture = round(soil_moisture, 1)
            water_level = round(water_level, 1)

            # 3. Gửi dữ liệu cảm biến mới lên Backend
            payload = {
                "soil_moisture": soil_moisture,
                "water_level": water_level,
                "temperature": temperature,
                "pump_state": pump_state
            }
            post_res = requests.post(f"{API_URL}/telemetry", json=payload, timeout=3)
            
            # 4. Hiển thị thông số ra Terminal
            print(f"[ESP32 Telemetry] Đất: {soil_moisture}% | Nước: {water_level}% | Nhiệt độ: {temperature}°C | {pump_status_str} (Mode: {mode})")

        except requests.exceptions.ConnectionError:
            print("[ERROR] Không thể kết nối tới Backend FastAPI (http://localhost:8000). Hãy đảm bảo server đang chạy!")
        except Exception as e:
            print(f"[ERROR] Simulation error: {e}")

        time.sleep(2)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
        sys.exit(0)

