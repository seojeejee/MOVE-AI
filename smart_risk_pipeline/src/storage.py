from __future__ import annotations

import sqlite3
from pathlib import Path

from src.facility_engine import FacilityEvent, VehicleGPS


SCHEMA = """
CREATE TABLE IF NOT EXISTS gps_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed_kmh REAL NOT NULL,
    heading REAL,
    accuracy_m REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_vehicle_time
ON gps_logs(vehicle_id, timestamp);

CREATE TABLE IF NOT EXISTS facility_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id TEXT NOT NULL,
    facility_id TEXT NOT NULL,
    facility_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    dwell_seconds INTEGER NOT NULL,
    speed_kmh REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_facility_events_vehicle_time
ON facility_events(vehicle_id, timestamp);
"""


class SQLiteStore:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)

    def insert_gps(self, gps: VehicleGPS) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO gps_logs (
                    vehicle_id, timestamp, latitude, longitude,
                    speed_kmh, heading, accuracy_m
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    gps.vehicle_id,
                    gps.timestamp.isoformat(),
                    gps.latitude,
                    gps.longitude,
                    gps.speed_kmh,
                    gps.heading,
                    gps.accuracy_m,
                ),
            )

    def insert_facility_events(self, events: list[FacilityEvent]) -> None:
        if not events:
            return
        with self.connect() as conn:
            conn.executemany(
                """
                INSERT INTO facility_events (
                    vehicle_id, facility_id, facility_name, event_type,
                    timestamp, dwell_seconds, speed_kmh
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        event.vehicle_id,
                        event.facility_id,
                        event.facility_name,
                        event.event_type,
                        event.timestamp.isoformat(),
                        event.dwell_seconds,
                        event.speed_kmh,
                    )
                    for event in events
                ],
            )

    def latest_vehicle_positions(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT g.*
                FROM gps_logs g
                WHERE g.id = (
                    SELECT g2.id
                    FROM gps_logs g2
                    WHERE g2.vehicle_id = g.vehicle_id
                    ORDER BY g2.timestamp DESC, g2.id DESC
                    LIMIT 1
                )
                ORDER BY g.vehicle_id
                """
            ).fetchall()
        return [dict(row) for row in rows]

    def recent_vehicle_history(self, limit: int = 80) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM (
                    SELECT *
                    FROM gps_logs
                    ORDER BY id DESC
                    LIMIT ?
                )
                ORDER BY id ASC
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def recent_facility_events(self, limit: int = 50) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM facility_events
                ORDER BY timestamp DESC, id DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def facility_status(self) -> list[dict]:
        with self.connect() as conn:
            rows = conn.execute(
                """
                SELECT e.*
                FROM facility_events e
                WHERE e.id = (
                    SELECT e2.id
                    FROM facility_events e2
                    WHERE e2.vehicle_id = e.vehicle_id
                    AND e2.facility_id = e.facility_id
                    ORDER BY e2.timestamp DESC, e2.id DESC
                    LIMIT 1
                )
                ORDER BY e.facility_id, e.vehicle_id
                """
            ).fetchall()
        return [dict(row) for row in rows]
