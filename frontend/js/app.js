// Smart Irrigation Dashboard JavaScript Client

// Automatically detect Backend host:
// If running on FastAPI (port 8000), use relative URLs.
// If running as standalone frontend (Live Server, port 5500/3000/etc.), point to http://localhost:8000.
const isBackendHost = window.location.port === "8000";
const BACKEND_HTTP = isBackendHost ? "" : "http://localhost:8000";
const BACKEND_WS = isBackendHost 
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`
    : "ws://localhost:8000";

let systemState = {
    telemetry: {
        soil_moisture: 0,
        water_level: 0,
        temperature: 0,
        pump_state: false,
        last_updated: Date.now() / 1000
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

let ws = null;
let reconnectTimer = null;
let moistureChartInstance = null;
let temperatureChartInstance = null;

// Initialize when DOM ready
document.addEventListener("DOMContentLoaded", () => {
    initCharts();
    fetchInitialStatus();
    fetchHistoryData();
    connectWebSocket();

    // Fallback polling every 5s in case WebSocket drops
    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            fetchInitialStatus();
        }
    }, 5000);
});

// Toast notification helper
function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `pointer-events-auto flex items-center p-3.5 rounded-xl border text-xs font-semibold shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 max-w-sm `;

    let icon = "fa-circle-info";
    if (type === "success") {
        toast.className += "bg-emerald-950/90 border-emerald-500/40 text-emerald-200";
        icon = "fa-circle-check";
    } else if (type === "danger" || type === "error") {
        toast.className += "bg-red-950/90 border-red-500/40 text-red-200";
        icon = "fa-circle-xmark";
    } else if (type === "warning") {
        toast.className += "bg-amber-950/90 border-amber-500/40 text-amber-200";
        icon = "fa-triangle-exclamation";
    } else {
        toast.className += "bg-slate-900/95 border-slate-700 text-slate-200";
    }

    toast.innerHTML = `
        <i class="fa-solid ${icon} mr-2.5 text-base"></i>
        <div class="flex-1">${message}</div>
    `;

    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
    }, 50);

    setTimeout(() => {
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Fetch Initial System Status
async function fetchInitialStatus() {
    try {
        const res = await fetch(`${BACKEND_HTTP}/api/status`);
        if (res.ok) {
            const data = await res.json();
            updateUI(data);
        }
    } catch (e) {
        console.error("Failed to fetch initial status:", e);
    }
}

// Fetch History Data for Chart.js
async function fetchHistoryData() {
    try {
        const res = await fetch(`${BACKEND_HTTP}/api/history?limit=25`);
        if (res.ok) {
            const history = await res.json();
            if (history && history.length > 0) {
                history.forEach(item => {
                    const timeStr = new Date(item.timestamp * 1000).toLocaleTimeString();
                    addChartDataPoint(timeStr, item.soil_moisture, item.water_level, item.temperature, false);
                });
                moistureChartInstance.update();
                temperatureChartInstance.update();
            }
        }
    } catch (e) {
        console.error("Failed to fetch history:", e);
    }
}

// Connect WebSocket for real-time updates
function connectWebSocket() {
    const wsUrl = `${BACKEND_WS}/api/ws`;

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("WebSocket connected to IoT backend");
            updateConnectionBadge(true);
            if (reconnectTimer) {
                clearInterval(reconnectTimer);
                reconnectTimer = null;
            }
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === "STATUS_UPDATE" && message.data) {
                    updateUI(message.data);
                } else if (message.type === "ACTION_RESULT" && message.data) {
                    if (!message.data.success) {
                        showToast(message.data.message, "danger");
                    }
                }
            } catch (err) {
                console.error("Error parsing WS message:", err);
            }
        };

        ws.onclose = () => {
            console.warn("WebSocket closed. Attempting reconnect in 3s...");
            updateConnectionBadge(false);
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

function updateConnectionBadge(connected) {
    const badge = document.getElementById("connectionStatus");
    const text = document.getElementById("connectionText");
    if (!badge || !text) return;

    if (connected) {
        badge.className = "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400";
        text.innerText = "Trực tuyến (Realtime)";
    } else {
        badge.className = "flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400";
        text.innerText = "Đang kết nối lại...";
    }
}

// Update all UI components
function updateUI(status) {
    systemState = status;
    const { telemetry, control, safety_warning } = status;

    // 1. Soil Moisture
    const soilVal = telemetry.soil_moisture !== undefined ? telemetry.soil_moisture.toFixed(1) : "--";
    document.getElementById("valSoilMoisture").innerText = soilVal;
    document.getElementById("barSoilMoisture").style.width = `${Math.min(100, Math.max(0, telemetry.soil_moisture))}%`;

    const soilBadge = document.getElementById("soilStatusBadge");
    if (telemetry.soil_moisture < control.soil_threshold) {
        soilBadge.innerHTML = `<span class="text-amber-400 font-semibold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Đất khô (Cần tưới)</span>`;
    } else {
        soilBadge.innerHTML = `<span class="text-emerald-400 font-semibold"><i class="fa-solid fa-check mr-1"></i>Đủ độ ẩm</span>`;
    }
    document.getElementById("lblSoilThreshold").innerText = `${control.soil_threshold}%`;

    // 2. Water Level
    const waterVal = telemetry.water_level !== undefined ? telemetry.water_level.toFixed(1) : "--";
    document.getElementById("valWaterLevel").innerText = waterVal;
    document.getElementById("barWaterLevel").style.width = `${Math.min(100, Math.max(0, telemetry.water_level))}%`;

    const waterBadge = document.getElementById("waterStatusBadge");
    const safetyBanner = document.getElementById("safetyBanner");
    const safetyMsg = document.getElementById("safetyMessage");

    if (telemetry.water_level < control.water_min_safety) {
        waterBadge.innerHTML = `<span class="text-red-400 font-semibold"><i class="fa-solid fa-circle-exclamation mr-1"></i>Bể sắp cạn!</span>`;
        if (safetyBanner) {
            safetyBanner.classList.remove("hidden");
            if (safety_warning) safetyMsg.innerText = safety_warning;
        }
    } else {
        waterBadge.innerHTML = `<span class="text-blue-400 font-semibold"><i class="fa-solid fa-check mr-1"></i>Bể nước an toàn</span>`;
        if (safetyBanner) {
            safetyBanner.classList.add("hidden");
        }
    }
    document.getElementById("lblWaterSafety").innerText = `> ${control.water_min_safety}%`;

    // 3. Temperature
    const tempVal = telemetry.temperature !== undefined ? telemetry.temperature.toFixed(1) : "--";
    document.getElementById("valTemperature").innerText = tempVal;
    const tempPct = Math.min(100, Math.max(0, ((telemetry.temperature - 10) / 40) * 100));
    document.getElementById("barTemperature").style.width = `${tempPct}%`;

    // 4. Pump Status
    const isPumpOn = telemetry.pump_state;
    const valPumpState = document.getElementById("valPumpState");
    const pumpIconBox = document.getElementById("pumpIconBox");
    const pumpFanIcon = document.getElementById("pumpFanIcon");
    const relayStateBadge = document.getElementById("relayStateBadge");
    const btnTogglePump = document.getElementById("btnTogglePump");
    const btnPumpIcon = document.getElementById("btnPumpIcon");
    const btnPumpText = document.getElementById("btnPumpText");

    if (isPumpOn) {
        valPumpState.innerText = "ĐANG BƠM";
        valPumpState.className = "text-2xl font-extrabold text-emerald-400 animate-pulse";
        pumpIconBox.className = "w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/30";
        pumpFanIcon.classList.add("pump-spinning");

        relayStateBadge.innerText = "Đóng điện (Active)";
        relayStateBadge.className = "px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";

        // Button state
        btnTogglePump.className = "w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center space-x-2 transition-all duration-200 bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20";
        btnPumpIcon.className = "fa-solid fa-stop";
        btnPumpText.innerText = "DỪNG MÁY BƠM";
    } else {
        valPumpState.innerText = "ĐANG TẮT";
        valPumpState.className = "text-2xl font-extrabold text-slate-400";
        pumpIconBox.className = "w-9 h-9 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center";
        pumpFanIcon.classList.remove("pump-spinning");

        relayStateBadge.innerText = "Ngắt điện (Idle)";
        relayStateBadge.className = "px-2 py-0.5 rounded text-xs font-semibold bg-slate-800 text-slate-400";

        // Button state
        btnTogglePump.className = "w-full py-3.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center space-x-2 transition-all duration-200 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20";
        btnPumpIcon.className = "fa-solid fa-power-off";
        btnPumpText.innerText = "BẬT MÁY BƠM";
    }

    // 5. Mode Switchers
    const isAuto = control.mode === "auto";
    const btnModeAuto = document.getElementById("btnModeAuto");
    const btnModeManual = document.getElementById("btnModeManual");
    const currentModeBadge = document.getElementById("currentModeBadge");
    const modeDesc = document.getElementById("modeDescription");

    if (isAuto) {
        btnModeAuto.className = "py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 bg-blue-600 text-white shadow-md shadow-blue-500/20";
        btnModeManual.className = "py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 text-slate-400 hover:text-white";
        currentModeBadge.innerText = "Tự động (Auto)";
        currentModeBadge.className = "text-blue-400 font-semibold uppercase";
        modeDesc.innerHTML = `Chế độ <b>Tự động</b>: ESP32 sẽ tự kích hoạt máy bơm khi độ ẩm đất &lt; <b>${control.soil_threshold}%</b> và bể còn nước an toàn.`;
    } else {
        btnModeManual.className = "py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 bg-blue-600 text-white shadow-md shadow-blue-500/20";
        btnModeAuto.className = "py-2 px-3 rounded-lg text-xs font-bold transition-all duration-200 text-slate-400 hover:text-white";
        currentModeBadge.innerText = "Thủ công (Manual)";
        currentModeBadge.className = "text-amber-400 font-semibold uppercase";
        modeDesc.innerHTML = `Chế độ <b>Thủ công</b>: Máy bơm chỉ hoạt động khi bạn nhấn nút bật/tắt bên dưới.`;
    }

    // 6. Settings Inputs (only update if user is not actively dragging slider)
    if (document.activeElement !== document.getElementById("inputSoilThreshold")) {
        document.getElementById("inputSoilThreshold").value = control.soil_threshold;
        document.getElementById("dispSoilThreshold").innerText = `${control.soil_threshold}%`;
    }
    if (document.activeElement !== document.getElementById("inputWaterSafety")) {
        document.getElementById("inputWaterSafety").value = control.water_min_safety;
        document.getElementById("dispWaterSafety").innerText = `${control.water_min_safety}%`;
    }
    if (document.activeElement !== document.getElementById("inputMaxDuration")) {
        document.getElementById("inputMaxDuration").value = control.max_pump_duration_seconds;
        document.getElementById("dispMaxDuration").innerText = `${control.max_pump_duration_seconds}s`;
    }

    // 7. Last updated timestamp
    if (telemetry.last_updated) {
        const timeObj = new Date(telemetry.last_updated * 1000);
        document.getElementById("lastUpdated").innerText = timeObj.toLocaleTimeString();

        // Update charts with live point
        addChartDataPoint(
            timeObj.toLocaleTimeString(),
            telemetry.soil_moisture,
            telemetry.water_level,
            telemetry.temperature,
            true
        );
    }
}

