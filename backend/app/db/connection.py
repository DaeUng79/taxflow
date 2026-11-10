"""SQLite connection and schema setup for local demo data."""

import os
import sqlite3
from pathlib import Path

from .seed import seed_demo
from .payment_dates import migrate_payment_dates

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "taxflow.sqlite3"


def database_path() -> Path:
    configured = os.environ.get("TAXFLOW_DB_PATH")
    if not configured:
        return DEFAULT_DB_PATH
    path = Path(configured).expanduser()
    return path if path.is_absolute() else PROJECT_ROOT / path


def connect() -> sqlite3.Connection:
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize() -> None:
    is_new_database = not database_path().exists()
    schema = Path(__file__).with_name("schema.sql").read_text(encoding="utf-8")
    with connect() as connection:
        connection.executescript(schema)
        migrate_payment_dates(connection)
        if is_new_database:
            seed_demo(connection)
