"""Read-only demo consultation content for Chapter 02."""

from ...db import connect


def list_demo_notes() -> list[dict]:
    with connect() as connection:
        rows = connection.execute(
            "SELECT id, chapter, title, content, created_at "
            "FROM demo_notes ORDER BY id"
        ).fetchall()
    return [dict(row) for row in rows]