// Chart.js initialization
function initCharts() {
    const ctxMoisture = document.getElementById("moistureChart").getContext("2d");
    const ctxTemp = document.getElementById("temperatureChart").getContext("2d");

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: {
                labels: { color: "#94a3b8", font: { size: 11, family: "sans-serif" } }
            }
        },
        scales: {
            x: {
                grid: { color: "rgba(51, 65, 85, 0.3)" },
                ticks: { color: "#64748b", maxRotation: 0, font: { size: 10 } }
            },
            y: {
                grid: { color: "rgba(51, 65, 85, 0.3)" },
                ticks: { color: "#64748b", font: { size: 10 } }
            }
        }
    };

    moistureChartInstance = new Chart(ctxMoisture, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "Độ ẩm đất (%)",
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    data: []
                },
                {
                    label: "Mực nước bể (%)",
                    borderColor: "#3b82f6",
                    backgroundColor: "rgba(59, 130, 246, 0.05)",
                    borderWidth: 2,
                    borderDash: [4, 4],
                    tension: 0.3,
                    data: []
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 0, max: 100 }
            }
        }
    });

    temperatureChartInstance = new Chart(ctxTemp, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                {
                    label: "Nhiệt độ (°C)",
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    data: []
                }
            ]
        },
        options: {
            ...commonOptions,
            scales: {
                ...commonOptions.scales,
                y: { ...commonOptions.scales.y, min: 15, max: 50 }
            }
        }
    });
}

