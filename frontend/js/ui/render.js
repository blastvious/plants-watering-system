// ==========================================
// UI LAYER: render dashboard DOM from state (no fetch calls here)
// ==========================================

export function renderConnectionBadge(connected) {
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

export function renderDashboard(status) {
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
    }
}
