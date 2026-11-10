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

-- 서류 원본과 분석 이력. 기존 상담 JSON은 그대로 유지합니다.
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'registered',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS documents_consultation_idx ON documents(consultation_id, id);
CREATE TABLE IF NOT EXISTS document_files (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    content BLOB NOT NULL,
    size_bytes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS document_pages (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    PRIMARY KEY(document_id, page_number)
);
CREATE TABLE IF NOT EXISTS extraction_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    raw_json TEXT,
    reviewed_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS extraction_runs_document_idx ON extraction_runs(document_id, id);

-- pages_json의 payments 항목은 label, value, payment_date 문자열을 보관합니다.
-- 이전 지급방식 정보는 손실 방지를 위해 기존 JSON에 유지할 수 있습니다.
-- 상담의 취득계약서는 문서별 현재 분석 결과 한 건만 관리합니다.
CREATE TABLE IF NOT EXISTS acquisition_results (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    pages_json TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 양도계약서의 현재 분석 결과를 취득계약서와 별도로 보관합니다.
CREATE TABLE IF NOT EXISTS transfer_results (
    document_id INTEGER PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    pages_json TEXT NOT NULL,
    confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0, 1)),
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 실제 수수 확인은 계약서의 약정 내용과 별도로 기록합니다.
CREATE TABLE IF NOT EXISTS settlement_confirmations (
    consultation_id INTEGER PRIMARY KEY REFERENCES consultations(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
