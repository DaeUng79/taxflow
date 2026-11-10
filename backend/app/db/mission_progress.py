"""Store self-reported mission progress separately from consultation records."""
import json
import os
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = PROJECT_ROOT / 'data' / 'mission_progress.sqlite3'


def database_path():
    configured = os.environ.get('TAXFLOW_MISSION_DB_PATH')
    path = Path(configured).expanduser() if configured else DEFAULT_DB_PATH
    return path if path.is_absolute() else PROJECT_ROOT / path


def connect():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=10)
    db.row_factory = sqlite3.Row
    return db


def initialize():
    with connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS mission_progress (
            mission_id INTEGER PRIMARY KEY,
            checks TEXT NOT NULL,
            completed INTEGER NOT NULL CHECK(completed IN (0, 1)),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )''')


def read_progress():
    with connect() as db:
        rows = db.execute('SELECT mission_id, checks, completed FROM mission_progress ORDER BY mission_id').fetchall()
    return [{'id': row['mission_id'], 'checks': json.loads(row['checks']), 'completed': bool(row['completed'])} for row in rows]


def save_progress(item):
    with connect() as db:
        db.execute("""INSERT INTO mission_progress (mission_id, checks, completed)
                      VALUES (?, ?, ?) ON CONFLICT(mission_id) DO UPDATE SET
                      checks=excluded.checks, completed=excluded.completed,
                      updated_at=CURRENT_TIMESTAMP""",
                   (item['id'], json.dumps(item['checks']), int(item['completed'])))


def clear_progress():
    with connect() as db:
        db.execute('DELETE FROM mission_progress')
