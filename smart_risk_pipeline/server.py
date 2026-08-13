from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from src.facility_engine import FacilityEventEngine, VehicleGPS, load_facilities
from src.risk_pipeline import parse_datetime
from src.storage import SQLiteStore


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "gps_logs.db"
ADMIN_HTML_PATH = BASE_DIR / "admin.html"
PLANNED_ROUTE_PATH = DATA_DIR / "planned_route.geojson"
SERVER_VERSION = "moving-dashboard-v2-route"

store = SQLiteStore(DB_PATH)
facilities = load_facilities(DATA_DIR / "facilities.geojson")
facility_engine = FacilityEventEngine(facilities)


def json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict | list) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.end_headers()
    handler.wfile.write(body)


def html_response(handler: BaseHTTPRequestHandler, status: int, html: str) -> None:
    body = html.encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def geojson_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/geo+json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    return json.loads(raw.decode("utf-8"))


def gps_from_payload(payload: dict) -> VehicleGPS:
    return VehicleGPS(
        vehicle_id=str(payload["vehicle_id"]).strip(),
        timestamp=parse_datetime(str(payload["timestamp"]).strip()),
        latitude=float(payload["latitude"]),
        longitude=float(payload["longitude"]),
        speed_kmh=float(payload.get("speed_kmh", 0)),
        heading=float(payload["heading"]) if payload.get("heading") is not None else None,
        accuracy_m=float(payload["accuracy_m"]) if payload.get("accuracy_m") is not None else None,
    )


def latest_per_vehicle(rows: list[dict]) -> list[dict]:
    latest: dict[str, dict] = {}
    for row in rows:
        vehicle_id = row.get("vehicle_id")
        if not vehicle_id:
            continue

        current = latest.get(vehicle_id)
        row_key = (str(row.get("timestamp", "")), int(row.get("id", 0)))
        current_key = (
            str(current.get("timestamp", "")),
            int(current.get("id", 0)),
        ) if current else ("", 0)

        if current is None or row_key > current_key:
            latest[vehicle_id] = row

    return [latest[key] for key in sorted(latest)]


class RequestHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self) -> None:
        json_response(self, 200, {"ok": True})

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        print(f"[GET] {path}", flush=True)
        if path in ("/", "/admin"):
            html_response(self, 200, ADMIN_HTML_PATH.read_text(encoding="utf-8"))
            return
        if path == "/health":
            json_response(
                self,
                200,
                {"ok": True, "version": SERVER_VERSION, "facilities": len(facilities)},
            )
            return
        if path == "/facilities.geojson":
            geojson_response(self, 200, json.loads((DATA_DIR / "facilities.geojson").read_text(encoding="utf-8")))
            return
        if path == "/planned_route.geojson":
            if PLANNED_ROUTE_PATH.exists():
                geojson_response(self, 200, json.loads(PLANNED_ROUTE_PATH.read_text(encoding="utf-8")))
            else:
                geojson_response(self, 200, {"type": "FeatureCollection", "features": []})
            return
        if path == "/vehicles/latest":
            json_response(self, 200, latest_per_vehicle(store.latest_vehicle_positions()))
            return
        if path == "/vehicles/history":
            limit = int(query.get("limit", ["80"])[0])
            json_response(self, 200, store.recent_vehicle_history(limit=limit))
            return
        if path == "/facilities/events":
            json_response(self, 200, store.recent_facility_events())
            return
        if path == "/facilities/status":
            json_response(self, 200, store.facility_status())
            return
        json_response(self, 404, {"error": "not found", "path": path})

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        print(f"[POST] {path}", flush=True)
        if path != "/gps":
            json_response(self, 404, {"error": "not found", "path": path})
            return

        try:
            payload = read_json_body(self)
            gps = gps_from_payload(payload)
            store.insert_gps(gps)
            events = facility_engine.process_gps(gps)
            store.insert_facility_events(events)
            print(
                f"  stored gps vehicle={gps.vehicle_id} time={gps.timestamp.isoformat()} "
                f"events={len(events)}",
                flush=True,
            )
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "stored": True,
                    "vehicle_id": gps.vehicle_id,
                    "timestamp": gps.timestamp.isoformat(),
                    "facility_events": [
                        {
                            "facility_id": event.facility_id,
                            "facility_name": event.facility_name,
                            "event_type": event.event_type,
                            "dwell_seconds": event.dwell_seconds,
                        }
                        for event in events
                    ],
                },
            )
        except Exception as exc:
            json_response(self, 400, {"ok": False, "error": str(exc)})

    def log_message(self, format: str, *args) -> None:
        print(f"{self.address_string()} - {format % args}", flush=True)


def run(host: str = "0.0.0.0", port: int = 8001) -> None:
    server = ThreadingHTTPServer((host, port), RequestHandler)
    print("=== GPS Backend Server ===")
    print(f"Version: {SERVER_VERSION}")
    print(f"Listening: http://{host}:{port}")
    print(f"Database: {DB_PATH}")
    print("Endpoints:")
    print("  GET  /admin")
    print("  POST /gps")
    print("  GET  /planned_route.geojson")
    print("  GET  /vehicles/latest")
    print("  GET  /vehicles/history")
    print("  GET  /facilities/status")
    print("  GET  /facilities/events")
    server.serve_forever()


if __name__ == "__main__":
    run()
