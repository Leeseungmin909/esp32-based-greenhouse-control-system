#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// =====================
// Wi-Fi 설정
// =====================
const char* ssid = "SK_6E40_2.4G";
const char* password = "BKE0E@3703";

// AWS EC2 Flask 서버 주소
const char* serverBaseUrl = "http://54.180.101.48:5000";

// =====================
// 센서 핀 설정
// =====================
#define DHT_PIN 4
#define DHT_TYPE DHT22

#define SOIL_PIN 5
#define LIGHT_PIN 6

// =====================
// 릴레이 핀 설정
// =====================
#define RELAY_FAN1 16
#define RELAY_FAN2 17
#define RELAY_LED  18
#define RELAY_PUMP 21

// 현재 네 릴레이 동작 기준 유지
#define RELAY_ON  HIGH
#define RELAY_OFF LOW

// =====================
// 자동 제어 기준값
// =====================
#define LIGHT_THRESHOLD 100

// 토양수분센서 기준: 값이 높을수록 건조, 낮을수록 젖음
#define SOIL_DRY_THRESHOLD 2000

// 펜 돌아가는 온도: 25도로 설정
#define TEMP_FAN_THRESHOLD 25.0

// =====================
// 주기 설정
// =====================
#define SENSOR_COLLECT_INTERVAL 1000
#define CONTROL_CHECK_INTERVAL 1000
#define SENSOR_SEND_SAMPLE_COUNT 10

// ADC 안정화용
#define ADC_SAMPLE_COUNT 10
#define ADC_SAMPLE_DELAY 10

// 펌프 제어
#define PUMP_RUN_TIME 1000UL              // 1초
#define AUTO_PUMP_COOLDOWN 3600000UL      // 1시간 = 60 * 60 * 1000ms

DHT dht(DHT_PIN, DHT_TYPE);

// =====================
// 평균 계산용 변수
// =====================
float tempSum = 0;
float humSum = 0;
long soilSum = 0;
long lightSum = 0;

int dhtValidCount = 0;
int sampleCount = 0;

// 최근 평균값 저장
float lastAvgTemp = 0;
float lastAvgHum = 0;
int lastAvgSoil = 0;
int lastAvgLight = 0;

// 시간 제어용
unsigned long lastSensorCollectTime = 0;
unsigned long lastControlCheckTime = 0;

// 펌프 펄스 제어용
bool pumpRunning = false;
unsigned long pumpStartTime = 0;

// 자동모드 펌프 쿨타임
unsigned long lastAutoPumpTime = 0;

// 서버 pump 명령 중복 실행 방지용
int previousServerPumpValue = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);

  dht.begin();

  pinMode(RELAY_FAN1, OUTPUT);
  pinMode(RELAY_FAN2, OUTPUT);
  pinMode(RELAY_LED, OUTPUT);
  pinMode(RELAY_PUMP, OUTPUT);

  allRelaysOff();
  connectWiFi();

  Serial.println("ESP32 SmartFarm Start");
  Serial.println("Sensor POST: 10sec average");
  Serial.println("Control GET: 1sec");
  Serial.println("Pump run: 1sec");
  Serial.println("Auto pump cooldown: 1hour");
}

void loop() {
  unsigned long currentTime = millis();

  updatePumpPulse();

  if (currentTime - lastControlCheckTime >= CONTROL_CHECK_INTERVAL) {
    lastControlCheckTime = currentTime;
    fetchControlStatusAndApply();
  }

  if (currentTime - lastSensorCollectTime >= SENSOR_COLLECT_INTERVAL) {
    lastSensorCollectTime = currentTime;

    collectSensorData();

    if (sampleCount >= SENSOR_SEND_SAMPLE_COUNT) {
      calculateAverageAndSend();
      resetAverageData();
    }
  }
}

