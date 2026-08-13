from __future__ import annotations

import json
import mimetypes
import sys
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

BASE_DIR = Path(__file__).resolve().parent
PIPELINE_DIR = BASE_DIR / "smart_risk_pipeline"
DATA_DIR = PIPELINE_DIR / "data"
sys.path.insert(0, str(PIPELINE_DIR))

from src.facility_engine import FacilityEventEngine, VehicleGPS, load_facilities, load_gps_timeseries
from src.risk_pipeline import GPSPoint, SmartRiskPipeline, load_reports, load_risk_zones, parse_datetime
from src.storage import SQLiteStore

SERVER_VERSION = "move-ai-gilnun-v1"
DB_PATH = DATA_DIR / "gps_logs.db"

zones = load_risk_zones(DATA_DIR / "risk_zones.geojson")
reports = load_reports(DATA_DIR / "reports.csv")
facilities = load_facilities(DATA_DIR / "facilities.geojson")
risk_pipeline = SmartRiskPipeline(zones=zones, reports=reports, rolling_window_size=20, confidence_threshold=50)
facility_engine = FacilityEventEngine(facilities)
store = SQLiteStore(DB_PATH)


def latest_per_vehicle(rows: list[dict]) -> list[dict]:
    latest: dict[str, dict] = {}
    for row in rows:
        vehicle_id = str(row.get("vehicle_id", ""))
        if not vehicle_id:
            continue
        current = latest.get(vehicle_id)
        if current is None or (str(row.get("timestamp", "")), int(row.get("id", 0))) > (str(current.get("timestamp", "")), int(current.get("id", 0))):
            latest[vehicle_id] = row
    return [latest[key] for key in sorted(latest)]


def safe_risk_payload(decision) -> dict:
    payload = asdict(decision)
    if payload.get("triggered"):
        payload["original_status"] = payload.get("status")
        payload["status"] = "high_confidence_candidate"
        briefing = payload.get("briefing") or ""
        briefing = briefing.replace("위험 신뢰도", "후보 점수")
        briefing = briefing.replace("위험 조건 감지", "확인 필요 조건 감지")
        briefing = briefing.replace("정체 위험이 높습니다", "정체 가능성이 높게 관찰되었습니다")
        briefing = briefing.replace("서행과 차간거리 확보가 필요합니다.", "관리자 확인이 필요한 고신뢰 후보입니다.")
        briefing = briefing.replace("감속 운행이 필요합니다.", "관리자 확인이 필요한 후보입니다.")
        payload["briefing"] = briefing
    return payload


def json_response(handler: BaseHTTPRequestHandler, status: int, payload) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length <= 0:
        return {}
    return json.loads(handler.rfile.read(length).decode("utf-8"))


def gps_objects(payload: dict) -> tuple[VehicleGPS, GPSPoint]:
    vehicle_id = str(payload["vehicle_id"]).strip()
    timestamp = parse_datetime(str(payload["timestamp"]).strip())
    latitude = float(payload["latitude"])
    longitude = float(payload["longitude"])
    speed = float(payload.get("speed_kmh", 0))
    heading = float(payload["heading"]) if payload.get("heading") is not None else None
    accuracy = float(payload["accuracy_m"]) if payload.get("accuracy_m") is not None else None
    facility_gps = VehicleGPS(vehicle_id, timestamp, latitude, longitude, speed, heading, accuracy)
    risk_gps = GPSPoint(vehicle_id, timestamp, latitude, longitude, speed, heading, accuracy)
    return facility_gps, risk_gps


def run_risk_demo() -> dict:
    demo_pipeline = SmartRiskPipeline(zones=zones, reports=reports, rolling_window_size=20, confidence_threshold=50)
    target = zones[0]
    kst = timezone(timedelta(hours=9))
    start = datetime(2026, 8, 5, 17, 4, 0, tzinfo=kst)
    decision = None
    for second in range(20):
        point = GPSPoint(
            device_id="TRUCK_001",
            timestamp=start + timedelta(seconds=second),
            latitude=target.center_lat,
            longitude=target.center_lng,
            speed_kmh=2.0,
            heading=90.0,
            accuracy_m=5.0,
        )
        decision = demo_pipeline.process_gps(point)
    payload = safe_risk_payload(decision)
    payload.update({"source": "smart_risk_pipeline_for_friend", "samples": 20, "demo_data": True})
    return payload


