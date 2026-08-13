from __future__ import annotations

import argparse
import csv
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

from src.risk_pipeline import parse_datetime


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DEFAULT_SERVER_URL = "http://127.0.0.1:8001/gps"
KST = timezone(timedelta(hours=9))


def post_json(url: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def load_rows(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError(f"No GPS rows found: {path}")
    return rows


def row_offsets(rows: list[dict]) -> list[int]:
    first_time = parse_datetime(rows[0]["timestamp"])
    return [
        int((parse_datetime(row["timestamp"]) - first_time).total_seconds())
        for row in rows
    ]


def build_payload(row: dict, vehicle_id: str, timestamp: datetime) -> dict:
    return {
        "vehicle_id": vehicle_id,
        "timestamp": timestamp.isoformat(),
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "speed_kmh": float(row["speed_kmh"]),
        "heading": float(row["heading"]) if row.get("heading") else None,
        "accuracy_m": float(row["accuracy_m"]) if row.get("accuracy_m") else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Send moving truck GPS rows to the local backend.")
    parser.add_argument("--url", default=DEFAULT_SERVER_URL)
    parser.add_argument("--vehicle-id", default="TRUCK_001")
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--cycles", type=int, default=3, help="0 means repeat until Ctrl+C.")
    parser.add_argument("--csv", default=str(DATA_DIR / "gps_timeseries_sample.csv"))
    args = parser.parse_args()

    rows = load_rows(Path(args.csv))
    offsets = row_offsets(rows)
    route_duration = offsets[-1] + 10
    cycle = 0
    first_cycle_start = datetime.now(KST).replace(microsecond=0)

    print(f"Moving GPS simulator -> {args.url}")
    print(f"Vehicle: {args.vehicle_id}")
    print(f"Interval: {args.interval}s")
    print("Press Ctrl+C to stop.")

    while args.cycles == 0 or cycle < args.cycles:
        cycle_start = first_cycle_start + timedelta(seconds=route_duration * cycle)
        print(f"\nCycle {cycle + 1}")
        for row, offset in zip(rows, offsets):
            timestamp = cycle_start + timedelta(seconds=offset)
            payload = build_payload(row, args.vehicle_id, timestamp)
            result = post_json(args.url, payload)
            events = result.get("facility_events", [])
            event_text = ", ".join(event["event_type"] for event in events) or "-"
            print(
                f"{timestamp.isoformat()} | {args.vehicle_id} | "
                f"{payload['latitude']:.6f},{payload['longitude']:.6f} | "
                f"{payload['speed_kmh']:.1f}km/h | events={event_text}"
            )
            time.sleep(args.interval)
        cycle += 1


if __name__ == "__main__":
    main()
