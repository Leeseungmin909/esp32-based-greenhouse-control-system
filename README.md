# ESP32 기반 스마트팜 제어 시스템

ESP32-S3, Flask, MariaDB, AWS EC2를 이용한 스마트팜 모니터링 및 제어 시스템입니다.  
무순 재배 환경을 기준으로 온도, 습도, 토양 수분, 조도 센서값을 측정하고, 웹 대시보드에서 워터 펌프, 쿨링팬, 생장 LED를 제어할 수 있도록 구성했습니다.

## 프로젝트 소개

이 프로젝트는 ESP32-S3가 센서 데이터를 수집하고, AWS EC2에서 실행되는 Flask 서버로 전송하는 구조입니다. Flask 서버는 수신한 데이터를 MariaDB에 저장하며, 사용자는 웹 대시보드에서 실시간 센서값, 그래프, 센서 데이터 테이블, 활동 기록을 확인할 수 있습니다.

또한 웹 대시보드에서 자동 모드와 수동 모드를 전환할 수 있으며, 수동 모드에서는 워터 펌프, 쿨링팬, 생장 LED를 직접 제어할 수 있습니다.


## 시스템 아키텍처
<img width="1206" height="676" alt="image" src="https://github.com/user-attachments/assets/a880a00c-f7b5-4151-b5e2-1d7721e2becc" />


## 사용 기술

| 구분 | 기술 |
| --- | --- |
| Hardware | ESP32-S3, DHT22, 토양 수분 센서, 조도 센서, 4채널 릴레이, 워터 펌프, 쿨링팬, 생장 LED |
| Backend | Python, Flask, PyMySQL, MariaDB, AWS EC2 Ubuntu |
| Frontend | HTML, CSS, JavaScript, Chart.js |
| Deployment | GitHub, systemd, AWS EC2 |

## 프로젝트 구조

```text
.
├── app.py
├── db.py
├── schema.sql
├── requirements.txt
├── smartfarm_esp32_controller.ino
├── .env.example
├── deploy/
│   └── smartfarm.service
├── static/
│   ├── dashboard.js
│   └── style.css
└── templates/
    └── index.html
```

| 파일 | 설명 |
| --- | --- |
| `app.py` | Flask 서버 API |
| `db.py` | MariaDB 연결 설정 |
| `schema.sql` | `smartfarm_db`, `sensor_data`, `device_status`, `device_log` 테이블 생성 SQL |
| `requirements.txt` | Python 패키지 목록 |
| `templates/index.html` | 웹 대시보드 HTML |
| `static/dashboard.js` | 센서 그래프, 제어 버튼, 센서 데이터 테이블, 활동 기록 기능 |
| `static/style.css` | 웹 대시보드 디자인 |
| `deploy/smartfarm.service` | AWS EC2에서 Flask 서버를 systemd로 자동 실행하기 위한 서비스 파일 |
| `smartfarm_esp32_controller.ino` | ESP32 센서 측정, 서버 통신, 릴레이 제어 코드. Arduino IDE 프로젝트 폴더로 관리할 경우 `arduino/smartfarm_esp32_controller/smartfarm_esp32_controller.ino` 경로를 사용할 수 있습니다. |
| `.env.example` | 환경변수 예시 파일 |

## 데이터베이스 구조

### sensor_data

| 컬럼 | 설명 |
| --- | --- |
| `id` | 센서 데이터 ID |
| `temperature` | 온도 |
| `humidity` | 습도 |
| `soil_moisture` | 토양 수분 |
| `light` | 조도 |
| `created_at` | 데이터 저장 시간 |

### device_status

| 컬럼 | 설명 |
| --- | --- |
| `id` | 장치 상태 ID |
| `mode` | 제어 모드 (`auto`, `manual`) |
| `pump` | 워터 펌프 상태 |
| `fan` | 쿨링팬 상태 |
| `led` | 생장 LED 상태 |
| `updated_at` | 상태 수정 시간 |

### device_log

