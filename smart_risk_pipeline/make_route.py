from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_OUTPUT = BASE_DIR / "data" / "planned_route.geojson"
DEFAULT_API_BASE = "https://api.heigit.org/openrouteservice"


def parse_lat_lng(value: str) -> tuple[float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 2:
        raise argparse.ArgumentTypeError("좌표는 \"위도,경도\" 형식으로 입력하세요.")

    try:
        lat = float(parts[0])
        lng = float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError("위도와 경도는 숫자여야 합니다.") from exc

    if not -90 <= lat <= 90:
        raise argparse.ArgumentTypeError("위도는 -90부터 90 사이여야 합니다.")
    if not -180 <= lng <= 180:
        raise argparse.ArgumentTypeError("경도는 -180부터 180 사이여야 합니다.")

    return lat, lng


def build_request_payload(start: tuple[float, float], end: tuple[float, float]) -> dict:
    start_lat, start_lng = start
    end_lat, end_lng = end
    return {
        # ORS는 [경도, 위도] 순서를 사용합니다.
        "coordinates": [[start_lng, start_lat], [end_lng, end_lat]],
        "instructions": True,
    }


def fetch_route(api_key: str, api_base: str, profile: str, payload: dict) -> dict:
    url = f"{api_base.rstrip('/')}/v2/directions/{profile}/geojson"
    body = json.dumps(payload).encode("utf-8")
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
            "Accept": "application/geo+json, application/json",
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"API 요청 실패: HTTP {exc.code}\n{error_body}") from exc
    except URLError as exc:
        raise RuntimeError(f"API 서버에 연결하지 못했습니다: {exc.reason}") from exc


def normalize_route_geojson(route_geojson: dict, route_id: str, name: str, profile: str) -> dict:
    if route_geojson.get("type") != "FeatureCollection":
        raise RuntimeError("API 응답이 GeoJSON FeatureCollection 형식이 아닙니다.")

    features = route_geojson.get("features") or []
    if not features:
        raise RuntimeError("API 응답에 경로 feature가 없습니다.")

    first = features[0]
    geometry = first.get("geometry") or {}
    if geometry.get("type") != "LineString":
        raise RuntimeError("API 응답의 첫 번째 경로가 LineString이 아닙니다.")

    properties = first.setdefault("properties", {})
    properties.update(
        {
            "route_id": route_id,
            "name": name,
            "source": "openrouteservice",
            "profile": profile,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    return {
        "type": "FeatureCollection",
        "features": [first],
    }


def route_summary(route_geojson: dict) -> tuple[float | None, float | None, int]:
    feature = route_geojson["features"][0]
    properties = feature.get("properties") or {}
    summary = properties.get("summary") or {}
    coordinates = (feature.get("geometry") or {}).get("coordinates") or []
    return summary.get("distance"), summary.get("duration"), len(coordinates)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="OpenRouteService API로 예정 운송 경로를 만들고 planned_route.geojson에 저장합니다."
    )
    parser.add_argument("--start", required=True, type=parse_lat_lng, help="출발지 좌표. 예: \"36.737074,127.073619\"")
    parser.add_argument("--end", required=True, type=parse_lat_lng, help="목적지 좌표. 예: \"36.735900,127.076000\"")
    parser.add_argument("--profile", default="driving-car", help="ORS 이동 프로필. 기본값: driving-car")
    parser.add_argument("--route-id", default="ROUTE_DEMO_001", help="저장할 경로 ID")
    parser.add_argument("--name", default="Demo planned route", help="지도에 표시할 경로 이름")
    parser.add_argument("--out", default=str(DEFAULT_OUTPUT), help="저장할 GeoJSON 경로")
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="ORS API base URL")
    args = parser.parse_args()

    api_key = os.environ.get("ORS_API_KEY", "").strip()
    if not api_key:
        print("ORS_API_KEY가 없습니다. 먼저 PowerShell에서 아래처럼 입력하세요.", file=sys.stderr)
        print('$env:ORS_API_KEY="복사한_API키"', file=sys.stderr)
        return 2

    payload = build_request_payload(args.start, args.end)
    route = fetch_route(api_key, args.api_base, args.profile, payload)
    planned_route = normalize_route_geojson(route, args.route_id, args.name, args.profile)

    output_path = Path(args.out).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(planned_route, ensure_ascii=False, indent=2), encoding="utf-8")

    distance_m, duration_s, point_count = route_summary(planned_route)
    print(f"Saved: {output_path}")
    if distance_m is not None:
        print(f"Distance: {distance_m / 1000:.2f} km")
    if duration_s is not None:
        print(f"Duration: {duration_s / 60:.1f} min")
    print(f"Route points: {point_count}")
    print("대시보드 새로고침: http://127.0.0.1:8001/admin")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
