"""Upgrade stored payment items without discarding legacy extraction data."""
import json
import re

_DATE_LABEL = re.compile(r'날짜|지급일(?:자)?|입금일(?:자)?|기일|일자')


def add_payment_dates(pages):
    """Add date fields and connect only a single unambiguous old date entry."""
    if not isinstance(pages, list):
        return pages
    groups = {}
    for page in pages:
        if not isinstance(page, dict) or not isinstance(page.get('payments'), list):
            continue
        for item in page['payments']:
            if not isinstance(item, dict) or not isinstance(item.get('label'), str):
                continue
            label = item['label']
            is_date = bool(_DATE_LABEL.search(label))
            key = re.sub(r'[\s:：·()\-]', '', _DATE_LABEL.sub('', label))
            if key and isinstance(item.get('value'), str):
                groups.setdefault(key, [[], []])[int(is_date)].append(item)
    for amounts, dates in groups.values():
        # A date already present, even an explicitly cleared one, is authoritative.
        if len(amounts) == len(dates) == 1 and 'payment_date' not in amounts[0]:
            amounts[0]['payment_date'] = dates[0]['value']
    for page in pages:
        if isinstance(page, dict) and isinstance(page.get('payments'), list):
            for item in page['payments']:
                if isinstance(item, dict) and 'payment_date' not in item:
                    item['payment_date'] = ''
    return pages


def migrate_payment_dates(connection):
    for table in ('acquisition_results', 'transfer_results'):
        for row in connection.execute(f'SELECT document_id, pages_json FROM {table}').fetchall():
            try:
                pages = json.loads(row['pages_json'])
                if not isinstance(pages, list):
                    continue
                before = json.dumps(pages, ensure_ascii=False, sort_keys=True)
                add_payment_dates(pages)
                if json.dumps(pages, ensure_ascii=False, sort_keys=True) != before:
                    connection.execute(f'UPDATE {table} SET pages_json=? WHERE document_id=?',
                                       (json.dumps(pages, ensure_ascii=False), row['document_id']))
            except (ValueError, TypeError):
                # Preserve unreadable legacy rows so they can be inspected separately.
                continue
