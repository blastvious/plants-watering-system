// ==========================================
// LOGIC LAYER: schedules CRUD (no DOM here)
// ==========================================
import { api } from "./api.js";

export const DAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

let schedulesList = [];
const listeners = new Set();

export function subscribeSchedules(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getSchedules() {
    return schedulesList;
}

function notify() {
    listeners.forEach((fn) => fn(schedulesList));
}

export async function loadSchedules() {
    try {
        schedulesList = (await api.getSchedules()) || [];
        notify();
    } catch (e) {
        console.error("Error fetching schedules:", e);
    }
}

export function findSchedule(id) {
    return schedulesList.find((s) => s.id === id);
}

// Returns { ok, message, type }
export async function saveSchedule(id, payload) {
    try {
        if (id) {
            await api.updateSchedule(id, payload);
        } else {
            await api.createSchedule(payload);
        }
        await loadSchedules();
        return { ok: true, message: id ? "Đã cập nhật lịch tưới!" : "Đã thêm lịch tưới mới!", type: "success" };
    } catch (e) {
        return { ok: false, message: e.message || "Không thể lưu lịch tưới!", type: "danger" };
    }
}

export async function toggleScheduleById(id) {
    try {
        await api.toggleSchedule(id);
        await loadSchedules();
        return { ok: true };
    } catch (e) {
        return { ok: false, message: "Không thể đổi trạng thái lịch!", type: "danger" };
    }
}

export async function deleteScheduleById(id) {
    try {
        await api.deleteSchedule(id);
        await loadSchedules();
        return { ok: true, message: "Đã xóa lịch tưới thành công!", type: "success" };
    } catch (e) {
        return { ok: false, message: "Không thể xóa lịch tưới!", type: "danger" };
    }
}
