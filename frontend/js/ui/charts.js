// ==========================================
// UI LAYER: Chart.js setup + live updates
// ==========================================
import { api } from "../api.js";
import { subscribe } from "../state.js";

let moistureChartInstance = null;
let temperatureChartInstance = null;

function initCharts() {
    const ctxMoisture = document.getElementById("moistureChart").getContext("2d");
    const ctxTemp = document.getElementById("temperatureChart").getContext("2d");

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { labels: { color: "#94a3b8", font: { size: 11, family: "sans-serif" } } }
        },
        scales: {
            x: { grid: { color: "rgba(51, 65, 85, 0.3)" }, ticks: { color: "#64748b", maxRotation: 0, font: { size: 10 } } },
            y: { grid: { color: "rgba(51, 65, 85, 0.3)" }, ticks: { color: "#64748b", font: { size: 10 } } }
        }
    };

    moistureChartInstance = new Chart(ctxMoisture, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Độ ẩm đất (%)", borderColor: "#10b981", backgroundColor: "rgba(16, 185, 129, 0.1)", borderWidth: 2, tension: 0.3, fill: true, data: [] },
                { label: "Mực nước bể (%)", borderColor: "#3b82f6", backgroundColor: "rgba(59, 130, 246, 0.05)", borderWidth: 2, borderDash: [4, 4], tension: 0.3, data: [] }
            ]
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 0, max: 100 } } }
    });

    temperatureChartInstance = new Chart(ctxTemp, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Nhiệt độ (°C)", borderColor: "#f59e0b", backgroundColor: "rgba(245, 158, 11, 0.15)", borderWidth: 2, tension: 0.3, fill: true, data: [] }
            ]
        },
        options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, min: 15, max: 50 } } }
    });
}

function addChartDataPoint(timeLabel, soil, water, temp, update = true) {
    if (!moistureChartInstance || !temperatureChartInstance) return;

    const labels = moistureChartInstance.data.labels;
    if (labels.length > 0 && labels[labels.length - 1] === timeLabel) return; // dedupe

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

async function loadHistory() {
    try {
        const history = await api.getHistory(25);
        if (history && history.length > 0) {
            history.forEach((item) => {
                const timeStr = new Date(item.timestamp * 1000).toLocaleTimeString();
                addChartDataPoint(timeStr, item.soil_moisture, item.water_level, item.temperature, false);
            });
            moistureChartInstance.update();
            temperatureChartInstance.update();
        }
    } catch (e) {
        console.error("Failed to fetch history:", e);
    }
}

export function initChartsModule() {
    initCharts();
    loadHistory();

    // Live updates: whenever state.js reports a new status, push a chart point
    subscribe((status) => {
        if (status?.telemetry?.last_updated) {
            const timeObj = new Date(status.telemetry.last_updated * 1000);
            addChartDataPoint(
                timeObj.toLocaleTimeString(),
                status.telemetry.soil_moisture,
                status.telemetry.water_level,
                status.telemetry.temperature,
                true
            );
        }
    });
}