// =====================
// Wi-Fi 연결
// =====================
void connectWiFi() {
  Serial.print("WiFi connecting: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int retryCount = 0;

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    retryCount++;

    if (retryCount > 40) {
      Serial.println();
      Serial.println("WiFi connection failed");
      return;
    }
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

// =====================
// 1초마다 센서값 수집
// =====================
void collectSensorData() {
  float temperature = dht.readTemperature();
  float humidity = dht.readHumidity();

  int soilValue = readMedianAnalog(SOIL_PIN);
  int lightValue = readMedianAnalog(LIGHT_PIN);

  if (!isnan(temperature) && !isnan(humidity)) {
    tempSum += temperature;
    humSum += humidity;
    dhtValidCount++;
  } else {
    Serial.println("DHT read failed");
  }

  soilSum += soilValue;
  lightSum += lightValue;
  sampleCount++;
}

// =====================
// ADC 중앙값 읽기
// =====================
int readMedianAnalog(int pin) {
  int values[ADC_SAMPLE_COUNT];

  for (int i = 0; i < ADC_SAMPLE_COUNT; i++) {
    values[i] = analogRead(pin);
    delay(ADC_SAMPLE_DELAY);
  }

  // 오름차순 정렬
  for (int i = 0; i < ADC_SAMPLE_COUNT - 1; i++) {
    for (int j = i + 1; j < ADC_SAMPLE_COUNT; j++) {
      if (values[i] > values[j]) {
        int temp = values[i];
        values[i] = values[j];
        values[j] = temp;
      }
    }
  }

  // ADC_SAMPLE_COUNT가 10이면 가운데 두 값 평균
  return (values[ADC_SAMPLE_COUNT / 2 - 1] + values[ADC_SAMPLE_COUNT / 2]) / 2;
}

// =====================
// 10초 평균 계산 후 서버 전송
// =====================
void calculateAverageAndSend() {
  float avgTemp = lastAvgTemp;
  float avgHum = lastAvgHum;

  if (dhtValidCount > 0) {
    avgTemp = tempSum / dhtValidCount;
    avgHum = humSum / dhtValidCount;
  }

  int avgSoil = soilSum / sampleCount;
  int avgLight = lightSum / sampleCount;

  lastAvgTemp = avgTemp;
  lastAvgHum = avgHum;
  lastAvgSoil = avgSoil;
  lastAvgLight = avgLight;

  Serial.print("AVG => Temp: ");
  Serial.print(avgTemp);
  Serial.print(" / Hum: ");
  Serial.print(avgHum);
  Serial.print(" / Soil: ");
  Serial.print(avgSoil);
  Serial.print(" / Light: ");
  Serial.println(avgLight);

  sendSensorDataToServer(avgTemp, avgHum, avgSoil, avgLight);
}

// =====================
// Flask 서버로 센서 평균값 전송
// =====================
void sendSensorDataToServer(float temperature, float humidity, int soilValue, int lightValue) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Sensor POST failed: WiFi disconnected");
    return;
  }

  HTTPClient http;

  String sensorUrl = String(serverBaseUrl) + "/api/sensor";
  http.begin(sensorUrl);
  http.addHeader("Content-Type", "application/json");

  String jsonData = "{";
  jsonData += "\"temperature\":" + String(temperature, 2) + ",";
  jsonData += "\"humidity\":" + String(humidity, 2) + ",";
  jsonData += "\"soil_moisture\":" + String(soilValue) + ",";
  jsonData += "\"light\":" + String(lightValue);
  jsonData += "}";

  int httpResponseCode = http.POST(jsonData);

  Serial.print("Sensor POST: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode <= 0) {
    Serial.println("Sensor POST failed");
  }

  http.end();
}

// =====================
// 1초마다 서버 제어 상태 받아와 적용
// =====================
void fetchControlStatusAndApply() {
  if (WiFi.status() != WL_CONNECTED) {
    applyAutoControl();
    return;
  }

  HTTPClient http;

  String controlUrl = String(serverBaseUrl) + "/api/control";
  http.begin(controlUrl);

  int httpResponseCode = http.GET();

  if (httpResponseCode <= 0) {
    Serial.print("Control GET failed: ");
    Serial.println(httpResponseCode);
    http.end();

    applyAutoControl();
    return;
  }

  String response = http.getString();
  http.end();

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, response);

  if (error) {
    Serial.print("Control JSON parse failed: ");
    Serial.println(error.c_str());

    applyAutoControl();
    return;
  }

  const char* mode = doc["device_status"]["mode"];
  int pump = doc["device_status"]["pump"];
  int fan = doc["device_status"]["fan"];
  int led = doc["device_status"]["led"];

  if (String(mode) == "manual") {
    applyManualControl(pump, fan, led);
  } else {
    applyAutoControl();
  }

  previousServerPumpValue = pump;
}

