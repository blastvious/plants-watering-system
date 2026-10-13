// ==========================================
// BOOTSTRAP: wires LOGIC layer (api/state/schedules) to UI layer (render/charts/toast)
// ==========================================
import { connect, subscribe, onConnectionChange, togglePumpAction, switchMode, saveThresholds } from "./state.js";
import { loadSchedules } from "./schedules.js";
import { renderDashboard, renderConnectionBadge } from "./ui/render.js";
import { initChartsModule } from "./ui/charts.js";
import { showToast } from "./ui/toast.js";
import {
    initSchedulesUi,
    openScheduleModal,
    closeScheduleModal,
    openEditScheduleModal,
    handleScheduleSubmit,
    toggleSchedule,
    deleteSchedule,
    selectQuickDays
} from "./ui/schedulesUi.js";

document.addEventListener("DOMContentLoaded", () => {
    // Wire: whenever state.js gets a new status, render.js draws it
    subscribe(renderDashboard);
    onConnectionChange(renderConnectionBadge);

    initChartsModule();
    initSchedulesUi();

    connect();          // starts WebSocket + polling fallback (state.js)
    loadSchedules();     // initial schedules fetch (schedules.js)
});

// ---- Handlers referenced by inline onclick="" in index.html ----
// (kept as window.* so the original HTML markup doesn't need to change)

window.togglePumpAction = async () => {
    try {
        const { message, type } = await togglePumpAction();
        showToast(message, type);
    } catch (e) {
        showToast(e.message || "Thao tác thất bại!", "danger");
    }
};

window.switchMode = async (mode) => {
    try {
        const { message, type } = await switchMode(mode);
        showToast(message, type);
    } catch (e) {
        showToast(e.message || "Chuyển chế độ thất bại!", "danger");
    }
};

window.saveThresholds = async () => {
    const soil = parseFloat(document.getElementById("inputSoilThreshold").value);
    const water = parseFloat(document.getElementById("inputWaterSafety").value);
    const duration = parseInt(document.getElementById("inputMaxDuration").value);
    try {
        const { message, type } = await saveThresholds({
            soil_threshold: soil,
            water_min_safety: water,
            max_pump_duration_seconds: duration
        });
        showToast(message, type);
    } catch (e) {
        showToast(e.message || "Không thể lưu cấu hình!", "danger");
    }
};

window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.openEditScheduleModal = openEditScheduleModal;
window.handleScheduleSubmit = handleScheduleSubmit;
window.toggleSchedule = toggleSchedule;
window.deleteSchedule = deleteSchedule;
window.selectQuickDays = selectQuickDays;
