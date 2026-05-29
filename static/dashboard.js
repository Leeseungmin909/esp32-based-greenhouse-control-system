let sensorLogs = [];
let selectedType = "temperature";

const chartInfo = {
    temperature: {
        title: "온도 추이",
        label: "온도 (℃)",
        unit: "℃"
    },
    humidity: {
        title: "습도 추이",
        label: "습도 (%)",
        unit: "%"
    },
    soil_moisture: {
        title: "토양 수분 추이",
        label: "토양 수분 (%)",
        unit: "%"
    },
    light: {
        title: "조도 추이",
        label: "조도 (lx)",
        unit: "lx"
    }
};

const ctx = document.getElementById("sensorChart").getContext("2d");

const sensorChart = new Chart(ctx, {
    type: "line",
    data: {
        labels: [],
        datasets: [
            {
                label: chartInfo.temperature.label,
                data: [],
                borderWidth: 3,
                tension: 0.3,
                pointRadius: 3
            }
        ]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: false
            }
        }
    }
});

async function loadSensorData() {
    try {
        const response = await fetch("/api/sensor");
        const result = await response.json();

        if (result.status !== "success") {
            console.error("센서 데이터 조회 실패");
            return;
        }

        sensorLogs = result.logs;

        updateLatestValues(result.latest);
        updateChart(selectedType);
    } catch (error) {
        console.error("센서 데이터 요청 오류:", error);
    }
}

function updateLatestValues(latest) {
    if (!latest) return;

    document.getElementById("temperatureValue").innerText =
        `${latest.temperature}℃`;

    document.getElementById("humidityValue").innerText =
        `${latest.humidity}%`;

    document.getElementById("soilValue").innerText =
        `${latest.soil_moisture}%`;

    document.getElementById("lightValue").innerText =
        `${latest.light} lx`;
}

function updateChart(type) {
    const info = chartInfo[type];

    const labels = sensorLogs.map(log => log.created_at);
    const data = sensorLogs.map(log => Number(log[type]));

    document.getElementById("chartTitle").innerText = info.title;
    document.getElementById("chartLegend").innerText = `● ${info.label}`;

    sensorChart.data.labels = labels;
    sensorChart.data.datasets[0].label = info.label;
    sensorChart.data.datasets[0].data = data;
    sensorChart.update();
}

document.querySelectorAll(".sensor-card").forEach(card => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".sensor-card").forEach(item => {
            item.classList.remove("active");
        });

        card.classList.add("active");

        selectedType = card.dataset.type;
        updateChart(selectedType);
    });
});

document.getElementById("autoModeBtn").addEventListener("click", () => {
    setMode("auto");
});

document.getElementById("manualModeBtn").addEventListener("click", () => {
    setMode("manual");
});

async function setMode(mode) {
    try {
        const response = await fetch("/api/control", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                device: "mode",
                value: mode
            })
        });

        const result = await response.json();

        if (result.status === "success") {
            updateModeButtons(mode);
        }
    } catch (error) {
        console.error("모드 변경 오류:", error);
    }
}

function updateModeButtons(mode) {
    const autoBtn = document.getElementById("autoModeBtn");
    const manualBtn = document.getElementById("manualModeBtn");

    if (mode === "auto") {
        autoBtn.classList.add("active");
        manualBtn.classList.remove("active");
    } else {
        manualBtn.classList.add("active");
        autoBtn.classList.remove("active");
    }
}

document.querySelectorAll(".device-btn").forEach(button => {
    button.addEventListener("click", async () => {
        const device = button.dataset.device;
        const isOn = button.classList.contains("on");
        const nextValue = !isOn;

        try {
            const response = await fetch("/api/control", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    device: device,
                    value: nextValue
                })
            });

            const result = await response.json();

            if (result.status === "success") {
                updateDeviceButton(button, nextValue);
            }
        } catch (error) {
            console.error("장치 제어 오류:", error);
        }
    });
});

function updateDeviceButton(button, isOn) {
    if (isOn) {
        button.classList.add("on");
        button.innerText = "ON";
    } else {
        button.classList.remove("on");
        button.innerText = "OFF";
    }
}

loadSensorData();

setInterval(loadSensorData, 5000);