// =====================
// 수동 모드 제어
// 팬/LED는 상태 유지
// 펌프는 ON 명령이 들어오면 1초만 동작
// =====================
void applyManualControl(int pump, int fan, int led) {
  digitalWrite(RELAY_FAN1, fan ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_FAN2, fan ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_LED, led ? RELAY_ON : RELAY_OFF);

  // pump 값이 0 -> 1로 바뀐 순간에만 1초 물 공급
  if (pump == 1 && previousServerPumpValue == 0) {
    Serial.println("Manual pump command: 1sec ON");

    startPumpPulse();

    // 서버의 pump 값을 다시 OFF로 돌림
    updateServerDeviceStatus("pump", false);
  }

  if (pump == 0 && !pumpRunning) {
    digitalWrite(RELAY_PUMP, RELAY_OFF);
  }
}

// =====================
// 자동 모드 제어
// 팬/LED는 센서 기준으로 유지
// 펌프는 건조할 때 1초 동작 후 1시간 쿨타임
// =====================
void applyAutoControl() {
  controlFan(lastAvgTemp);
  controlLed(lastAvgLight);
  controlPumpAuto(lastAvgSoil);
}

// =====================
// 팬 자동 제어
// =====================
void controlFan(float temperature) {
  if (temperature >= TEMP_FAN_THRESHOLD) {
    digitalWrite(RELAY_FAN1, RELAY_ON);
    digitalWrite(RELAY_FAN2, RELAY_ON);
  } else {
    digitalWrite(RELAY_FAN1, RELAY_OFF);
    digitalWrite(RELAY_FAN2, RELAY_OFF);
  }
}

// =====================
// LED 자동 제어
// =====================
void controlLed(int lightValue) {
  if (lightValue < LIGHT_THRESHOLD) {
    digitalWrite(RELAY_LED, RELAY_ON);
  } else {
    digitalWrite(RELAY_LED, RELAY_OFF);
  }
}

// =====================
// 자동모드 펌프 제어
// =====================
void controlPumpAuto(int soilValue) {
  unsigned long currentTime = millis();

  if (soilValue >= SOIL_DRY_THRESHOLD) {
    if (lastAutoPumpTime == 0 || currentTime - lastAutoPumpTime >= AUTO_PUMP_COOLDOWN) {
      Serial.println("Auto pump: soil dry, 1sec ON");

      startPumpPulse();
      lastAutoPumpTime = currentTime;
    }
  }

  if (soilValue <= SOIL_WET_THRESHOLD && !pumpRunning) {
    digitalWrite(RELAY_PUMP, RELAY_OFF);
  }
}

// =====================
// 펌프 1초 동작 시작
// =====================
void startPumpPulse() {
  if (pumpRunning) {
    return;
  }

  pumpRunning = true;
  pumpStartTime = millis();

  digitalWrite(RELAY_PUMP, RELAY_ON);
  Serial.println("Pump ON");
}

// =====================
// 펌프 1초 후 자동 OFF
// =====================
void updatePumpPulse() {
  if (!pumpRunning) {
    return;
  }

  unsigned long currentTime = millis();

  if (currentTime - pumpStartTime >= PUMP_RUN_TIME) {
    digitalWrite(RELAY_PUMP, RELAY_OFF);
    pumpRunning = false;

    Serial.println("Pump OFF");
  }
}

// =====================
// 서버 device_status 값 변경
// 펌프 1초 동작 후 서버 pump 값을 OFF로 되돌릴 때 사용
// =====================
void updateServerDeviceStatus(String device, bool value) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Control POST failed: WiFi disconnected");
    return;
  }

  HTTPClient http;

  String controlUrl = String(serverBaseUrl) + "/api/control";
  http.begin(controlUrl);
  http.addHeader("Content-Type", "application/json");

  String jsonData = "{";
  jsonData += "\"device\":\"" + device + "\",";
  jsonData += "\"value\":";
  jsonData += value ? "true" : "false";
  jsonData += "}";

  int httpResponseCode = http.POST(jsonData);

  Serial.print("Control POST: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode <= 0) {
    Serial.println("Control POST failed");
  }

  http.end();
}

// =====================
// 평균값 변수 초기화
// =====================
void resetAverageData() {
  tempSum = 0;
  humSum = 0;
  soilSum = 0;
  lightSum = 0;

  dhtValidCount = 0;
  sampleCount = 0;
}

// =====================
// 모든 릴레이 OFF
// =====================
void allRelaysOff() {
  digitalWrite(RELAY_FAN1, RELAY_OFF);
  digitalWrite(RELAY_FAN2, RELAY_OFF);
  digitalWrite(RELAY_LED, RELAY_OFF);
  digitalWrite(RELAY_PUMP, RELAY_OFF);
}