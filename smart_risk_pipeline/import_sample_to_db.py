from __future__ import annotations

from pathlib import Path

from src.facility_engine import FacilityEventEngine, load_facilities, load_gps_timeseries
from src.storage import SQLiteStore


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def main() -> None:
    store = SQLiteStore(DATA_DIR / "gps_logs.db")
    facilities = load_facilities(DATA_DIR / "facilities.geojson")
    gps_records = load_gps_timeseries(DATA_DIR / "gps_timeseries_sample.csv")
    engine = FacilityEventEngine(facilities)

    for gps in gps_records:
        store.insert_gps(gps)
        events = engine.process_gps(gps)
        store.insert_facility_events(events)

    print("Imported sample GPS rows:", len(gps_records))
    print("Latest vehicles:", store.latest_vehicle_positions())
    print("Facility status:", store.facility_status())
    print("Recent events:", store.recent_facility_events(10))


if __name__ == "__main__":
    main()
