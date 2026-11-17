"""Extract the three blank forms from the supplied educational R08 PDF.

Usage: .venv/bin/python scripts/build_filing_templates.py /path/to/B_검토본_R08.pdf
The educational values are a separate appended content section. Fail rather than
silently publish a background containing taxpayer values if that structure changes.
"""
import argparse
from pathlib import Path
import fitz


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    destination = Path(__file__).resolve().parents[1] / 'frontend/public/chapters/ch01_consultation/consultation/filing'
    marker = b'q\n0.0 0.0 595 841 re\nW\nn\n1 0 0 1 0 0 cm'
    with fitz.open(args.source) as document:
        if len(document) != 3:
            raise ValueError('Expected the three-page R08 reference.')
        for page in document:
            streams = page.get_contents()
            if len(streams) != 1:
                raise ValueError('Unexpected PDF content structure.')
            content = document.xref_stream(streams[0])
            if content.count(marker) != 1:
                raise ValueError('Cannot safely separate sample values from the form.')
            document.update_stream(streams[0], content[:content.index(marker)])
            # The first property column is filled by HTML. Remove only placeholder
            # glyphs; preserve the original grid, including intersecting rules.
            if page.number == 1:
                for block in page.get_text('dict')['blocks']:
                    for line in block.get('lines', []):
                        for span in line['spans']:
                            x, y, _, _ = span['bbox']
                            if 268 <= x <= 360 and 138 <= y <= 665:
                                page.add_redact_annot(span['bbox'], fill=False)
                page.apply_redactions(images=0, graphics=0)
            if any(value in page.get_text() for value in ('김가람', '최매수', '650,000,000', 'EDU-B-1001')):
                raise ValueError('Sample values remain in the template.')
        destination.mkdir(exist_ok=True)
        for page in document:
            page.get_pixmap(matrix=fitz.Matrix(3, 3)).save(destination / f'form-{page.number + 1}.png')


if __name__ == '__main__':
    main()
