from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

from src.risk_pipeline import (
    GPSPoint,
    SmartRiskPipeline,
    StaticWeatherProvider,
    format_decision,
    load_reports,
    load_risk_zones,
)


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"


def main() -> None:
    zones = load_risk_zones(DATA_DIR / "risk_zones.geojson")
    reports = load_reports(DATA_DIR / "reports.csv")
    weather_provider = StaticWeatherProvider()

    pipeline = SmartRiskPipeline(
        zones=zones,
        reports=reports,
        weather_provider=weather_provider,
        rolling_window_size=20,
        confidence_threshold=50,
    )

    target_zone = zones[0]
    kst = timezone(timedelta(hours=9))
    start_time = datetime(2026, 7, 8, 11, 30, 0, tzinfo=kst)

    print("=== Smart Risk Pipeline Demo ===")
    print(f"Loaded zones: {len(zones)}")
    print(f"Loaded reports: {len(reports)}")
    print(f"Target zone: {target_zone.zone_id} / {target_zone.name}")
    print()

    for second in range(20):
        gps = GPSPoint(
            device_id="demo-phone-001",
            timestamp=start_time + timedelta(seconds=second),
            latitude=target_zone.center_lat,
            longitude=target_zone.center_lng,
            speed_kmh=2.0,
            heading=90.0,
            accuracy_m=5.0,
        )
        decision = pipeline.process_gps(gps)
        print(f"t+{second + 1:02d}s {format_decision(decision)}")

    print()
    print("Demo complete.")
    print("Use src.risk_pipeline.SmartRiskPipeline.process_gps(...) with real phone GPS input.")


if __name__ == "__main__":
    main()
