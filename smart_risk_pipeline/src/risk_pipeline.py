from __future__ import annotations

import csv
import json
import math
from collections import defaultdict, deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class GPSPoint:
    device_id: str
    timestamp: datetime
    latitude: float
    longitude: float
    speed_kmh: float
    heading: float | None = None
    accuracy_m: float | None = None


@dataclass(frozen=True)
class WeatherSnapshot:
    is_raining: bool = False
    precipitation_mm: float = 0.0
    temperature_c: float | None = None
    weather_code: str | None = None


@dataclass(frozen=True)
class FieldReport:
    report_id: str
    timestamp: datetime
    zone_id: str
    raw_text: str
    event_type: str
    severity: int = 1
    source: str = "stt"


@dataclass
class RiskZone:
    zone_id: str
    name: str
    zone_type: str
    center_lat: float
    center_lng: float
    radius_m: float
    geometry: dict[str, Any]
    properties: dict[str, Any] = field(default_factory=dict)


@dataclass
class RiskDecision:
    status: str
    triggered: bool
    zone_id: str | None = None
    zone_name: str | None = None
    distance_m: float | None = None
    confidence_score: float = 0.0
    anomaly_type: str | None = None
    llm_should_preload: bool = False
    llm_should_trigger: bool = False
    briefing: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


def parse_datetime(value: str) -> datetime:
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return earth_radius_m * c


