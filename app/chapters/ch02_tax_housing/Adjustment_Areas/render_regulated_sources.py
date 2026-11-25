"""Rebuild the page previews for the two bundled reference PDFs."""
from pathlib import Path
import fitz

root = Path(__file__).resolve().parents[4] / 'app/chapters/ch02_tax_housing/Adjustment_Areas/regulated-areas'
output = root / 'pages'
output.mkdir(exist_ok=True)
for name in ('regions', 'history'):
    with fitz.open(root / f'{name}.pdf') as doc:
        for number, page in enumerate(doc, 1):
            page.get_pixmap(matrix=fitz.Matrix(1.35, 1.35), alpha=False).save(
                output / f'{name}-{number:02}.jpg', jpg_quality=80)
