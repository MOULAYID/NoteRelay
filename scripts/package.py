from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json
root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
(root / 'artifacts').mkdir(exist_ok=True)
with ZipFile(root / 'artifacts' / f'NoteRelay-{version}.zip', 'w', ZIP_DEFLATED) as archive:
    for file in sorted((root / 'dist').rglob('*')):
        if file.is_file(): archive.write(file, file.relative_to(root / 'dist'))
print(f'artifacts/NoteRelay-{version}.zip')
