from flask import Flask, render_template, request, jsonify
from db import get_db_connection

app = Flask(__name__)


def get_latest_sensor_data():
    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, temperature, humidity, soil_moisture, light,
                       DATE_FORMAT(created_at, '%%H:%%i:%%s') AS created_at
                FROM sensor_data
                ORDER BY id DESC
                LIMIT 1
            """
            cursor.execute(sql)
            return cursor.fetchone()
    finally:
        conn.close()


def get_recent_sensor_logs(limit=30):
    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, temperature, humidity, soil_moisture, light,
                       DATE_FORMAT(created_at, '%%H:%%i:%%s') AS created_at
                FROM sensor_data
                ORDER BY id DESC
                LIMIT %s
            """
            cursor.execute(sql, (limit,))
            rows = cursor.fetchall()
            return list(reversed(rows))
    finally:
        conn.close()


def get_device_status():
    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, mode, pump, fan, led, updated_at
                FROM device_status
                ORDER BY id DESC
                LIMIT 1
            """
            cursor.execute(sql)
            return cursor.fetchone()
    finally:
        conn.close()


@app.route("/")
def dashboard():
    latest = get_latest_sensor_data()
    device_status = get_device_status()

    return render_template(
        "index.html",
        latest=latest,
        device_status=device_status
    )


@app.route("/api/sensor", methods=["GET"])
def get_sensor_data():
    logs = get_recent_sensor_logs()
    latest = logs[-1] if logs else None

    return jsonify({
        "status": "success",
        "logs": logs,
        "latest": latest
    })


@app.route("/api/sensor", methods=["POST"])
def receive_sensor_data():
    data = request.get_json()

    if not data:
        return jsonify({
            "status": "error",
            "message": "JSON 데이터가 없습니다."
        }), 400

    temperature = data.get("temperature")
    humidity = data.get("humidity")
    soil_moisture = data.get("soil_moisture")
    light = data.get("light")

    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO sensor_data
                (temperature, humidity, soil_moisture, light)
                VALUES (%s, %s, %s, %s)
            """
            cursor.execute(sql, (
                temperature,
                humidity,
                soil_moisture,
                light
            ))

        conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

    finally:
        conn.close()

    return jsonify({
        "status": "success",
        "message": "센서 데이터 저장 완료"
    })


@app.route("/api/control", methods=["GET"])
def get_control_status():
    device_status = get_device_status()

    return jsonify({
        "status": "success",
        "device_status": device_status
    })


@app.route("/api/control", methods=["POST"])
def control_device():
    data = request.get_json()

    if not data:
        return jsonify({
            "status": "error",
            "message": "JSON 데이터가 없습니다."
        }), 400

    device = data.get("device")
    value = data.get("value")

    if device not in ["mode", "pump", "fan", "led"]:
        return jsonify({
            "status": "error",
            "message": "잘못된 장치 이름입니다."
        }), 400
    
    current_status = get_device_status()

    if current_status and current_status["mode"] == "auto" and device != "mode":
        return jsonify({
            "status": "error",
            "message": "자동 모드에서는 장치를 수동으로 제어할 수 없습니다."
        }), 403

    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            if device == "mode":
                if value not in ["auto", "manual"]:
                    return jsonify({
                        "status": "error",
                        "message": "mode 값은 auto 또는 manual이어야 합니다."
                    }), 400

                sql = """
                    UPDATE device_status
                    SET mode = %s
                    WHERE id = 1
                """
                cursor.execute(sql, (value,))

            else:
                bool_value = 1 if value else 0

                sql = f"""
                    UPDATE device_status
                    SET {device} = %s
                    WHERE id = 1
                """
                cursor.execute(sql, (bool_value,))

                action = "ON" if bool_value else "OFF"

                log_sql = """
                    INSERT INTO device_log
                    (device_name, action, control_mode)
                    VALUES (%s, %s, (
                        SELECT mode FROM device_status WHERE id = 1
                    ))
                """
                cursor.execute(log_sql, (device, action))

        conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

    finally:
        conn.close()

    return jsonify({
        "status": "success",
        "message": "제어 상태 변경 완료",
        "device_status": get_device_status()
    })

def get_sensor_table_logs(page=1, limit=50):
    offset = (page - 1) * limit

    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            count_sql = """
                SELECT COUNT(*) AS total
                FROM sensor_data
            """
            cursor.execute(count_sql)
            total = cursor.fetchone()["total"]

            sql = """
                SELECT id, temperature, humidity, soil_moisture, light,
                       DATE_FORMAT(created_at, '%%Y-%%m-%%d %%H:%%i:%%s') AS created_at
                FROM sensor_data
                ORDER BY id DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(sql, (limit, offset))
            rows = cursor.fetchall()

            return {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": (total + limit - 1) // limit,
                "logs": rows
            }

    finally:
        conn.close()


@app.route("/api/sensor/table", methods=["GET"])
def get_sensor_table_data():
    page = request.args.get("page", default=1, type=int)
    limit = request.args.get("limit", default=50, type=int)

    if page < 1:
        page = 1

    if limit < 1:
        limit = 50

    result = get_sensor_table_logs(page, limit)

    return jsonify({
        "status": "success",
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
        "total_pages": result["total_pages"],
        "logs": result["logs"]
    })

def get_device_log_table(page=1, limit=50):
    offset = (page - 1) * limit

    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            count_sql = """
                SELECT COUNT(*) AS total
                FROM device_log
            """
            cursor.execute(count_sql)
            total = cursor.fetchone()["total"]

            sql = """
                SELECT id, device_name, action, control_mode,
                       DATE_FORMAT(created_at, '%%Y-%%m-%%d %%H:%%i:%%s') AS created_at
                FROM device_log
                ORDER BY id DESC
                LIMIT %s OFFSET %s
            """
            cursor.execute(sql, (limit, offset))
            rows = cursor.fetchall()

            return {
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": (total + limit - 1) // limit,
                "logs": rows
            }

    finally:
        conn.close()


@app.route("/api/device-log", methods=["GET"])
def get_device_log_data():
    page = request.args.get("page", default=1, type=int)
    limit = request.args.get("limit", default=50, type=int)

    if page < 1:
        page = 1

    if limit < 1:
        limit = 50

    result = get_device_log_table(page, limit)

    return jsonify({
        "status": "success",
        "total": result["total"],
        "page": result["page"],
        "limit": result["limit"],
        "total_pages": result["total_pages"],
        "logs": result["logs"]
    })