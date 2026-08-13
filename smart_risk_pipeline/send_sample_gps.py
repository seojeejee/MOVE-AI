from __future__ import annotations

import csv
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SERVER_URL = "http://127.0.0.1:8001/gps"


def post_json(url: str, payload: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def main() -> None:
    path = DATA_DIR / "gps_timeseries_sample.csv"
    print(f"Sending sample GPS rows from {path}")

    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            payload = {
                "vehicle_id": row["vehicle_id"],
                "timestamp": row["timestamp"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "speed_kmh": float(row["speed_kmh"]),
                "heading": float(row["heading"]) if row.get("heading") else None,
                "accuracy_m": float(row["accuracy_m"]) if row.get("accuracy_m") else None,
            }
            result = post_json(SERVER_URL, payload)
            print(json.dumps(result, ensure_ascii=False))
            time.sleep(0.2)


if __name__ == "__main__":
    main()
