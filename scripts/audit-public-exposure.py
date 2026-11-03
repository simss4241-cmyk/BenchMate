"""Read-only publication audit. Never opens local .env or prints matched values."""
from pathlib import Path
import subprocess,re,json,math,urllib.request,urllib.error
from collections import Counter
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'data/security-audit';OUT.mkdir(parents=True,exist_ok=True)
def git(*args,repo=ROOT):
    return subprocess.check_output(['git','-c',f'safe.directory={repo.as_posix()}','-C',str(repo),*args],stderr=subprocess.DEVNULL)
PATTERNS={
 'provider_token':re.compile(rb'\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|AKIA[A-Z0-9]{16}|EAA[A-Za-z0-9]{60,})\b'),
 'private_key':re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
 'literal_credential':re.compile(rb'''(?i)(?:api[_-]?key|access[_-]?token|client[_-]?secret|authorization|password)\s*["']?\s*[:=]\s*["']([^"'\r\n]{16,})["']''')
}
def scan(data,where):
    if b'\x00' in data[:4000]:return []
    findings=[]
    for label,rx in PATTERNS.items():
        for m in rx.finditer(data):
            value=m.group(1) if label=='literal_credential' else m.group(0)
            if label=='literal_credential':
                low=value.lower()
                if any(x in low for x in [b'synthetic',b'example',b'placeholder',b'test-',b'not-a-',b'your_',b'your-',b'${',b'process.env',b'bearer ',b'check ',b'set ',b'enter ',b'replace']):continue
                if b' ' in value or len(value)>300:continue
                entropy=-sum((n/len(value))*math.log2(n/len(value)) for n in Counter(value).values())
                if entropy<3.5:continue
            findings.append(dict(location=where,kind=label,line=data[:m.start()].count(b'\n')+1))
    return findings
mirror=OUT/'public.git';objects=git('rev-list','--objects','--all',repo=mirror).decode().splitlines()
published=[];danger=[];blobs=0
for record in objects:
    oid,_,path=record.partition(' ')
    kind=git('cat-file','-t',oid,repo=mirror).decode().strip()
    if kind!='blob':continue
    blobs+=1
    if Path(path).name=='.env' or re.search(r'(?i)(?:^|/)(?:data|photos)/|\.(?:sqlite(?:-[a-z]+)?|db|p12|pfx|pem|key)$',path):danger.append(dict(path=path,object=oid))
    published+=scan(git('cat-file','blob',oid,repo=mirror),f'git:{oid}:{path}')
paths=set(x for x in git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\x00') if x)
local=[];count=0
for rel in sorted(paths):
    p=ROOT/rel
    if not p.is_file() or (p.name.startswith('.env') and p.name!='.env.example'):continue
    if p.suffix.lower() in ['.mp4','.mp3','.png','.jpg','.jpeg','.webp','.zip']:continue
    count+=1;local+=scan(p.read_bytes(),rel)
dist=[]
for p in (ROOT/'dist').rglob('*'):
    if p.is_file() and p.suffix in ['.html','.js','.css','.map']:dist+=scan(p.read_bytes(),str(p.relative_to(ROOT)))
report=dict(public_head=git('rev-parse','refs/heads/main',repo=mirror).decode().strip(),public_commits=int(git('rev-list','--all','--count',repo=mirror)),public_blobs_scanned=blobs,published_findings=published,published_sensitive_paths=danger,working_text_files_scanned=count,working_findings=local,frontend_bundle_findings=dist,local_env_read=False,limits=['Pattern-based credential scan, not a guarantee against every secret format.','Local .env contents were not opened or compared.','Published scan covers reachable objects in the downloaded public repository refs.','No account key rotation, permissions changes or live-provider requests performed.'])
(OUT/'credential-scan.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
