"""Read-only lookup of supplied designation history and its source pages."""
from contextlib import closing
from datetime import date
import json
import sqlite3
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

DB = Path(__file__).resolve().parents[4] / 'data/reference/regulated_area_history.sqlite3'
SOURCE_FILES = {1: ('지역별 자료', 'regions.pdf'), 2: ('연혁별 자료', 'history.pdf')}


def search(query, as_of=''):
    terms = query.split()
    if len(terms) > 8:
        return []
    conditions = ["instr(replace(province || region, ' ', ''), ?) > 0" for _ in terms]
    args = terms[:]
    if as_of:
        parsed = date.fromisoformat(as_of)
        if parsed.isoformat() != as_of:
            raise ValueError('기준일을 확인해 주세요.')
        # The source labels end_date as the effective release date.
        conditions.append('start_date <= ? AND (end_date IS NULL OR end_date > ?)')
        args.extend((as_of, as_of))
    with closing(sqlite3.connect(DB.as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        where = ' WHERE ' + ' AND '.join(conditions) if conditions else ''
        rows = db.execute('SELECT * FROM designation_history' + where + ' ORDER BY province, region, start_date DESC, id', args).fetchall()
    items = []
    for row in rows:
        item = dict(row)
        item['exclusions'] = json.loads(item.pop('exclusions_json'))
        item['source_title'], item['source_file'] = SOURCE_FILES.get(item['source_id'], ('출처 미확인', None))
        items.append(item)
    return items


def handle(handler):
    params = parse_qs(urlsplit(handler.path).query)
    query = params.get('q', [''])[0].strip()[:100]
    as_of = params.get('date', [''])[0].strip()
    try:
        handler.send_json({'query': query, 'date': as_of, 'items': search(query, as_of)})
    except ValueError:
        handler.send_json_error('기준일을 확인해 주세요.', 400)
    except (sqlite3.Error, json.JSONDecodeError):
        handler.send_json_error('조회 DB를 열 수 없습니다. 서버 설정을 확인해 주세요.', 500)
