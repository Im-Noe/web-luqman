// ─── Konfigurasi MQTT HiveMQ ───────────────────────────────────────────────
const MQTT_CONFIG = {
    brokerUrl: 'wss://231dbabd3b404dfba751f3da10c7dc46.s1.eu.hivemq.cloud:8884/mqtt',
    options: {
        username: 'Monitoring_Sensor',
        password: 'CDKelompok10',
        clientId: 'dashboard_' + Math.random().toString(16).slice(2, 8),
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
        keepalive: 60,
    },
    topics: {
        raw:    'Dev01/environment/raw',     // {"suhu":25.3,"kelembapan":65,"status":"AMAN"}
        status: 'Dev01/environment/status',  // {"status":"AMAN"}
    }
};

// ─── Mapping status ESP32 → CSS class & teks UI ────────────────────────────
// ESP32 mengirim: "AMAN" | "WASPADA" | "BERISIKO"
const STATUS_MAP = {
    'AMAN': {
        cssClass: 'aman',
        text:     'Aman',
        desc:     'Kondisi suhu dan kelembapan saat ini berada dalam rentang ideal.'
    },
    'WASPADA': {
        cssClass: 'sedang',
        text:     'Waspada',
        desc:     'Kondisi lingkungan kurang optimal. Silakan periksa sirkulasi udara.'
    },
    'BERISIKO': {
        cssClass: 'beresiko',
        text:     'Berisiko',
        desc:     'Peringatan! Suhu atau kelembapan di luar batas aman.'
    },
    'MEMBACA': {
        cssClass: 'offline',
        text:     'Membaca…',
        desc:     'Sensor sedang mengumpulkan data awal.'
    }
};

// ─── DOM Elements ───────────────────────────────────────────────────────────
const tempValueEl       = document.getElementById('temperature-value');
const humValueEl        = document.getElementById('humidity-value');
const statusBadge       = document.getElementById('status-badge');
const statusText        = document.getElementById('status-text');
const statusDescription = document.getElementById('status-description');
const themeToggleBtn    = document.getElementById('theme-toggle');
const connStatus        = document.getElementById('connection-status');
const connText          = document.getElementById('conn-text');
const lastUpdateEl      = document.getElementById('last-update');
const mqttTopicDisplay  = document.getElementById('mqtt-topic-display');

// ─── Chart State ────────────────────────────────────────────────────────────
let tempChart, humChart;
const maxDataPoints = 20;
const chartData = { labels: [], temperature: [], humidity: [] };

// ─── Chart Colors ────────────────────────────────────────────────────────────
const getChartColors = () => {
    const isDark = document.body.getAttribute('data-theme') === 'dark';
    return {
        textColor: isDark ? '#94a3b8' : '#64748b',
        gridColor: isDark ? '#334155' : '#e2e8f0',
        tempLine: '#ef4444', tempBg: 'rgba(239, 68, 68, 0.1)',
        humLine:  '#3b82f6', humBg:  'rgba(59, 130, 246, 0.1)'
    };
};

// ─── Charts ──────────────────────────────────────────────────────────────────
function initCharts() {
    const ctxTemp = document.getElementById('tempChart').getContext('2d');
    const ctxHum  = document.getElementById('humChart').getContext('2d');
    const colors  = getChartColors();
    const commonOptions = {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false } },
        animation: { duration: 300 }
    };

    tempChart = new Chart(ctxTemp, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Suhu (°C)', data: chartData.temperature,
                borderColor: colors.tempLine, backgroundColor: colors.tempBg,
                borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3,
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.textColor, maxTicksLimit: 8 } },
                // Rentang suhu disesuaikan dengan kalibrasi ESP32 (suhu kamar tropis)
                y: { suggestedMin: 20, suggestedMax: 40, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
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
                borderWidth: 2, tension: 0.4, fill: true, pointRadius: 3,
            }]
        },
        options: {
            ...commonOptions,
            scales: {
                x: { grid: { display: false }, ticks: { color: colors.textColor, maxTicksLimit: 8 } },
                // Rentang kelembapan sesuai kondisi tropis + kalibrasi ESP32
                y: { suggestedMin: 40, suggestedMax: 100, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
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
        chart.options.scales.y.grid.color  = colors.gridColor;
        chart.update();
    });
}

function updateCharts(temp, hum) {
    const now = new Date();
    const label = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    chartData.labels.push(label);
    chartData.temperature.push(parseFloat(temp.toFixed(1)));
    chartData.humidity.push(parseFloat(hum));
    if (chartData.labels.length > maxDataPoints) {
        chartData.labels.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
    }
    tempChart.update();
    humChart.update();
}

