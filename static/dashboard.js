let sensorLogs = [];
let selectedType = "temperature";
let currentMode = "auto";

// 센서 데이터 테이블 상태
let currentSensorTablePage = 1;
let selectedSensorTableType = "all";
const sensorTableLimit = 50;

// 활동 기록 테이블 상태
let currentLogPage = 1;
const logTableLimit = 50;

const chartInfo = {
    temperature: {
        title: "온도 추이",
        label: "온도 (℃)",
        unit: "℃",
        tableTitle: "온도 데이터",
        tableHeader: "온도(℃)",
        yMin: 10,
        yMax: 40
    },
    humidity: {
        title: "습도 추이",
        label: "습도 (%)",
        unit: "%",
        tableTitle: "습도 데이터",
        tableHeader: "습도(%)",
        yMin: 0,
        yMax: 100
    },
    soil_moisture: {
        title: "토양 수분 추이",
        label: "토양 수분",
        unit: "",
        tableTitle: "토양 수분 데이터",
        tableHeader: "토양 수분",
        yMin: 1000,
        yMax: 2400
    },
    light: {
        title: "조도 추이",
        label: "조도",
        unit: "",
        tableTitle: "조도 데이터",
        tableHeader: "조도",
        yMin: 0,
        yMax: 1000
    }
};

const deviceNameMap = {
    pump: "워터 펌프",
    fan: "쿨링팬",
    led: "생장 LED"
};

const modeNameMap = {
    auto: "자동",
    manual: "수동"
};


// =====================
// DOM 요소
// =====================
const dashboardMenu = document.getElementById("dashboardMenu");
const sensorDataMenu = document.getElementById("sensorDataMenu");
const activityLogMenu = document.getElementById("activityLogMenu");

const dashboardSection = document.getElementById("dashboardSection");
const sensorDataSection = document.getElementById("sensorDataSection");
const activityLogSection = document.getElementById("activityLogSection");

const sensorTableTitle = document.getElementById("sensorTableTitle");
const sensorTableSubtitle = document.getElementById("sensorTableSubtitle");
const sensorTablePageInfo = document.getElementById("sensorTablePageInfo");
const sensorTableHead = document.getElementById("sensorTableHead");
const sensorTableBody = document.getElementById("sensorTableBody");
const sensorPrevPageBtn = document.getElementById("sensorPrevPageBtn");
const sensorNextPageBtn = document.getElementById("sensorNextPageBtn");

const activityLogList = document.getElementById("activityLogList");
const logPageInfo = document.getElementById("logPageInfo");
const logPrevPageBtn = document.getElementById("logPrevPageBtn");
const logNextPageBtn = document.getElementById("logNextPageBtn");


// =====================
// Chart.js
// =====================
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
// 페이지 전환
// =====================
function showPage(pageName) {
    dashboardSection.style.display = "none";
    sensorDataSection.style.display = "none";
    activityLogSection.style.display = "none";

    dashboardMenu.classList.remove("active");
    sensorDataMenu.classList.remove("active");
    activityLogMenu.classList.remove("active");

    if (pageName === "dashboard") {
        dashboardSection.style.display = "block";
        dashboardMenu.classList.add("active");
    }

    if (pageName === "sensor") {
        sensorDataSection.style.display = "block";
        sensorDataMenu.classList.add("active");
    }

    if (pageName === "log") {
        activityLogSection.style.display = "block";
        activityLogMenu.classList.add("active");
    }
}

dashboardMenu.addEventListener("click", (event) => {
    event.preventDefault();
    showPage("dashboard");
});

sensorDataMenu.addEventListener("click", (event) => {
    event.preventDefault();

    selectedSensorTableType = "temperature";
    currentSensorTablePage = 1;

    showPage("sensor");
    updateSensorTableCardActive("temperature");
    updateSensorTableLatestValues();
    loadSensorTableData(currentSensorTablePage);
});

activityLogMenu.addEventListener("click", (event) => {
    event.preventDefault();
    currentLogPage = 1;
    showPage("log");
    loadActivityLogData(currentLogPage);
});


// =====================
// 센서 데이터 조회
// 대시보드 그래프용
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

function isSensorWarning(type, value) {
    const numberValue = Number(value);

    if (type === "temperature") {
        return numberValue >= 25;
    }

    if (type === "humidity") {
        return numberValue >= 80;
    }

    if (type === "soil_moisture") {
        return numberValue >= 2000;
    }

    if (type === "light") {
        return numberValue < 300;
    }

    return false;
}