def point_in_ring(latitude: float, longitude: float, ring: list[list[float]]) -> bool:
    inside = False
    x = longitude
    y = latitude
    n = len(ring)
    if n < 3:
        return False

    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        intersects = (yi > y) != (yj > y)
        if intersects:
            x_at_y = (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
            if x < x_at_y:
                inside = not inside
        j = i
    return inside


def point_in_geometry(latitude: float, longitude: float, geometry: dict[str, Any]) -> bool:
    geom_type = geometry.get("type")
    coordinates = geometry.get("coordinates", [])

    if geom_type == "Polygon":
        if not coordinates:
            return False
        outer = coordinates[0]
        holes = coordinates[1:]
        return point_in_ring(latitude, longitude, outer) and not any(
            point_in_ring(latitude, longitude, hole) for hole in holes
        )

    if geom_type == "MultiPolygon":
        for polygon in coordinates:
            if not polygon:
                continue
            outer = polygon[0]
            holes = polygon[1:]
            if point_in_ring(latitude, longitude, outer) and not any(
                point_in_ring(latitude, longitude, hole) for hole in holes
            ):
                return True

    return False


def load_risk_zones(path: str | Path) -> list[RiskZone]:
    with Path(path).open("r", encoding="utf-8") as file:
        data = json.load(file)

    zones: list[RiskZone] = []
    for index, feature in enumerate(data.get("features", []), start=1):
        properties = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        zone_id = str(properties.get("zone_id") or f"ZONE_{index:03d}")
        name = str(properties.get("name") or zone_id)
        zone_type = str(properties.get("type") or "unknown")
        center_lat = float(properties.get("center_lat"))
        center_lng = float(properties.get("center_lng"))
        radius_m = float(properties.get("radius_m") or 1000)

        zones.append(
            RiskZone(
                zone_id=zone_id,
                name=name,
                zone_type=zone_type,
                center_lat=center_lat,
                center_lng=center_lng,
                radius_m=radius_m,
                geometry=geometry,
                properties=properties,
            )
        )
    return zones


def load_reports(path: str | Path) -> list[FieldReport]:
    reports: list[FieldReport] = []
    report_path = Path(path)
    if not report_path.exists():
        return reports

    with report_path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            reports.append(
                FieldReport(
                    report_id=str(row.get("report_id", "")).strip(),
                    timestamp=parse_datetime(str(row.get("timestamp", "")).strip()),
                    zone_id=str(row.get("zone_id", "")).strip(),
                    raw_text=str(row.get("raw_text", "")).strip(),
                    event_type=str(row.get("event_type", "")).strip(),
                    severity=int(row.get("severity", "1") or 1),
                    source=str(row.get("source", "stt")).strip() or "stt",
                )
            )
    return reports


class StaticWeatherProvider:
    def __init__(self, default: WeatherSnapshot | None = None) -> None:
        self.default = default or WeatherSnapshot()
        self.by_zone: dict[str, WeatherSnapshot] = {}

    def set_zone_weather(self, zone_id: str, weather: WeatherSnapshot) -> None:
        self.by_zone[zone_id] = weather

    def get_weather(self, zone: RiskZone, gps: GPSPoint) -> WeatherSnapshot:
        return self.by_zone.get(zone.zone_id, self.default)


class SmartRiskPipeline:
    def __init__(
        self,
        zones: list[RiskZone],
        reports: list[FieldReport] | None = None,
        weather_provider: StaticWeatherProvider | None = None,
        rolling_window_size: int = 20,
        confidence_threshold: float = 50.0,
    ) -> None:
        self.zones = zones
        self.reports = reports or []
        self.weather_provider = weather_provider or StaticWeatherProvider()
        self.rolling_window_size = rolling_window_size
        self.confidence_threshold = confidence_threshold
        self.speed_windows: dict[tuple[str, str], deque[float]] = defaultdict(
            lambda: deque(maxlen=self.rolling_window_size)
        )

    def process_gps(self, gps: GPSPoint) -> RiskDecision:
        near_candidates: list[tuple[RiskZone, float]] = []
        for zone in self.zones:
            distance_m = haversine_m(gps.latitude, gps.longitude, zone.center_lat, zone.center_lng)
            if distance_m <= zone.radius_m:
                near_candidates.append((zone, distance_m))

        if not near_candidates:
            return RiskDecision(
                status="pass_center_radius",
                triggered=False,
                details={"reason": "all ROI centers are farther than radius_m"},
            )

        nearest_outside: tuple[RiskZone, float] | None = None
        for zone, distance_m in sorted(near_candidates, key=lambda item: item[1]):
            if point_in_geometry(gps.latitude, gps.longitude, zone.geometry):
                return self._process_inside_zone(gps, zone, distance_m)
            nearest_outside = (zone, distance_m)

        zone, distance_m = nearest_outside or near_candidates[0]
        return RiskDecision(
            status="pass_polygon",
            triggered=False,
            zone_id=zone.zone_id,
            zone_name=zone.name,
            distance_m=distance_m,
            llm_should_preload=True,
            details={"reason": "inside 1km center filter, outside polygon"},
        )

    def _process_inside_zone(self, gps: GPSPoint, zone: RiskZone, distance_m: float) -> RiskDecision:
        key = (gps.device_id, zone.zone_id)
        window = self.speed_windows[key]
        window.append(gps.speed_kmh)

        if len(window) < self.rolling_window_size:
            return RiskDecision(
                status="inside_polygon_warming_up",
                triggered=False,
                zone_id=zone.zone_id,
                zone_name=zone.name,
                distance_m=distance_m,
                llm_should_preload=True,
                details={
                    "samples": len(window),
                    "required_samples": self.rolling_window_size,
                    "latest_speed_kmh": gps.speed_kmh,
                },
            )

        weather = self.weather_provider.get_weather(zone, gps)
        anomaly = self._detect_anomaly(zone, list(window), weather)
        if not anomaly["matched"]:
            return RiskDecision(
                status="inside_polygon_monitoring",
                triggered=False,
                zone_id=zone.zone_id,
                zone_name=zone.name,
                distance_m=distance_m,
                llm_should_preload=True,
                details=anomaly,
            )

        confidence = self._calculate_confidence(zone, gps.timestamp, time_series_matched=True)
        if confidence < self.confidence_threshold:
            return RiskDecision(
                status="low_confidence_monitoring",
                triggered=False,
                zone_id=zone.zone_id,
                zone_name=zone.name,
                distance_m=distance_m,
                confidence_score=confidence,
                anomaly_type=anomaly["type"],
                llm_should_preload=True,
                details=anomaly,
            )

        briefing = self._build_briefing(zone, anomaly, confidence, weather)
        return RiskDecision(
            status="final_risk_confirmed",
            triggered=True,
            zone_id=zone.zone_id,
            zone_name=zone.name,
            distance_m=distance_m,
            confidence_score=confidence,
            anomaly_type=anomaly["type"],
            llm_should_preload=True,
            llm_should_trigger=True,
            briefing=briefing,
            details=anomaly,
        )

    def _detect_anomaly(
        self,
        zone: RiskZone,
        speeds: list[float],
        weather: WeatherSnapshot,
    ) -> dict[str, Any]:
        rolling_max = max(speeds)
        rolling_mean = sum(speeds) / len(speeds)
        zone_type = zone.zone_type
        risk_rule = str(zone.properties.get("risk_rule") or "")

        if zone_type == "habitual_congestion" or risk_rule == "rolling_20_max_speed_lte_3":
            matched = rolling_max <= 3
            return {
                "matched": matched,
                "type": "congestion_anomaly",
                "rolling_max_kmh": round(rolling_max, 2),
                "rolling_mean_kmh": round(rolling_mean, 2),
                "rule": "rolling(20).max() <= 3km/h",
            }

        if zone_type == "rainy_mountain_road" or risk_rule == "rain_and_speed":
            threshold = float(zone.properties.get("speed_threshold_kmh") or 50)
            matched = weather.is_raining and rolling_mean >= threshold
            return {
                "matched": matched,
                "type": "rain_speed_anomaly",
                "rolling_max_kmh": round(rolling_max, 2),
                "rolling_mean_kmh": round(rolling_mean, 2),
                "is_raining": weather.is_raining,
                "rule": f"rain + rolling(20).mean() >= {threshold:g}km/h",
            }

        return {
            "matched": False,
            "type": "unknown_zone_type",
            "rolling_max_kmh": round(rolling_max, 2),
            "rolling_mean_kmh": round(rolling_mean, 2),
            "rule": "no matching rule",
        }

    def _calculate_confidence(
        self,
        zone: RiskZone,
        now: datetime,
        time_series_matched: bool,
    ) -> float:
        time_series_score = 100.0 if time_series_matched else 0.0
        zone_reports = [report for report in self.reports if report.zone_id == zone.zone_id]
        repeated_report_score = min(len(zone_reports) / 3.0, 1.0) * 100.0
        recency_score = self._recency_score(zone_reports, now)

        return round(
            time_series_score * 0.40
            + repeated_report_score * 0.30
            + recency_score * 0.30,
            2,
        )

    @staticmethod
    def _recency_score(reports: list[FieldReport], now: datetime) -> float:
        if not reports:
            return 0.0
        latest = max(report.timestamp for report in reports)
        if latest.tzinfo is None:
            latest = latest.replace(tzinfo=timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        age_hours = max((now - latest).total_seconds() / 3600.0, 0.0)

        if age_hours <= 24:
            return 100.0
        if age_hours >= 168:
            return 0.0
        return max(0.0, 100.0 * (1 - (age_hours - 24) / 144))

    def _build_briefing(
        self,
        zone: RiskZone,
        anomaly: dict[str, Any],
        confidence: float,
        weather: WeatherSnapshot,
    ) -> str:
        if anomaly["type"] == "congestion_anomaly":
            return (
                f"{zone.name} 진입 확인. 최근 {self.rolling_window_size}초 최대 속도가 "
                f"{anomaly['rolling_max_kmh']}km/h로 정체 위험이 높습니다. "
                f"위험 신뢰도 {confidence}점입니다. 서행과 차간거리 확보가 필요합니다."
            )

        if anomaly["type"] == "rain_speed_anomaly":
            rain_text = "강수 감지" if weather.is_raining else "강수 미감지"
            return (
                f"{zone.name} 진입 확인. {rain_text}, 최근 평균 속도 "
                f"{anomaly['rolling_mean_kmh']}km/h입니다. "
                f"위험 신뢰도 {confidence}점입니다. 감속 운행이 필요합니다."
            )

        return f"{zone.name} 위험 조건 감지. 위험 신뢰도 {confidence}점입니다."


def format_decision(decision: RiskDecision) -> str:
    if decision.triggered:
        return (
            f"[위험확정] {decision.zone_name} | confidence={decision.confidence_score} | "
            f"anomaly={decision.anomaly_type} | briefing={decision.briefing}"
        )
    if decision.zone_id:
        return (
            f"[{decision.status}] {decision.zone_name} | preload={decision.llm_should_preload} | "
            f"details={decision.details}"
        )
    return f"[{decision.status}] {decision.details}"