| 컬럼 | 설명 |
| --- | --- |
| `id` | 활동 기록 ID |
| `device_name` | 장치 이름 |
| `action` | 동작 상태 (`ON`, `OFF`) |
| `control_mode` | 제어 모드 |
| `created_at` | 기록 생성 시간 |

## 제어 방식

### 자동 모드

- 온도가 기준값 이상이면 쿨링팬을 ON 합니다.
- 조도가 기준값 미만이면 생장 LED를 ON 합니다.
- 토양 수분이 건조 기준에 도달하면 워터 펌프가 1초 동안 동작합니다.
- 자동 모드에서 워터 펌프는 1시간 쿨타임을 적용합니다.

### 수동 모드

- 웹 대시보드에서 장치를 직접 제어합니다.
- 워터 펌프는 ON 요청 시 1초만 동작한 뒤 자동으로 OFF 됩니다.
- 쿨링팬과 생장 LED는 사용자가 선택한 ON/OFF 상태를 유지합니다.

## ESP32 동작 흐름

1. 1초마다 온도, 습도, 토양 수분, 조도 센서값을 수집합니다.
2. 1초마다 `/api/control`에 GET 요청을 보내 서버의 제어 상태를 확인합니다.
3. 10초마다 수집한 센서값을 오름차순으로 정렬한후 중앙값을 계산합니다.
4. 중앙값 센서값을 `/api/sensor`에 POST 요청으로 전송합니다.
5. 서버에서 받은 모드와 장치 상태에 따라 릴레이를 제어합니다.


### 센서 데이터 전송 예시

```json
{
  "temperature": 24.6,
  "humidity": 61.2,
  "soil_moisture": 1820,
  "light": 130
}
```

### 장치 제어 요청 예시

```json
{
  "device": "pump",
  "value": true
}
```

## 설치 및 실행 방법

### 1. 저장소 복제

```bash
git clone https://github.com/Leeseungmin909/esp32-based-greenhouse-control-system.git
cd esp32-based-greenhouse-control-system
```

### 2. Python 가상환경 생성 및 패키지 설치

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. 환경변수 설정

`.env.example`을 참고해서 `.env` 파일을 생성합니다.

```env
DB_HOST=localhost
DB_USER=smartfarm_user
DB_PASSWORD=1234
DB_NAME=smartfarm_db
```

### 4. 데이터베이스 생성

```bash
sudo mariadb < schema.sql
```

### 5. Flask 서버 실행

```bash
python3 app.py
```

서버 실행 후 브라우저에서 다음 주소로 접속합니다.

```text
http://서버_IP:5000
```

## AWS EC2 systemd 등록 방법

Flask 서버를 EC2 부팅 시 자동으로 실행하려면 systemd 서비스로 등록합니다.

```bash
sudo cp deploy/smartfarm.service /etc/systemd/system/smartfarm.service
sudo systemctl daemon-reload
sudo systemctl enable smartfarm
sudo systemctl start smartfarm
sudo systemctl status smartfarm
```

서비스 파일의 `WorkingDirectory`, `Environment`, `ExecStart` 경로는 EC2에 배포한 프로젝트 위치에 맞게 확인해야 합니다.

## 실행 화면

### 대시보드 화면
<img width="1917" height="909" alt="image" src="https://github.com/user-attachments/assets/f61acd7f-17bf-4e18-a156-527acb6473b3" />

### 센서 데이터 화면
<img width="1892" height="904" alt="image" src="https://github.com/user-attachments/assets/7c5ef6c3-5748-49e3-a509-f6946d5ab04b" />


### 활동 기록 화면
<img width="1898" height="891" alt="image" src="https://github.com/user-attachments/assets/fa925eee-ffb1-4db8-b693-58bbb1f1ec02" />


### 실제 하드웨어 구성 사진

<!-- 이미지 추가: 실제 하드웨어 전체 사진 -->

### ESP32 릴레이 제어 영상

<!-- 영상 추가: 웹 대시보드에서 펌프 ON 클릭 시 1초 동작하는 영상 -->
