#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// Wi-Fi / Server
const char* ssid = "SK_6E40_2.4G";
const char* password = "BKE0E@3703";
const char* serverBaseUrl = "http://52.79.251.198:5000";

// Sensor Pins
#define DHT_PIN 4
#define DHT_TYPE DHT22
#define SOIL_PIN 5
#define LIGHT_PIN 6

// Relay Pins
#define RELAY_FAN1 16
#define RELAY_FAN2 17
#define RELAY_LED  18
#define RELAY_PUMP 21

#define RELAY_ON  HIGH
#define RELAY_OFF LOW

// Control Thresholds
#define TEMP_FAN_THRESHOLD 25.0
#define LIGHT_THRESHOLD 250
#define SOIL_DRY_THRESHOLD 2000

// Timing
#define SENSOR_COLLECT_INTERVAL 1000UL
#define CONTROL_CHECK_INTERVAL 1000UL
#define SENSOR_SEND_SAMPLE_COUNT 10

#define ADC_SAMPLE_COUNT 10
#define ADC_SAMPLE_DELAY 10

// Pump
#define PUMP_RUN_TIME 1000UL
#define AUTO_PUMP_COOLDOWN 3600000UL
#define SENSOR_IGNORE_AFTER_PUMP 5000UL

DHT dht(DHT_PIN, DHT_TYPE);

// DHT 누적값
float tempSum = 0;
float humSum = 0;
int dhtValidCount = 0;

// 토양/조도 샘플
int soilSamples[SENSOR_SEND_SAMPLE_COUNT];
int lightSamples[SENSOR_SEND_SAMPLE_COUNT];
int sampleCount = 0;

// 최근 대표값
float lastAvgTemp = 0;
float lastAvgHum = 0;
int lastMedianSoil = 0;
int lastMedianLight = 0;

// 타이머
unsigned long lastSensorCollectTime = 0;
unsigned long lastControlCheckTime = 0;

// 펌프 상태
bool pumpRunning = false;
unsigned long pumpStartTime = 0;
unsigned long lastAutoPumpTime = 0;
unsigned long lastPumpStopTime = 0;

// 서버 pump 이전 값
int previousServerPumpValue = 0;


// 초기화: 센서, 릴레이, Wi-Fi 설정
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
  Serial.println("Pump run time: 1 sec");
}


// 메인 루프: 제어 상태 확인 + 센서 수집, 10개 모이면 전송
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
      calculateRepresentativeAndSend();
      resetSensorData();
    }
  }
}


// Wi-Fi 연결
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


// 센서값 수집: 온습도(DHT22) + 토양/조도(ADC 중앙값)
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

  soilSamples[sampleCount] = soilValue;
  lightSamples[sampleCount] = lightValue;

  sampleCount++;
}


// ADC 10회 측정 후 중앙값 반환
int readMedianAnalog(int pin) {
  int values[ADC_SAMPLE_COUNT];

  for (int i = 0; i < ADC_SAMPLE_COUNT; i++) {
    values[i] = analogRead(pin);
    delay(ADC_SAMPLE_DELAY);
  }

  sortArray(values, ADC_SAMPLE_COUNT);

  return (values[ADC_SAMPLE_COUNT / 2 - 1] + values[ADC_SAMPLE_COUNT / 2]) / 2;
}


// 배열 중앙값 계산
int getMedianFromArray(int sourceArray[], int count) {
  int tempArray[SENSOR_SEND_SAMPLE_COUNT];

  for (int i = 0; i < count; i++) {
    tempArray[i] = sourceArray[i];
  }

  sortArray(tempArray, count);

  if (count % 2 == 0) {
    return (tempArray[count / 2 - 1] + tempArray[count / 2]) / 2;
  } else {
    return tempArray[count / 2];
  }
}


// 오름차순 정렬 
void sortArray(int array[], int count) {
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (array[i] > array[j]) {
        int temp = array[i];
        array[i] = array[j];
        array[j] = temp;
      }
    }
  }
}


// 대표값 계산(온습도 평균, 토양/조도 중앙값) 후 서버 전송
void calculateRepresentativeAndSend() {
  float avgTemp = lastAvgTemp;
  float avgHum = lastAvgHum;

  if (dhtValidCount > 0) {
    avgTemp = tempSum / dhtValidCount;
    avgHum = humSum / dhtValidCount;
  }

  int medianSoil = getMedianFromArray(soilSamples, sampleCount);
  int medianLight = getMedianFromArray(lightSamples, sampleCount);

  lastAvgTemp = avgTemp;
  lastAvgHum = avgHum;
  lastMedianSoil = medianSoil;
  lastMedianLight = medianLight;

  Serial.print("SEND => Temp: ");
  Serial.print(avgTemp);
  Serial.print(" / Hum: ");
  Serial.print(avgHum);
  Serial.print(" / Soil: ");
  Serial.print(medianSoil);
  Serial.print(" / Light: ");
  Serial.println(medianLight);

  sendSensorDataToServer(avgTemp, avgHum, medianSoil, medianLight);
}