function addChartDataPoint(timeLabel, soil, water, temp, update = true) {
    if (!moistureChartInstance || !temperatureChartInstance) return;

    // Prevent duplicate timestamps in chart
    const labels = moistureChartInstance.data.labels;
    if (labels.length > 0 && labels[labels.length - 1] === timeLabel) {
        return;
    }

    if (labels.length > 25) {
        labels.shift();
        moistureChartInstance.data.datasets[0].data.shift();
        moistureChartInstance.data.datasets[1].data.shift();

        temperatureChartInstance.data.labels.shift();
        temperatureChartInstance.data.datasets[0].data.shift();
    }

    labels.push(timeLabel);
    moistureChartInstance.data.datasets[0].data.push(soil);
    moistureChartInstance.data.datasets[1].data.push(water);

    temperatureChartInstance.data.labels.push(timeLabel);
    temperatureChartInstance.data.datasets[0].data.push(temp);

    if (update) {
        moistureChartInstance.update();
        temperatureChartInstance.update();
    }
}

// User Actions
async function togglePumpAction() {
    const currentState = systemState.telemetry.pump_state;
    const nextState = !currentState;

    try {
        const res = await fetch(`${BACKEND_HTTP}/api/pump`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ state: nextState })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(data.message, nextState ? "success" : "info");
        } else {
            showToast(data.detail || "Thao tác thất bại!", "danger");
        }
    } catch (e) {
        console.error("Error toggling pump:", e);
        showToast("Lỗi kết nối máy chủ!", "danger");
    }
}

async function switchMode(mode) {
    try {
        const res = await fetch(`${BACKEND_HTTP}/api/mode`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: mode })
        });

        const data = await res.json();
        if (res.ok) {
            showToast(data.message, "success");
        } else {
            showToast(data.detail || "Chuyển chế độ thất bại!", "danger");
        }
    } catch (e) {
        console.error("Error switching mode:", e);
        showToast("Lỗi kết nối máy chủ!", "danger");
    }
}

async function saveThresholds() {
    const soil = parseFloat(document.getElementById("inputSoilThreshold").value);
    const water = parseFloat(document.getElementById("inputWaterSafety").value);
    const duration = parseInt(document.getElementById("inputMaxDuration").value);

    try {
        const res = await fetch(`${BACKEND_HTTP}/api/thresholds`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                soil_threshold: soil,
                water_min_safety: water,
                max_pump_duration_seconds: duration
            })
        });

        const data = await res.json();
        if (res.ok) {
            showToast("Đã lưu cấu hình ngưỡng thành công!", "success");
        } else {
            showToast("Không thể lưu cấu hình!", "danger");
        }
    } catch (e) {
        console.error("Error saving thresholds:", e);
        showToast("Lỗi kết nối máy chủ!", "danger");
    }
}

