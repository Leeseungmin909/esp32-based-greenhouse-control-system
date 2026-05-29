CREATE DATABASE IF NOT EXISTS smartfarm_db
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE smartfarm_db;

CREATE TABLE IF NOT EXISTS sensor_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    temperature FLOAT,
    humidity FLOAT,
    soil_moisture INT,
    light INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mode VARCHAR(20) DEFAULT 'auto',
    pump BOOLEAN DEFAULT FALSE,
    fan BOOLEAN DEFAULT FALSE,
    led BOOLEAN DEFAULT FALSE,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS device_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_name VARCHAR(50) NOT NULL,
    action VARCHAR(10) NOT NULL,
    started_at DATETIME,
    ended_at DATETIME,
    duration_seconds INT,
    control_mode VARCHAR(20),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO device_status (id, mode, pump, fan, led)
VALUES (1, 'auto', FALSE, FALSE, FALSE)
ON DUPLICATE KEY UPDATE id = id;