// 센서값을 JSON으로 /api/sensor에 POST
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


// /api/control 조회 후 모드/장치 상태를 릴레이에 반영
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


// 수동 모드: fan/led는 그대로 반영, pump는 ON 요청 시 1초만 동작
void applyManualControl(int pump, int fan, int led) {
  digitalWrite(RELAY_FAN1, fan ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_FAN2, fan ? RELAY_ON : RELAY_OFF);
  digitalWrite(RELAY_LED, led ? RELAY_ON : RELAY_OFF);

  if (pump == 1 && previousServerPumpValue == 0) {
    Serial.println("Manual pump: 1 sec ON");

    startPumpPulse();
    updateServerDeviceStatus("pump", false);
  }

  if (pump == 0 && !pumpRunning) {
    digitalWrite(RELAY_PUMP, RELAY_OFF);
  }
}


// 자동 모드: 최근 센서값 기준으로 팬/LED/펌프 제어
void applyAutoControl() {
  controlFan(lastAvgTemp);
  controlLed(lastMedianLight);
  controlPumpAuto(lastMedianSoil);
}


// 팬 제어: 기준 온도 이상이면 ON
void controlFan(float temperature) {
  if (temperature >= TEMP_FAN_THRESHOLD) {
    digitalWrite(RELAY_FAN1, RELAY_ON);
    digitalWrite(RELAY_FAN2, RELAY_ON);
  } else {
    digitalWrite(RELAY_FAN1, RELAY_OFF);
    digitalWrite(RELAY_FAN2, RELAY_OFF);
  }
}


// LED 제어: 기준 조도보다 어두우면 ON
void controlLed(int lightValue) {
  if (lightValue < LIGHT_THRESHOLD) {
    digitalWrite(RELAY_LED, RELAY_ON);
  } else {
    digitalWrite(RELAY_LED, RELAY_OFF);
  }
}


// 펌프 자동 제어: 건조하면 1초 동작 + 1시간 쿨타임
void controlPumpAuto(int soilValue) {
  unsigned long currentTime = millis();

  if (pumpRunning) {
    return;
  }

  if (lastPumpStopTime > 0 && currentTime - lastPumpStopTime < SENSOR_IGNORE_AFTER_PUMP) {
    return;
  }

  if (soilValue >= SOIL_DRY_THRESHOLD) {
    if (lastAutoPumpTime == 0 || currentTime - lastAutoPumpTime >= AUTO_PUMP_COOLDOWN) {
      Serial.println("Auto pump: 1 sec ON");

      startPumpPulse();
      lastAutoPumpTime = currentTime;
    }
  }
}


// 펌프 켜고 시작 시간 기록
void startPumpPulse() {
  if (pumpRunning) {
    return;
  }

  pumpRunning = true;
  pumpStartTime = millis();

  digitalWrite(RELAY_PUMP, RELAY_ON);
  Serial.println("Pump ON");
}


// 펌프 1초 경과 시 자동 OFF
void updatePumpPulse() {
  if (!pumpRunning) {
    return;
  }

  unsigned long currentTime = millis();

  if (currentTime - pumpStartTime >= PUMP_RUN_TIME) {
    digitalWrite(RELAY_PUMP, RELAY_OFF);
    pumpRunning = false;
    lastPumpStopTime = currentTime;

    Serial.println("Pump OFF");
  }
}


// 수동 펌프 동작 후 서버 pump 값을 OFF로 되돌림
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


// 다음 측정을 위해 누적 변수/배열 초기화
void resetSensorData() {
  tempSum = 0;
  humSum = 0;
  dhtValidCount = 0;
  sampleCount = 0;

  for (int i = 0; i < SENSOR_SEND_SAMPLE_COUNT; i++) {
    soilSamples[i] = 0;
    lightSamples[i] = 0;
  }
}


// 부팅 시 모든 릴레이 OFF
void allRelaysOff() {
  digitalWrite(RELAY_FAN1, RELAY_OFF);
  digitalWrite(RELAY_FAN2, RELAY_OFF);
  digitalWrite(RELAY_LED, RELAY_OFF);
  digitalWrite(RELAY_PUMP, RELAY_OFF);
}
