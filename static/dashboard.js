let sensorLogs = [];
let selectedType = "temperature";

// 현재 제어 모드 저장
let currentMode = "auto";

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

// =====================
// 센서 데이터 조회
// =====================
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

// =====================
// 최신 센서값 표시
// =====================
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

// =====================
// 차트 갱신
// =====================
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

// =====================
// 센서 카드 클릭 시 그래프 변경
// =====================
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

// =====================
// 서버 제어 상태 조회
// =====================
async function loadControlStatus() {
    try {
        const response = await fetch("/api/control");
        const result = await response.json();

        if (result.status !== "success") {
            console.error("제어 상태 조회 실패");
            return;
        }

        const deviceStatus = result.device_status;

        if (!deviceStatus) {
            console.error("device_status 데이터 없음");
            return;
        }

        currentMode = deviceStatus.mode;

        updateModeButtons(deviceStatus.mode);
        updateAllDeviceButtons(deviceStatus);
        updateDeviceButtonsByMode(deviceStatus.mode);

    } catch (error) {
        console.error("제어 상태 요청 오류:", error);
    }
}

// =====================
// 자동 / 수동 모드 버튼 이벤트
// =====================
document.getElementById("autoModeBtn").addEventListener("click", () => {
    setMode("auto");
});

document.getElementById("manualModeBtn").addEventListener("click", () => {
    setMode("manual");
});

// =====================
// 모드 변경 요청
// =====================
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
            currentMode = mode;

            updateModeButtons(mode);
            updateDeviceButtonsByMode(mode);

            if (result.device_status) {
                updateAllDeviceButtons(result.device_status);
            }
        } else {
            alert(result.message || "모드 변경에 실패했습니다.");
        }
    } catch (error) {
        console.error("모드 변경 오류:", error);
    }
}

// =====================
// 자동 / 수동 버튼 UI 갱신
// =====================
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

// =====================
// 자동 모드일 때 장치 버튼 비활성화
// =====================
function updateDeviceButtonsByMode(mode) {
    const isAutoMode = mode === "auto";

    document.querySelectorAll(".device-btn").forEach(button => {
        button.disabled = isAutoMode;

        if (isAutoMode) {
            button.classList.add("disabled");
            button.title = "자동 모드에서는 수동 제어할 수 없습니다.";
        } else {
            button.classList.remove("disabled");
            button.title = "";
        }
    });
}

// =====================
// DB의 device_status 값 기준으로 장치 버튼 상태 갱신
// =====================
function updateAllDeviceButtons(deviceStatus) {
    document.querySelectorAll(".device-btn").forEach(button => {
        const device = button.dataset.device;

        if (deviceStatus[device] !== undefined) {
            updateDeviceButton(button, Boolean(deviceStatus[device]));
        }
    });
}

// =====================
// 장치 버튼 클릭 이벤트
// =====================
document.querySelectorAll(".device-btn").forEach(button => {
    button.addEventListener("click", async () => {
        if (currentMode === "auto") {
            alert("자동 모드에서는 장치를 수동으로 제어할 수 없습니다.");
            return;
        }

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

                if (result.device_status) {
                    updateAllDeviceButtons(result.device_status);
                    currentMode = result.device_status.mode;
                    updateDeviceButtonsByMode(currentMode);
                }
            } else {
                alert(result.message || "장치 제어에 실패했습니다.");
            }
        } catch (error) {
            console.error("장치 제어 오류:", error);
        }
    });
});

// =====================
// 개별 장치 버튼 UI 갱신
// =====================
function updateDeviceButton(button, isOn) {
    if (isOn) {
        button.classList.add("on");
        button.innerText = "ON";
    } else {
        button.classList.remove("on");
        button.innerText = "OFF";
    }
}

// =====================
// 최초 실행
// =====================
loadSensorData();
loadControlStatus();

// =====================
// 주기적 갱신
// =====================
setInterval(loadSensorData, 5000);
setInterval(loadControlStatus, 5000);