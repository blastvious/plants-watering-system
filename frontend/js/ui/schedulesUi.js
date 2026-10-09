// ==========================================
// UI LAYER: schedules list + modal (DOM only, delegates CRUD to schedules.js)
// ==========================================
import {
    DAY_NAMES,
    getSchedules,
    findSchedule,
    saveSchedule,
    toggleScheduleById,
    deleteScheduleById,
    subscribeSchedules
} from "../schedules.js";
import { showToast } from "./toast.js";

let selectedDays = [0, 1, 2, 3, 4, 5, 6];

export function initSchedulesUi() {
    initDayButtons();
    subscribeSchedules(renderSchedules);
}

export function renderSchedules(schedules) {
    const container = document.getElementById("schedulesList");
    if (!container) return;

    if (!schedules || schedules.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-slate-500 col-span-full border border-dashed border-slate-800 rounded-xl">
                <i class="fa-regular fa-calendar-xmark text-3xl mb-2 text-slate-600"></i>
                <p class="text-xs">Chưa có lịch tưới nào được thiết lập.</p>
                <button onclick="openScheduleModal()" class="mt-2 text-xs text-blue-400 hover:underline font-semibold">
                    + Tạo lịch tưới đầu tiên
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = schedules.map(item => {
        const isEnabled = item.enabled;
        const dayBadges = DAY_NAMES.map((name, index) => {
            const isDaySelected = item.days_of_week && item.days_of_week.includes(index);
            return `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isDaySelected ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-slate-800/60 text-slate-600'}">${name}</span>`;
        }).join("");

        return `
            <div class="p-4 rounded-xl bg-slate-900/60 border ${isEnabled ? 'border-slate-800 hover:border-slate-700' : 'border-slate-800/40 opacity-60'} transition-all flex flex-col justify-between space-y-3 min-w-0 overflow-hidden shadow-sm">
                <div class="flex items-start justify-between gap-3 min-w-0">
                    <div class="min-w-0 flex-1">
                        <h4 class="font-bold text-white text-sm flex items-center gap-1.5 truncate" title="${item.name}">
                            <i class="fa-regular fa-clock ${isEnabled ? 'text-amber-400' : 'text-slate-500'} flex-shrink-0"></i>
                            <span class="truncate">${item.name}</span>
                        </h4>
                        <div class="flex items-baseline space-x-2 mt-1">
                            <span class="text-2xl font-extrabold ${isEnabled ? 'text-emerald-400 font-mono' : 'text-slate-400 font-mono'}">${item.time}</span>
                            <span class="text-xs text-slate-400">(${item.duration_seconds}s)</span>
                        </div>
                    </div>
                    <button onclick="toggleSchedule('${item.id}')" title="${isEnabled ? 'Đang bật - Bấm để tắt' : 'Đang tắt - Bấm để bật'}" class="flex-shrink-0 w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 cursor-pointer ${isEnabled ? 'bg-emerald-600 justify-end' : 'bg-slate-800 justify-start'}">
                        <div class="w-4 h-4 rounded-full bg-white shadow-md"></div>
                    </button>
                </div>

                <div class="flex flex-wrap gap-1 items-center">
                    ${dayBadges}
                </div>

                <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs text-slate-400 min-w-0">
                    <span class="text-[11px] text-slate-500 truncate flex-1">
                        ${item.last_run ? 'Đã chạy: ' + new Date(item.last_run * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Chưa chạy lần nào'}
                    </span>
                    <div class="flex-shrink-0 flex items-center space-x-1">
                        <button onclick='openEditScheduleModal("${item.id}")' class="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition" title="Chỉnh sửa">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="deleteSchedule('${item.id}')" class="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition" title="Xóa lịch">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function initDayButtons() {
    const container = document.getElementById("dayButtonsContainer");
    if (!container) return;
    container.innerHTML = "";
    DAY_NAMES.forEach((name, index) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = `dayBtn_${index}`;
        btn.className = "py-1.5 rounded text-xs font-bold transition-all " +
            (selectedDays.includes(index) ? "bg-blue-600 text-white shadow-sm" : "bg-slate-800 text-slate-400 hover:text-white");
        btn.innerText = name;
        btn.onclick = () => toggleDay(index);
        container.appendChild(btn);
    });
}

function toggleDay(index) {
    if (selectedDays.includes(index)) {
        if (selectedDays.length > 1) {
            selectedDays = selectedDays.filter(d => d !== index);
        } else {
            showToast("Vui lòng chọn ít nhất 1 ngày trong tuần!", "warning");
        }
    } else {
        selectedDays.push(index);
        selectedDays.sort();
    }
    updateDayButtonsUI();
}

export function selectQuickDays(type) {
    if (type === "all") selectedDays = [0, 1, 2, 3, 4, 5, 6];
    else if (type === "workdays") selectedDays = [0, 1, 2, 3, 4];
    else if (type === "weekend") selectedDays = [5, 6];
    updateDayButtonsUI();
}

function updateDayButtonsUI() {
    DAY_NAMES.forEach((_, index) => {
        const btn = document.getElementById(`dayBtn_${index}`);
        if (btn) {
            btn.className = "py-1.5 rounded text-xs font-bold transition-all " +
                (selectedDays.includes(index) ? "bg-blue-600 text-white shadow-sm" : "bg-slate-800 text-slate-400 hover:text-white");
        }
    });
}

export function openScheduleModal(isEdit = false, schedule = null) {
    const modal = document.getElementById("scheduleModal");
    const title = document.getElementById("scheduleModalTitle");
    if (!modal) return;

    if (isEdit && schedule) {
        title.innerHTML = `<i class="fa-solid fa-pen-to-square text-blue-400"></i> Chỉnh Sửa Lịch Tưới`;
        document.getElementById("schedInputId").value = schedule.id;
        document.getElementById("schedInputName").value = schedule.name;
        document.getElementById("schedInputTime").value = schedule.time;
        document.getElementById("schedInputDuration").value = schedule.duration_seconds;
        document.getElementById("schedInputEnabled").checked = schedule.enabled;
        selectedDays = schedule.days_of_week ? [...schedule.days_of_week] : [0, 1, 2, 3, 4, 5, 6];
    } else {
        title.innerHTML = `<i class="fa-regular fa-calendar-plus text-emerald-400"></i> Thêm Lịch Tưới Mới`;
        document.getElementById("schedInputId").value = "";
        document.getElementById("schedInputName").value = "";
        document.getElementById("schedInputTime").value = "07:00";
        document.getElementById("schedInputDuration").value = 60;
        document.getElementById("schedInputEnabled").checked = true;
        selectedDays = [0, 1, 2, 3, 4, 5, 6];
    }

    updateDayButtonsUI();
    modal.classList.remove("hidden");
}

export function closeScheduleModal() {
    const modal = document.getElementById("scheduleModal");
    if (modal) modal.classList.add("hidden");
}

export function openEditScheduleModal(id) {
    const schedule = findSchedule(id);
    if (schedule) openScheduleModal(true, schedule);
}

export async function handleScheduleSubmit(event) {
    event.preventDefault();

    const id = document.getElementById("schedInputId").value;
    const name = document.getElementById("schedInputName").value.trim();
    const time = document.getElementById("schedInputTime").value;
    const duration = parseInt(document.getElementById("schedInputDuration").value);
    const enabled = document.getElementById("schedInputEnabled").checked;

    if (selectedDays.length === 0) {
        showToast("Vui lòng chọn ít nhất 1 ngày trong tuần!", "warning");
        return;
    }

    const payload = { name: name || "Lịch tưới", time, duration_seconds: duration, days_of_week: selectedDays, enabled };

    const result = await saveSchedule(id || null, payload);
    if (result.ok) {
        closeScheduleModal();
    }
    showToast(result.message, result.type);
}

export async function toggleSchedule(id) {
    const result = await toggleScheduleById(id);
    if (!result.ok) showToast(result.message, result.type);
}

export async function deleteSchedule(id) {
    if (!confirm("Bạn có chắc chắn muốn xóa lịch tưới này không?")) return;
    const result = await deleteScheduleById(id);
    showToast(result.message, result.type);
}