def run_facility_demo() -> dict:
    engine = FacilityEventEngine(facilities)
    rows = load_gps_timeseries(DATA_DIR / "gps_timeseries_sample.csv")
    events = []
    for row in rows:
        events.extend(engine.process_gps(row))
    return {
        "source": "smart_risk_pipeline_for_friend",
        "demo_data": True,
        "events": [asdict(event) for event in events],
        "event_count": len(events),
    }


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        if path in ("/api/health", "/health"):
            json_response(self, 200, {
                "ok": True,
                "version": SERVER_VERSION,
                "source": "smart_risk_pipeline_for_friend",
                "risk_zones": len(zones),
                "field_reports": len(reports),
                "facilities": len(facilities),
            })
            return
        if path == "/api/vehicles/latest":
            json_response(self, 200, latest_per_vehicle(store.latest_vehicle_positions()))
            return
        if path == "/api/vehicles/history":
            limit = min(max(int(query.get("limit", ["80"])[0]), 1), 500)
            json_response(self, 200, store.recent_vehicle_history(limit=limit))
            return
        if path == "/api/facilities/status":
            json_response(self, 200, store.facility_status())
            return
        if path == "/api/facilities/events":
            json_response(self, 200, store.recent_facility_events())
            return
        if path == "/api/risk-zones":
            json_response(self, 200, [{
                "zone_id": zone.zone_id,
                "name": zone.name,
                "zone_type": zone.zone_type,
                "center_lat": zone.center_lat,
                "center_lng": zone.center_lng,
                "radius_m": zone.radius_m,
            } for zone in zones])
            return
        self.serve_static(path)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        try:
            if path == "/api/demo/risk":
                json_response(self, 200, run_risk_demo())
                return
            if path == "/api/demo/facility":
                json_response(self, 200, run_facility_demo())
                return
            if path == "/api/gps":
                payload = read_json(self)
                facility_gps, risk_gps = gps_objects(payload)
                store.insert_gps(facility_gps)
                facility_events = facility_engine.process_gps(facility_gps)
                store.insert_facility_events(facility_events)
                risk = risk_pipeline.process_gps(risk_gps)
                json_response(self, 200, {
                    "ok": True,
                    "stored": True,
                    "vehicle_id": facility_gps.vehicle_id,
                    "timestamp": facility_gps.timestamp.isoformat(),
                    "facility_events": [asdict(event) for event in facility_events],
                    "risk_decision": safe_risk_payload(risk),
                })
                return
            json_response(self, 404, {"ok": False, "error": "not found", "path": path})
        except Exception as exc:
            json_response(self, 400, {"ok": False, "error": str(exc)})

    def serve_static(self, request_path: str) -> None:
        relative = "index.html" if request_path in ("", "/") else unquote(request_path.lstrip("/"))
        target = (BASE_DIR / relative).resolve()
        try:
            target.relative_to(BASE_DIR)
        except ValueError:
            json_response(self, 403, {"error": "forbidden"})
            return
        if not target.is_file():
            json_response(self, 404, {"error": "not found", "path": request_path})
            return
        body = target.read_bytes()
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if target.suffix in {".html", ".css", ".js", ".json"}:
            mime += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}", flush=True)


def run(host: str = "127.0.0.1", port: int = 8001) -> None:
    server = ThreadingHTTPServer((host, port), Handler)
    print("=" * 60)
    print("MOVE AI · 길새김 해커톤 프로토타입")
    print(f"URL: http://{host}:{port}")
    print(f"Smart Risk Pipeline: zones={len(zones)}, reports={len(reports)}, facilities={len(facilities)}")
    print("Ctrl+C로 종료")
    print("=" * 60)
    server.serve_forever()


if __name__ == "__main__":
    run()
