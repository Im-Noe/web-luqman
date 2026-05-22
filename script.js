const THRESHOLDS = {
    temp: { minAman: 20, maxAman: 30, minSedang: 15, maxSedang: 35 },
    hum: { minAman: 40, maxAman: 60, minSedang: 30, maxSedang: 70 }
};

const tempValueEl = document.getElementById('temperature-value');
const humValueEl = document.getElementById('humidity-value');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const statusDescription = document.getElementById('status-description');
const themeToggleBtn = document.getElementById('theme-toggle');

let sensorInterval;
let tempChart, humChart;
const maxDataPoints = 15; 
const chartData = { labels: [], temperature: [], humidity: [] };

// Colors
const getChartColors = () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    return {
        textColor: isDark ? '#94a3b8' : '#64748b',
        gridColor: isDark ? '#334155' : '#e2e8f0',
        tempLine: '#ef4444', tempBg: 'rgba(239, 68, 68, 0.1)',
        humLine: '#3b82f6', humBg: 'rgba(59, 130, 246, 0.1)'
    };
};

function initCharts() {
    const ctxTemp = document.getElementById('tempChart').getContext('2d');
    const ctxHum = document.getElementById('humChart').getContext('2d');
    const colors = getChartColors();
    const commonOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false } },
        animation: { duration: 0 } 
    };

    tempChart = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Suhu (°C)', data: chartData.temperature,
                borderColor: colors.tempLine, backgroundColor: colors.tempBg,
                borderWidth: 2, tension: 0.4, fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.textColor } },
                y: { type: 'linear', display: true, suggestedMin: 15, suggestedMax: 35, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
            }
        }
    });

    humChart = new Chart(ctxHum, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Kelembapan (%)', data: chartData.humidity,
                borderColor: colors.humLine, backgroundColor: colors.humBg,
                borderWidth: 2, tension: 0.4, fill: true
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.textColor } },
                y: { type: 'linear', display: true, suggestedMin: 30, suggestedMax: 80, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
            }
        }
    });
}

function updateChartTheme() {
    if (!tempChart || !humChart) return;
    const colors = getChartColors();
    
    [tempChart, humChart].forEach(chart => {
        chart.options.scales.x.ticks.color = colors.textColor;
        chart.options.scales.y.ticks.color = colors.textColor;
        chart.options.scales.y.grid.color = colors.gridColor;
        chart.update();
    });
}

function updateCharts(temp, hum) {
    const now = new Date();
    const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    chartData.labels.push(timeLabel);
    chartData.temperature.push(temp);
    chartData.humidity.push(hum);
    if (chartData.labels.length > maxDataPoints) {
        chartData.labels.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
    }
    tempChart.update();
    humChart.update();
}

function determineStatus(temperature, humidity) {
    let tempStatus = 'aman', humStatus = 'aman';
    if (temperature < THRESHOLDS.temp.minSedang || temperature > THRESHOLDS.temp.maxSedang) tempStatus = 'beresiko';
    else if (temperature < THRESHOLDS.temp.minAman || temperature > THRESHOLDS.temp.maxAman) tempStatus = 'sedang';

    if (humidity < THRESHOLDS.hum.minSedang || humidity > THRESHOLDS.hum.maxSedang) humStatus = 'beresiko';
    else if (humidity < THRESHOLDS.hum.minAman || humidity > THRESHOLDS.hum.maxAman) humStatus = 'sedang';

    if (tempStatus === 'beresiko' || humStatus === 'beresiko') return 'beresiko';
    if (tempStatus === 'sedang' || humStatus === 'sedang') return 'sedang';
    return 'aman';
}

function updateUI(temperature, humidity) {
    tempValueEl.textContent = `${temperature.toFixed(1)} °C`;
    humValueEl.textContent = `${humidity.toFixed(1)} %`;
    const status = determineStatus(temperature, humidity);
    statusBadge.className = `status-badge large-badge ${status}`;

    switch(status) {
        case 'aman':
            statusText.textContent = 'Aman';
            statusDescription.textContent = 'Kondisi suhu dan kelembapan saat ini berada dalam rentang ideal.';
            break;
        case 'sedang':
            statusText.textContent = 'Perhatian';
            statusDescription.textContent = 'Kondisi lingkungan kurang optimal. Silakan periksa sirkulasi udara.';
            break;
        case 'beresiko':
            statusText.textContent = 'Beresiko';
            statusDescription.textContent = 'Peringatan! Suhu atau kelembapan di luar batas aman.';
            break;
    }
    updateCharts(temperature, humidity);
}

let currentSimTemp = 25, currentSimHum = 50;
function simulateSensorData() { 
    currentSimTemp += (Math.random() - 0.5) * 2;
    currentSimHum += (Math.random() - 0.5) * 4;
    currentSimTemp = Math.max(10, Math.min(40, currentSimTemp));
    currentSimHum = Math.max(20, Math.min(80, currentSimHum));
    updateUI(currentSimTemp, currentSimHum);
}

themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    if (isDark) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
    } else {
        document.body.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
    updateChartTheme();
});

document.addEventListener('DOMContentLoaded', () => {
    // Muat tema yang tersimpan
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.setAttribute('data-theme', 'dark');
    }
    initCharts(); 
    
    // Mulai simulasi secara permanen
    simulateSensorData(); 
    sensorInterval = setInterval(simulateSensorData, 3000); 
});
