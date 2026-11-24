"""Rebuild the pinned, offline OCR assets after npm ci --ignore-scripts --prefix scripts/ocr."""
from pathlib import Path
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parents[1]
DEPS = ROOT / 'scripts' / 'ocr' / 'node_modules'
DEST = ROOT / 'extension' / 'vendor' / 'ocr'


def build():
    expected = {'tesseract.js': '7.0.0', 'tesseract.js-core': '7.0.0',
                '@tesseract.js-data/eng': '1.0.0', '@tesseract.js-data/fra': '1.0.0'}
    for name, version in expected.items():
        actual = json.loads((DEPS / name / 'package.json').read_text())['version']
        if actual != version:
            raise ValueError(f'{name}: expected {version}, got {actual}')
    DEST.mkdir(parents=True, exist_ok=True)
    files = {DEPS / 'tesseract.js' / 'dist' / name: name for name in
             ('tesseract.min.js', 'worker.min.js', 'tesseract.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt')}
    files.update({path: path.name for path in (DEPS / 'tesseract.js-core').glob('*lstm.wasm*')})
    files[DEPS / 'tesseract.js-core' / 'LICENSE'] = 'CORE-LICENSE.txt'
    files[DEPS / 'tesseract.js' / 'LICENSE.md'] = 'TESSERACT-LICENSE.txt'
    for lang in ('eng', 'fra'):
        files[DEPS / f'@tesseract.js-data/{lang}/4.0.0_best_int/{lang}.traineddata.gz'] = f'{lang}.traineddata.gz'
    for source, name in files.items():
        shutil.copyfile(source, DEST / name)
    notice = ('Tesseract.js 7.0.0 and tesseract.js-core 7.0.0 (LSTM variants), Apache-2.0.\n'
              '@tesseract.js-data/eng 1.0.0 and @tesseract.js-data/fra 1.0.0 (npm metadata: MIT).\n'
              'Language training data: 4.0.0_best_int, Tesseract tessdata, Apache-2.0.\n'
              'https://github.com/naptha/tesseract.js\nhttps://github.com/naptha/tesseract.js-core\n'
              'https://github.com/naptha/tessdata\nhttps://github.com/tesseract-ocr/tessdata\n'
              'Bundled for local-only execution. No runtime CDN.\n\nSHA256\n')
    for name in sorted(files.values()):
        notice += hashlib.sha256((DEST / name).read_bytes()).hexdigest() + '  ' + name + '\n'
    (DEST / 'NOTICE.txt').write_text(notice)
    print(f'Bundled {len(files)} offline OCR assets.')


if __name__ == '__main__':
    build()
