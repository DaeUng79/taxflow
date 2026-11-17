"""Build the read-only reference database from the bundled source PDFs."""
import re
import sqlite3
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[5]
SOURCES = [('history', '조정대상지역 - 연혁별', 'history.pdf'), ('regions', '조정대상지역', 'regions.pdf')]
path = ROOT / 'data/reference/regulated_areas.sqlite3'
path.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(path) as db:
    db.executescript('DROP TABLE IF EXISTS pages; DROP TABLE IF EXISTS sources; CREATE TABLE sources (id TEXT PRIMARY KEY, title TEXT NOT NULL, filename TEXT NOT NULL); CREATE TABLE pages (source_id TEXT NOT NULL REFERENCES sources(id), page INTEGER NOT NULL, content TEXT NOT NULL, search_text TEXT NOT NULL, PRIMARY KEY(source_id,page));')
    for source_id, title, filename in SOURCES:
        db.execute('INSERT INTO sources VALUES (?, ?, ?)', (source_id, title, filename))
        with fitz.open(ROOT / 'frontend/public/chapters/ch01_tax_housing/Adjustment_Areas/regulated-areas' / filename) as doc:
            for number, page in enumerate(doc, 1):
                content = page.get_text(sort=True).strip()
                db.execute('INSERT INTO pages VALUES (?, ?, ?, ?)', (source_id, number, content, re.sub(r'\s+', '', content)))
print(path)
