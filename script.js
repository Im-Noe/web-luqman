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
    // Sesuaikan topic ini dengan topic yang dipublish ESP32/Arduino kamu
    // Format payload yang didukung:
    //   JSON: {"temperature": 25.3, "humidity": 65.1}
    //   Atau dua topic terpisah: sensor/temperature dan sensor/humidity
    topics: {
        combined: 'sensor/dht22',       // payload JSON gabungan
        temperature: 'sensor/temperature', // payload angka murni
        humidity: 'sensor/humidity',       // payload angka murni
    }
};

// ─── Threshold ──────────────────────────────────────────────────────────────
const THRESHOLDS = {
    temp: { minAman: 20, maxAman: 30, minSedang: 15, maxSedang: 35 },
    hum:  { minAman: 40, maxAman: 60, minSedang: 30, maxSedang: 70 }
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

// State sensor sementara (untuk handle topic terpisah)
let pendingTemp = null;
let pendingHum  = null;

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
                y: { suggestedMin: 15, suggestedMax: 35, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
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
                y: { suggestedMin: 30, suggestedMax: 80, grid: { color: colors.gridColor }, ticks: { color: colors.textColor } }
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
    chartData.humidity.push(parseFloat(hum.toFixed(1)));
    if (chartData.labels.length > maxDataPoints) {
        chartData.labels.shift();
        chartData.temperature.shift();
        chartData.humidity.shift();
    }
    tempChart.update();
    humChart.update();
}

// ─── Status Logic ────────────────────────────────────────────────────────────
function determineStatus(temperature, humidity) {
    let tempSt = 'aman', humSt = 'aman';
    if (temperature < THRESHOLDS.temp.minSedang || temperature > THRESHOLDS.temp.maxSedang) tempSt = 'beresiko';
    else if (temperature < THRESHOLDS.temp.minAman || temperature > THRESHOLDS.temp.maxAman) tempSt = 'sedang';
    if (humidity < THRESHOLDS.hum.minSedang || humidity > THRESHOLDS.hum.maxSedang) humSt = 'beresiko';
    else if (humidity < THRESHOLDS.hum.minAman || humidity > THRESHOLDS.hum.maxAman) humSt = 'sedang';
    if (tempSt === 'beresiko' || humSt === 'beresiko') return 'beresiko';
    if (tempSt === 'sedang'   || humSt === 'sedang')   return 'sedang';
    return 'aman';
}

// ─── UI Update ───────────────────────────────────────────────────────────────
function updateUI(temperature, humidity) {
    tempValueEl.textContent = `${temperature.toFixed(1)} °C`;
    humValueEl.textContent  = `${humidity.toFixed(1)} %`;

    const status = determineStatus(temperature, humidity);
    statusBadge.className = `status-badge large-badge ${status}`;
    document.body.classList.remove('offline');

    const statusMap = {
        aman:     { text: 'Aman',     desc: 'Kondisi suhu dan kelembapan saat ini berada dalam rentang ideal.' },
        sedang:   { text: 'Perhatian', desc: 'Kondisi lingkungan kurang optimal. Silakan periksa sirkulasi udara.' },
        beresiko: { text: 'Beresiko', desc: 'Peringatan! Suhu atau kelembapan di luar batas aman.' },
    };
    statusText.textContent        = statusMap[status].text;
    statusDescription.textContent = statusMap[status].desc;

    // Update last received time
    const now = new Date();
    lastUpdateEl.textContent = now.toLocaleTimeString('id-ID');

    updateCharts(temperature, humidity);
}

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
    statusDescription.textContent = 'Terhubung ke HiveMQ. Menunggu data sensor...';
}

// ─── Parse Payload ────────────────────────────────────────────────────────────
/**
 * Fungsi ini fleksibel — mendukung berbagai format payload dari ESP32/Arduino:
 *
 * Format 1 (JSON): {"temperature": 25.3, "humidity": 65.1}
 * Format 2 (JSON): {"temp": 25.3, "hum": 65.1}
 * Format 3 (Angka murni untuk topic spesifik): "25.3"
 */
function parsePayload(topic, rawPayload) {
    const str = rawPayload.toString().trim();
    const topicLower = topic.toLowerCase();

    // Coba parse JSON dulu
    try {
        const json = JSON.parse(str);
        const temp = json.temperature ?? json.temp ?? json.suhu ?? null;
        const hum  = json.humidity    ?? json.hum  ?? json.kelembapan ?? null;

        if (temp !== null && hum !== null) {
            updateUI(parseFloat(temp), parseFloat(hum));
            return;
        }
        // JSON ada tapi hanya satu field — gabungkan dengan pending
        if (temp !== null) pendingTemp = parseFloat(temp);
        if (hum  !== null) pendingHum  = parseFloat(hum);
    } catch {
        // Bukan JSON — angka murni
        const num = parseFloat(str);
        if (isNaN(num)) return;

        if (topicLower.includes('temp') || topicLower.includes('suhu')) {
            pendingTemp = num;
        } else if (topicLower.includes('hum') || topicLower.includes('kelembapan')) {
            pendingHum = num;
        }
    }

    // Kalau keduanya sudah ada, update UI
    if (pendingTemp !== null && pendingHum !== null) {
        updateUI(pendingTemp, pendingHum);
        pendingTemp = null;
        pendingHum  = null;
    }
}

// ─── MQTT Connection ──────────────────────────────────────────────────────────
function connectMQTT() {
    setConnectingState();

    const client = mqtt.connect(MQTT_CONFIG.brokerUrl, MQTT_CONFIG.options);

    client.on('connect', () => {
        console.log('[MQTT] Terhubung ke HiveMQ Cloud');
        setConnectedState();

        // Subscribe ke semua topic yang relevan
        const topics = Object.values(MQTT_CONFIG.topics);
        topics.forEach(topic => {
            client.subscribe(topic, { qos: 1 }, (err) => {
                if (!err) {
                    console.log(`[MQTT] Subscribe berhasil: ${topic}`);
                    if (mqttTopicDisplay) {
                        mqttTopicDisplay.textContent = topics.join(', ');
                    }
                } else {
                    console.warn(`[MQTT] Gagal subscribe ${topic}:`, err);
                }
            });
        });
    });

    client.on('message', (topic, payload) => {
        console.log(`[MQTT] Pesan dari "${topic}":`, payload.toString());
        parsePayload(topic, payload);
    });

    client.on('error', (err) => {
        console.error('[MQTT] Error:', err.message);
        setOfflineState();
    });

    client.on('offline', () => {
        console.warn('[MQTT] Client offline');
        setOfflineState();
    });

    client.on('reconnect', () => {
        console.log('[MQTT] Mencoba reconnect...');
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
