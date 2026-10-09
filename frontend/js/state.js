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

export async function togglePumpAction() {
    const nextState = !state.telemetry.pump_state;
    const data = await api.setPump(nextState);
    return { message: data.message, type: nextState ? "success" : "info" };
}

export async function switchMode(mode) {
    const data = await api.setMode(mode);
    return { message: data.message, type: "success" };
}

export async function saveThresholds(payload) {
    await api.saveThresholds(payload);
    return { message: "Đã lưu cấu hình ngưỡng thành công!", type: "success" };
}
