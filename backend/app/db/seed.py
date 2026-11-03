"""Harmless example data for a newly created local database."""

import sqlite3


def seed_demo(connection: sqlite3.Connection) -> None:
    connection.execute(
        "INSERT INTO demo_notes (chapter, title, content) VALUES (?, ?, ?)",
        ("02", "납세자 상담 샘플", "가상 상담 화면의 입력 항목을 확인합니다."),
    )