// ─── UI Update dari topic RAW ─────────────────────────────────────────────
// Payload: {"suhu":25.3,"kelembapan":65,"status":"AMAN"}
function updateUIFromRaw(json) {
    const suhu       = parseFloat(json.suhu);
    const kelembapan = parseInt(json.kelembapan);
    const statusKey  = (json.status || 'MEMBACA').toUpperCase();

    if (isNaN(suhu) || isNaN(kelembapan)) return;

    // Tampilkan nilai sensor
    tempValueEl.textContent = `${suhu.toFixed(1)} °C`;
    humValueEl.textContent  = `${kelembapan} %`;

    // Update status badge dari nilai yang dikirim ESP32
    applyStatus(statusKey);

    // Update waktu
    const now = new Date();
    lastUpdateEl.textContent = now.toLocaleTimeString('id-ID');

    // Update grafik
    updateCharts(suhu, kelembapan);

    document.body.classList.remove('offline');
}

// ─── UI Update dari topic STATUS saja ────────────────────────────────────
// Payload: {"status":"AMAN"}
function updateUIFromStatus(json) {
    const statusKey = (json.status || 'MEMBACA').toUpperCase();
    applyStatus(statusKey);
}

// ─── Terapkan status ke badge ─────────────────────────────────────────────
function applyStatus(statusKey) {
    const info = STATUS_MAP[statusKey] || STATUS_MAP['MEMBACA'];
    statusBadge.className     = `status-badge large-badge ${info.cssClass}`;
    statusText.textContent    = info.text;
    statusDescription.textContent = info.desc;
}

// ─── Connection State Helpers ─────────────────────────────────────────────
function setOfflineState() {
    connStatus.className = 'connection-badge disconnected';
    connText.textContent = 'Terputus';
    document.body.classList.add('offline');
    statusBadge.className = 'status-badge large-badge offline';
    statusText.textContent = 'Offline';
    statusDescription.textContent = 'Koneksi ke broker MQTT terputus. Mencoba menghubungkan kembali...';
}

function setConnectingState() {
    connStatus.className = 'connection-badge disconnected';
    connText.textContent = 'Menghubungkan...';
    statusBadge.className = 'status-badge large-badge offline';
    statusText.textContent = 'Menunggu';
    statusDescription.textContent = 'Menghubungkan ke broker HiveMQ...';
}

function setConnectedState() {
    connStatus.className = 'connection-badge connected';
    connText.textContent = 'Terhubung';
    if (statusText.textContent === 'Menunggu') {
        statusDescription.textContent = 'Terhubung ke HiveMQ. Menunggu data sensor (interval 30 detik)...';
    }
}

// ─── Parse & Dispatch Pesan MQTT ──────────────────────────────────────────
function handleMessage(topic, rawPayload) {
    const str = rawPayload.toString().trim();
    console.log(`[MQTT] ${topic} →`, str);

    let json;
    try {
        json = JSON.parse(str);
    } catch (e) {
        console.warn('[MQTT] Payload bukan JSON:', str);
        return;
    }

    if (topic === MQTT_CONFIG.topics.raw) {
        // {"suhu":25.3,"kelembapan":65,"status":"AMAN"}
        updateUIFromRaw(json);
    } else if (topic === MQTT_CONFIG.topics.status) {
        // {"status":"AMAN"} — hanya update badge, bukan grafik
        updateUIFromStatus(json);
    }
}

// ─── MQTT Connection ──────────────────────────────────────────────────────────
function connectMQTT() {
    setConnectingState();

    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

    client.on('connect', () => {
        console.log('[MQTT] Terhubung ke HiveMQ Cloud');
        setConnectedState();

        const topics = Object.values(MQTT_CONFIG.topics);
        topics.forEach(topic => {
            client.subscribe(topic, { qos: 1 }, (err) => {
                if (!err) {
                    console.log(`[MQTT] Subscribe: ${topic}`);
                    if (mqttTopicDisplay) mqttTopicDisplay.textContent = topics.join('  ·  ');
                } else {
                    console.warn(`[MQTT] Gagal subscribe ${topic}:`, err);
                }
            });
        });
    });

    client.on('message', handleMessage);

    client.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
        setOfflineState();
    });

    client.on('offline', () => {
        console.warn('[MQTT] Client offline');
        setOfflineState();
    });

    client.on('reconnect', () => {
        console.log('[MQTT] Reconnecting...');
        setConnectingState();
    });

    client.on('close', () => {
        console.log('[MQTT] Koneksi ditutup');
        setOfflineState();
    });

    return client;
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────
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

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') document.body.setAttribute('data-theme', 'dark');

    initCharts();
    connectMQTT();
});
