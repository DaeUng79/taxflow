-- 교육용 임시 데이터 예시. 실제 상담 데이터의 스키마는 기능 구현 시 별도 설계합니다.
CREATE TABLE IF NOT EXISTS demo_notes (
    id INTEGER PRIMARY KEY,
    chapter TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
