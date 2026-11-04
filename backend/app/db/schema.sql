-- 기존 교육용 메모와 상담 기록을 별도 테이블로 보관합니다.
CREATE TABLE IF NOT EXISTS demo_notes (
    id INTEGER PRIMARY KEY,
    chapter TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS consultations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    taxpayer_name TEXT NOT NULL,
    consulted_at TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
