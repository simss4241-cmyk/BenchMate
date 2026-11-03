from pathlib import Path
import hashlib,json,re,zipfile
ROOT=Path(__file__).resolve().parent.parent;SOURCE=ROOT/'judge-preview';OUT=ROOT/'data/submission-ready';OUT.mkdir(exist_ok=True)
ALLOW={'index.html','style.css','app.js','state.js','sample.js','assets/ecu.jpg','assets/motors.jpg'}
actual={p.relative_to(SOURCE).as_posix() for p in SOURCE.rglob('*') if p.is_file()}
assert actual==ALLOW, f'Unexpected/missing package paths: {actual^ALLOW}'
for name in ALLOW:
    p=SOURCE/name
    if p.suffix not in ['.html','.js','.css']:continue
    text=p.read_text(encoding='utf-8')
    assert not re.search(r'\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon\s*\(|import\.meta\.env|process\.env|localStorage\.[^(]*\(.*META_API_KEY)',text),f'Network/provider capability in {name}'
    assert not re.search(r'\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|ghp_[A-Za-z0-9]{30,}|EAA[A-Za-z0-9]{60,})\b',text), f'Credential-like string in {name}'
    assert not re.search(r'[A-Z]:\\(?:Users|Projects)\\|benchmate\.sqlite|api\.meta\.ai|localhost:4317',text),f'Local/live reference in {name}'
html=(SOURCE/'index.html').read_text();assert "connect-src 'none'" in html and 'no live AI' in html
manifest={name:dict(bytes=(SOURCE/name).stat().st_size,sha256=hashlib.sha256((SOURCE/name).read_bytes()).hexdigest()) for name in sorted(ALLOW)}
archive=OUT/'BenchMate-static-preview.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for name in sorted(ALLOW):z.write(SOURCE/name,name)
with zipfile.ZipFile(archive) as z:assert set(z.namelist())==ALLOW and z.testzip() is None
(OUT/'preview-manifest.json').write_text(json.dumps(dict(archive=archive.name,bytes=archive.stat().st_size,files=manifest,scope='Static files only; no server, credentials, database or private runtime data'),indent=2))
print(json.dumps(dict(archive=str(archive),bytes=archive.stat().st_size,files=sorted(ALLOW),validation='Exact file allowlist, provider/network capability scan, credential-pattern scan, ZIP integrity'),indent=2))
