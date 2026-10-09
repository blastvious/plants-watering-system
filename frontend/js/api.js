// ==========================================
// LOGIC LAYER: API client (pure network, no DOM)
// ==========================================

// Automatically detect Backend host:
// If running on FastAPI (port 8000), use relative URLs.
// If running as standalone frontend (Live Server, port 5500/3000/etc.), point to http://localhost:8000.
const isBackendHost = window.location.port === "8000";
export const BACKEND_HTTP = isBackendHost ? "" : "http://localhost:8000";
export const BACKEND_WS = isBackendHost
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8000";

async function request(path, options = {}) {
    const res = await fetch(`${BACKEND_HTTP}${path}`, {
        headers: { "Content-Type": "application/json" },
        ...options
    });
    let data = null;
    try { data = await res.json(); } catch { /* no JSON body, e.g. some DELETE responses */ }
    if (!res.ok) {
        throw new Error(data?.detail || "Yêu cầu thất bại!");
    }
    return data;
}

export const api = {
    getStatus: () => request("/api/status"),
    getHistory: (limit = 25) => request(`/api/history?limit=${limit}`),

    setPump: (state) => request("/api/pump", { method: "POST", body: JSON.stringify({ state }) }),
    setMode: (mode) => request("/api/mode", { method: "POST", body: JSON.stringify({ mode }) }),
    saveThresholds: (payload) => request("/api/thresholds", { method: "POST", body: JSON.stringify(payload) }),

    getSchedules: () => request("/api/schedules"),
    createSchedule: (payload) => request("/api/schedules", { method: "POST", body: JSON.stringify(payload) }),
    updateSchedule: (id, payload) => request(`/api/schedules/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    deleteSchedule: (id) => request(`/api/schedules/${id}`, { method: "DELETE" }),
    toggleSchedule: (id) => request(`/api/schedules/${id}/toggle`, { method: "POST" })
};