function updateCardStatus(card, statusTextElement, type, value) {
    const warning = isSensorWarning(type, value);

    if (warning) {
        card.classList.add("warning");
        statusTextElement.classList.remove("normal");
        statusTextElement.classList.add("warning-text");
        statusTextElement.innerText = "△ 부족";
    } else {
        card.classList.remove("warning");
        statusTextElement.classList.remove("warning-text");
        statusTextElement.classList.add("normal");
        statusTextElement.innerText = "적정 범위";
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
        `${latest.soil_moisture}`;

    document.getElementById("lightValue").innerText =
        `${latest.light}`;

    // 대시보드 카드 상태 변경
    const temperatureCard = document.querySelector('.sensor-card[data-type="temperature"]');
    const humidityCard = document.querySelector('.sensor-card[data-type="humidity"]');
    const soilCard = document.querySelector('.sensor-card[data-type="soil_moisture"]');
    const lightCard = document.querySelector('.sensor-card[data-type="light"]');

    updateCardStatus(
        temperatureCard,
        temperatureCard.querySelector("span"),
        "temperature",
        latest.temperature
    );

    updateCardStatus(
        humidityCard,
        humidityCard.querySelector("span"),
        "humidity",
        latest.humidity
    );

    updateCardStatus(
        soilCard,
        soilCard.querySelector("span"),
        "soil_moisture",
        latest.soil_moisture
    );

    updateCardStatus(
        lightCard,
        lightCard.querySelector("span"),
        "light",
        latest.light
    );

    // 센서 데이터 페이지 카드도 같이 변경
    updateSensorTableCardValuesAndStatus(latest);
}

function updateSensorTableCardValuesAndStatus(latest) {
    const tableTemperatureValue = document.getElementById("tableTemperatureValue");
    const tableHumidityValue = document.getElementById("tableHumidityValue");
    const tableSoilValue = document.getElementById("tableSoilValue");
    const tableLightValue = document.getElementById("tableLightValue");

    if (!tableTemperatureValue || !tableHumidityValue || !tableSoilValue || !tableLightValue) {
        return;
    }

    tableTemperatureValue.innerText = `${latest.temperature}℃`;
    tableHumidityValue.innerText = `${latest.humidity}%`;
    tableSoilValue.innerText = `${latest.soil_moisture}`;
    tableLightValue.innerText = `${latest.light}`;

    const temperatureCard = document.querySelector('.sensor-table-card[data-type="temperature"]');
    const humidityCard = document.querySelector('.sensor-table-card[data-type="humidity"]');
    const soilCard = document.querySelector('.sensor-table-card[data-type="soil_moisture"]');
    const lightCard = document.querySelector('.sensor-table-card[data-type="light"]');

    updateCardStatus(
        temperatureCard,
        temperatureCard.querySelector("span"),
        "temperature",
        latest.temperature
    );

    updateCardStatus(
        humidityCard,
        humidityCard.querySelector("span"),
        "humidity",
        latest.humidity
    );

    updateCardStatus(
        soilCard,
        soilCard.querySelector("span"),
        "soil_moisture",
        latest.soil_moisture
    );

    updateCardStatus(
        lightCard,
        lightCard.querySelector("span"),
        "light",
        latest.light
    );
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

    sensorChart.options.scales.y.min = info.yMin;
    sensorChart.options.scales.y.max = info.yMax;

    sensorChart.update();
}


// =====================
// 대시보드 센서 카드 클릭
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
// 센서 데이터 페이지 카드 클릭
// =====================
document.querySelectorAll(".sensor-table-card").forEach(card => {
    card.addEventListener("click", () => {
        document.querySelectorAll(".sensor-table-card").forEach(item => {
            item.classList.remove("active");
        });

        card.classList.add("active");

        selectedSensorTableType = card.dataset.type;
        currentSensorTablePage = 1;

        loadSensorTableData(currentSensorTablePage);
    });
});


// =====================
// 센서 데이터 테이블 조회
// =====================
async function loadSensorTableData(page) {
    try {
        const response = await fetch(`/api/sensor/table?page=${page}&limit=${sensorTableLimit}`);
        const result = await response.json();

        if (result.status !== "success") {
            console.error("센서 데이터 테이블 조회 실패");
            return;
        }

        renderSensorTable(result.logs);
        renderSensorPagination(result.page, result.total_pages);

    } catch (error) {
        console.error("센서 데이터 테이블 요청 오류:", error);
    }
}

function updateSensorTableLatestValues() {
    if (!sensorLogs || sensorLogs.length === 0) return;

    const latest = sensorLogs[sensorLogs.length - 1];

    document.getElementById("tableTemperatureValue").innerText =
        `${latest.temperature}℃`;

    document.getElementById("tableHumidityValue").innerText =
        `${latest.humidity}%`;

    document.getElementById("tableSoilValue").innerText =
        `${latest.soil_moisture}%`;

    document.getElementById("tableLightValue").innerText =
        `${latest.light} lx`;
}

function updateSensorTableCardActive(type) {
    document.querySelectorAll(".sensor-table-card").forEach(card => {
        card.classList.remove("active");

        if (card.dataset.type === type) {
            card.classList.add("active");
        }
    });
}

document.querySelectorAll(".sensor-table-card").forEach(card => {
    card.addEventListener("click", () => {
        selectedSensorTableType = card.dataset.type;
        currentSensorTablePage = 1;

        updateSensorTableCardActive(selectedSensorTableType);
        loadSensorTableData(currentSensorTablePage);
    });
});

// =====================
// 센서 데이터 테이블 렌더링
// selectedSensorTableType이 all이면 전체 컬럼 표시
// 특정 센서면 해당 센서값만 표시
// =====================
function renderSensorTable(logs) {
    sensorTableBody.innerHTML = "";

    const info = chartInfo[selectedSensorTableType];

    sensorTableTitle.innerText = info.tableTitle;
    sensorTableSubtitle.innerText = `${info.label} 값을 50개씩 표시합니다.`;

    sensorTableHead.innerHTML = `
        <tr>
            <th>ID</th>
            <th>측정 시간</th>
            <th>${info.tableHeader}</th>
        </tr>
    `;

    if (!logs || logs.length === 0) {
        sensorTableBody.innerHTML = `
            <tr>
                <td colspan="3">저장된 센서 데이터가 없습니다.</td>
            </tr>
        `;
        return;
    }

    logs.forEach(log => {
        const row = document.createElement("tr");

        const value = log[selectedSensorTableType];
        const unit = chartInfo[selectedSensorTableType].unit;

        row.innerHTML = `
            <td>${log.id}</td>
            <td>${log.created_at}</td>
            <td>${value} ${unit}</td>
        `;

        sensorTableBody.appendChild(row);
    });
}


// =====================
// 센서 데이터 페이지네이션
// =====================
function renderSensorPagination(page, totalPages) {
    currentSensorTablePage = page;

    if (totalPages === 0) {
        sensorTablePageInfo.innerText = "0 / 0 페이지";
        sensorPrevPageBtn.disabled = true;
        sensorNextPageBtn.disabled = true;
        return;
    }

    sensorTablePageInfo.innerText = `${page} / ${totalPages} 페이지`;

    sensorPrevPageBtn.disabled = page <= 1;
    sensorNextPageBtn.disabled = page >= totalPages;
}

sensorPrevPageBtn.addEventListener("click", () => {
    if (currentSensorTablePage > 1) {
        loadSensorTableData(currentSensorTablePage - 1);
    }
});

sensorNextPageBtn.addEventListener("click", () => {
    loadSensorTableData(currentSensorTablePage + 1);
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
// 활동 기록 조회
// =====================
async function loadActivityLogData(page) {
    try {
        const response = await fetch(`/api/device-log?page=${page}&limit=${logTableLimit}`);
        const result = await response.json();

        if (result.status !== "success") {
            console.error("활동 기록 조회 실패");
            return;
        }

        renderActivityLog(result.logs);
        renderLogPagination(result.page, result.total_pages);

    } catch (error) {
        console.error("활동 기록 요청 오류:", error);
    }
}


// =====================
// 활동 기록 렌더링
// =====================
function renderActivityLog(logs) {
    activityLogList.innerHTML = "";

    if (!logs || logs.length === 0) {
        activityLogList.innerHTML = `
            <div class="empty-log">
                저장된 활동 기록이 없습니다.
            </div>
        `;
        return;
    }

    logs.forEach(log => {
        const item = document.createElement("div");
        item.classList.add("activity-log-item");

        const deviceName = deviceNameMap[log.device_name] || log.device_name;
        const modeName = modeNameMap[log.control_mode] || log.control_mode || "-";
        const actionClass = log.action === "ON" ? "on" : "off";

        item.innerHTML = `
            <div class="log-icon ${actionClass}">
                ${log.action === "ON" ? "●" : "○"}
            </div>

            <div class="log-content">
                <div class="log-title">
                    ${deviceName} ${log.action}
                </div>

                <div class="log-desc">
                    ${modeName} 모드에서 ${deviceName}이(가) ${log.action} 상태로 변경되었습니다.
                </div>

                <div class="log-time">
                    ${log.created_at}
                </div>
            </div>
        `;

        activityLogList.appendChild(item);
    });
}


// =====================
// 활동 기록 페이지네이션
// =====================
function renderLogPagination(page, totalPages) {
    currentLogPage = page;

    if (totalPages === 0) {
        logPageInfo.innerText = "0 / 0 페이지";
        logPrevPageBtn.disabled = true;
        logNextPageBtn.disabled = true;
        return;
    }

    logPageInfo.innerText = `${page} / ${totalPages} 페이지`;

    logPrevPageBtn.disabled = page <= 1;
    logNextPageBtn.disabled = page >= totalPages;
}

logPrevPageBtn.addEventListener("click", () => {
    if (currentLogPage > 1) {
        loadActivityLogData(currentLogPage - 1);
    }
});

logNextPageBtn.addEventListener("click", () => {
    loadActivityLogData(currentLogPage + 1);
});


// =====================
// 최초 실행
// =====================
showPage("dashboard");
loadSensorData();
loadControlStatus();


// =====================
// 주기적 갱신
// =====================
setInterval(loadSensorData, 5000);
setInterval(loadControlStatus, 5000);