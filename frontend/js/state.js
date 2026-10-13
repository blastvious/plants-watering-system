// ==========================================
// LOGIC LAYER: central state + realtime connection (no DOM here)
// ==========================================
import { api, BACKEND_WS } from "./api.js";

let state = {
    telemetry: {
        soil_moisture: 0,
        water_level: 0,
        temperature: 0,
        pump_state: false,
        last_updated: null
    },
    control: {
        mode: "auto",
        pump_manual_command: false,
        soil_threshold: 40.0,
        water_min_safety: 15.0,
        max_pump_duration_seconds: 60
    },
    safety_warning: null
};

let connected = false;
let ws = null;
let reconnectTimer = null;

const listeners = new Set();       // called with (state) on every status update
const connectionListeners = new Set(); // called with (connected: bool)
const actionListeners = new Set(); // called with ({success, message}) on ACTION_RESULT from WS

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
export function onConnectionChange(fn) {
    connectionListeners.add(fn);
    return () => connectionListeners.delete(fn);
}
export function onActionResult(fn) {
    actionListeners.add(fn);
    return () => actionListeners.delete(fn);
}

export function getState() {
    return state;
}

function applyStatus(data) {
    state = data;
    listeners.forEach((fn) => fn(state));
}

function setConnected(value) {
    connected = value;
    connectionListeners.forEach((fn) => fn(connected));
}

async function fetchInitialStatus() {
    try {
        applyStatus(await api.getStatus());
    } catch (e) {
        console.error("Failed to fetch initial status:", e);
    }
}

function connectWebSocket() {
    const wsUrl = `${BACKEND_WS}/api/ws`;
    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("WebSocket connected to IoT backend");
            setConnected(true);
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === "STATUS_UPDATE" && message.data) {
                    applyStatus(message.data);
                } else if (message.type === "ACTION_RESULT" && message.data) {
                    actionListeners.forEach((fn) => fn(message.data));
                }
            } catch (err) {
                console.error("Error parsing WS message:", err);
            }
        };

        ws.onclose = () => {
            console.warn("WebSocket closed. Attempting reconnect in 3s...");
            setConnected(false);
            scheduleReconnect();
        };

        ws.onerror = (err) => {
            console.error("WebSocket error:", err);
            ws.close();
        };
    } catch (e) {
        console.error("Could not initialize WebSocket:", e);
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connectWebSocket();
        }, 3000);
    }
}

// Entry point: start realtime connection + polling fallback
export function connect() {
    fetchInitialStatus();
    connectWebSocket();

    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            fetchInitialStatus();
        }
    }, 5000);
}

// ---- User actions (logic only, UI reacts via subscribe/onActionResult) ----
// ---- User actions (logic only, UI reacts via subscribe/onActionResult) ----

export async function togglePumpAction() {
    const nextState = !state.telemetry.pump_state;
    const isAutoMode = state.control.mode === "auto";

    // 1. Nếu đang ở Auto, chuyển trạng thái UI sang Manual + đổi trạng thái bơm
    const updatedControl = isAutoMode 
        ? { ...state.control, mode: "manual" } 
        : state.control;

    applyStatus({
        ...state,
        control: updatedControl,
        telemetry: {
            ...state.telemetry,
            pump_state: nextState
        }
    });

    try {
        // 2. Nếu đang Auto thì gọi API chuyển sang Manual trước
        if (isAutoMode) {
            await api.setMode("manual");
        }

        // 3. Thực thi lệnh máy bơm
        const data = await api.setPump(nextState);
        
        return { 
            message: isAutoMode 
                ? `Đã chuyển sang Chế độ Thủ công & ${nextState ? "Bật" : "Tắt"} máy bơm` 
                : data.message, 
            type: "success" 
        };
    } catch (error) {
        // Rollback nếu có lỗi
        fetchInitialStatus();
        throw error;
    }
}

export async function switchMode(mode) {
    const previousMode = state.control.mode;

    // 1. Cập nhật ngay UI sang chế độ mới
    applyStatus({
        ...state,
        control: {
            ...state.control,
            mode: mode
        }
    });

    try {
        const data = await api.setMode(mode);
        return { message: data.message, type: "success" };
    } catch (error) {
        // 2. Rollback nếu lỗi API
        applyStatus({
            ...state,
            control: {
                ...state.control,
                mode: previousMode
            }
        });
        throw error;
    }
}

export async function saveThresholds(payload) {
    // Cập nhật state ngưỡng cục bộ trước
    applyStatus({
        ...state,
        control: {
            ...state.control,
            ...payload
        }
    });

    try {
        await api.saveThresholds(payload);
        return { message: "Đã lưu cấu hình ngưỡng thành công!", type: "success" };
    } catch (error) {
        // Re-fetch lại state chuẩn từ server nếu lưu thất bại
        fetchInitialStatus();
        throw error;
    }
}