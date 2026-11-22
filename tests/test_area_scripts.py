"""Run the area generators against a disposable project-shaped fixture."""
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import unittest

import fitz

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = Path('app/chapters/ch01_tax_housing/Adjustment_Areas')
SOURCES = Path('app/chapters/ch01_tax_housing/Adjustment_Areas/regulated-areas')


class AreaScriptsTests(unittest.TestCase):
    def test_generators_find_project_root_and_use_separate_database(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'project'
            script_dir = root / SCRIPTS
            source_dir = root / SOURCES
            script_dir.mkdir(parents=True)
            source_dir.mkdir(parents=True)
            for name in ('render_regulated_sources.py', 'build_regulated_areas.py'):
                shutil.copy2(ROOT / SCRIPTS / name, script_dir / name)
            for name in ('regions', 'history'):
                with fitz.open() as doc:
                    doc.new_page().insert_text((50, 50), f'{name} sample')
                    doc.save(source_dir / f'{name}.pdf')
            other_db = root / 'data/reference/regulated_area_history.sqlite3'
            other_db.parent.mkdir(parents=True)
            other_db.write_bytes(b'unchanged test database')
            for name in ('render_regulated_sources.py', 'build_regulated_areas.py'):
                subprocess.run([sys.executable, str(script_dir / name)], cwd=folder, check=True, capture_output=True, text=True)
            for name in ('regions', 'history'):
                self.assertTrue((source_dir / 'pages' / f'{name}-01.jpg').is_file())
            with sqlite3.connect(root / 'data/reference/regulated_areas.sqlite3') as db:
                rows = db.execute('SELECT source_id, page, content FROM pages ORDER BY source_id').fetchall()
            self.assertEqual([(r[0], r[1]) for r in rows], [('history', 1), ('regions', 1)])
            self.assertIn('history sample', rows[0][2])
            self.assertEqual(other_db.read_bytes(), b'unchanged test database')


if __name__ == '__main__':
    unittest.main()
