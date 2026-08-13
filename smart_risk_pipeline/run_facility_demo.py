from __future__ import annotations

from pathlib import Path

from src.facility_engine import (
    FacilityEventEngine,
    format_facility_event,
    load_facilities,
    load_gps_timeseries,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def main() -> None:
    facilities = load_facilities(DATA_DIR / "facilities.geojson")
    gps_records = load_gps_timeseries(DATA_DIR / "gps_timeseries_sample.csv")
    engine = FacilityEventEngine(facilities)

    print("=== Facility Geofence Demo ===")
    print(f"Loaded facilities: {len(facilities)}")
    print(f"Loaded GPS records: {len(gps_records)}")
    print()

    event_count = 0
    for gps in gps_records:
        events = engine.process_gps(gps)
        for event in events:
            event_count += 1
            print(format_facility_event(event))

    print()
    print(f"Facility events: {event_count}")


if __name__ == "__main__":
    main()
