"""Add one harmless example row to the local SQLite database."""

from backend.app.db import connect, initialize


def main() -> None:
    initialize()
    with connect() as connection:
        exists = connection.execute(
            "SELECT 1 FROM demo_notes WHERE chapter = ? AND title = ?",
            ("02", "납세자 상담 샘플"),
        ).fetchone()
        if not exists:
            connection.execute(
                "INSERT INTO demo_notes (chapter, title, content) VALUES (?, ?, ?)",
                ("02", "납세자 상담 샘플", "가상 상담 화면의 입력 항목을 확인합니다."),
            )
    print("Demo data ready")


if __name__ == "__main__":
    main()
