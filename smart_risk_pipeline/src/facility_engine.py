from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from src.risk_pipeline import parse_datetime, point_in_geometry


@dataclass(frozen=True)
class Facility:
    facility_id: str
    name: str
    facility_type: str
    center_lat: float
    center_lng: float
    radius_m: float
    geometry: dict[str, Any]


@dataclass(frozen=True)
class VehicleGPS:
    vehicle_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    speed_kmh: float
    heading: float | None = None
    accuracy_m: float | None = None


@dataclass(frozen=True)
class FacilityEvent:
    vehicle_id: str
    facility_id: str
    facility_name: str
    event_type: str
    timestamp: datetime
    dwell_seconds: int
    speed_kmh: float


@dataclass
class FacilityVisitState:
    inside: bool = False
    entered_at: datetime | None = None


def _float_or_none(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _polygon_center(geometry: dict[str, Any]) -> tuple[float, float]:
    coordinates = geometry.get("coordinates", [])
    if geometry.get("type") == "Polygon" and coordinates:
        ring = coordinates[0]
    elif geometry.get("type") == "MultiPolygon" and coordinates and coordinates[0]:
        ring = coordinates[0][0]
    else:
        raise ValueError("facility geometry must be Polygon or MultiPolygon")

    unique_points = ring[:-1] if ring and ring[0] == ring[-1] else ring
    if not unique_points:
        raise ValueError("facility polygon has no coordinates")

    lng = sum(point[0] for point in unique_points) / len(unique_points)
    lat = sum(point[1] for point in unique_points) / len(unique_points)
    return lat, lng


def load_facilities(path: str | Path) -> list[Facility]:
    with Path(path).open("r", encoding="utf-8") as file:
        data = json.load(file)

    facilities: list[Facility] = []
    for index, feature in enumerate(data.get("features", []), start=1):
        properties = {str(k).strip(): v for k, v in feature.get("properties", {}).items()}
        geometry = feature.get("geometry", {})
        if geometry.get("type") not in {"Polygon", "MultiPolygon"}:
            continue

        center_lat, center_lng = _polygon_center(geometry)
        facilities.append(
            Facility(
                facility_id=str(properties.get("facility_id") or f"FAC_{index:03d}"),
                name=str(properties.get("name") or f"Facility {index}"),
                facility_type=str(properties.get("type") or "loading_zone").strip(),
                center_lat=float(properties.get("center_lat") or center_lat),
                center_lng=float(properties.get("center_lng") or center_lng),
                radius_m=float(properties.get("radius_m") or 1000),
                geometry=geometry,
            )
        )
    return facilities


def load_gps_timeseries(path: str | Path) -> list[VehicleGPS]:
    records: list[VehicleGPS] = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            records.append(
                VehicleGPS(
                    vehicle_id=str(row["vehicle_id"]).strip(),
                    timestamp=parse_datetime(str(row["timestamp"]).strip()),
                    latitude=float(row["latitude"]),
                    longitude=float(row["longitude"]),
                    speed_kmh=float(row["speed_kmh"]),
                    heading=_float_or_none(row.get("heading")),
                    accuracy_m=_float_or_none(row.get("accuracy_m")),
                )
            )
    return sorted(records, key=lambda record: (record.vehicle_id, record.timestamp))


class FacilityEventEngine:
    def __init__(self, facilities: list[Facility]) -> None:
        self.facilities = facilities
        self.states: dict[tuple[str, str], FacilityVisitState] = {}

    def process_gps(self, gps: VehicleGPS) -> list[FacilityEvent]:
        events: list[FacilityEvent] = []

        for facility in self.facilities:
            key = (gps.vehicle_id, facility.facility_id)
            state = self.states.setdefault(key, FacilityVisitState())
            inside = point_in_geometry(gps.latitude, gps.longitude, facility.geometry)

            if inside and not state.inside:
                state.inside = True
                state.entered_at = gps.timestamp
                events.append(self._make_event(gps, facility, "entered", 0))
                continue

            if inside and state.inside:
                dwell_seconds = self._dwell_seconds(state.entered_at, gps.timestamp)
                events.append(self._make_event(gps, facility, "waiting", dwell_seconds))
                continue

            if not inside and state.inside:
                dwell_seconds = self._dwell_seconds(state.entered_at, gps.timestamp)
                events.append(self._make_event(gps, facility, "exited", dwell_seconds))
                state.inside = False
                state.entered_at = None

        return events

    @staticmethod
    def _dwell_seconds(entered_at: datetime | None, now: datetime) -> int:
        if entered_at is None:
            return 0
        return max(int((now - entered_at).total_seconds()), 0)

    @staticmethod
    def _make_event(
        gps: VehicleGPS,
        facility: Facility,
        event_type: str,
        dwell_seconds: int,
    ) -> FacilityEvent:
        return FacilityEvent(
            vehicle_id=gps.vehicle_id,
            facility_id=facility.facility_id,
            facility_name=facility.name,
            event_type=event_type,
            timestamp=gps.timestamp,
            dwell_seconds=dwell_seconds,
            speed_kmh=gps.speed_kmh,
        )


def format_facility_event(event: FacilityEvent) -> str:
    return (
        f"{event.timestamp.isoformat()} | {event.vehicle_id} | "
        f"{event.facility_name} | {event.event_type} | "
        f"dwell={event.dwell_seconds}s | speed={event.speed_kmh}km/h"
    )
