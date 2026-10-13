// ==========================================
// UI LAYER: toast notifications (DOM only)
// ==========================================
export function showToast(message, type = "info") {
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
