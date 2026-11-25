"""Verify form-template generation in a disposable project directory."""
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import fitz

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = Path('app/chapters/ch02_tax_housing/filing/build_filing_templates.py')
OUTPUT = Path('app/chapters/ch02_tax_housing/filing')
MARKER = b'q\n0.0 0.0 595 841 re\nW\nn\n1 0 0 1 0 0 cm'


class FilingTemplateScriptTests(unittest.TestCase):
    def test_generates_three_forms_from_other_working_directory(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'project'
            script = root / SCRIPT
            script.parent.mkdir(parents=True)
            shutil.copy2(ROOT / SCRIPT, script)
            (root / OUTPUT).parent.mkdir(parents=True, exist_ok=True)
            source = root / 'synthetic.pdf'
            with fitz.open() as doc:
                for i in range(3):
                    page = doc.new_page(width=595, height=841)
                    page.insert_text((40, 50), f'FORM {i+1}')
                    xref = page.get_contents()[0]
                    doc.update_stream(xref, doc.xref_stream(xref) + b'\n' + MARKER + b'\nQ\n')
                doc.save(source)
            original = source.read_bytes()
            subprocess.run([sys.executable, str(script), str(source)], cwd=folder, check=True, capture_output=True, text=True)
            self.assertEqual(source.read_bytes(), original)
            for i in range(1, 4):
                image = root / OUTPUT / f'form-{i}.png'
                self.assertTrue(image.read_bytes().startswith(b'\x89PNG\r\n\x1a\n'))

    def test_rejects_unexpected_pdf_before_writing(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'project'
            script = root / SCRIPT
            script.parent.mkdir(parents=True)
            shutil.copy2(ROOT / SCRIPT, script)
            source = root / 'unexpected.pdf'
            with fitz.open() as doc:
                doc.new_page()
                doc.save(source)
            result = subprocess.run([sys.executable, str(script), str(source)], cwd=folder, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(list((root / OUTPUT).glob('form-*.png')), [])


if __name__ == '__main__':
    unittest.main()
