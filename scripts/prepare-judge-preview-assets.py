"""Curate only two already-demonstrated photos and the recorded ECU annotations."""
from pathlib import Path
import sqlite3,json
from PIL import Image,ImageOps
ROOT=Path(__file__).resolve().parent.parent;OUT=ROOT/'judge-preview';(OUT/'assets').mkdir(parents=True,exist_ok=True)
db=sqlite3.connect(f'file:{(ROOT/"data/benchmate.sqlite").as_posix()}?mode=ro',uri=True)
board=next(b for (body,) in db.execute('select body from boards') if (b:=json.loads(body)).get('name')=='ECU' and len(b.get('components',[]))==18)
def photo(filename,dest):
    im=ImageOps.exif_transpose(Image.open(ROOT/'data/photos'/filename)).convert('RGB');im.save(OUT/'assets'/dest,quality=92,optimize=True)
photo(board['photos'][0],'ecu.jpg')
photo('878dd276-241a-41c2-bc1d-1060ed907aef.jpg','motors.jpg')
components=[]
for i,c in enumerate(board['components'],1):
    components.append(dict(number=i,name=c['name'],category=c['category'],markings=c.get('markings',''),purpose=c.get('description',''),evidence=c.get('evidence',''),unknown=c.get('uncertainty',''),confidence=c.get('confidence','unknown'),bounds=c['bounds']))
sample=dict(board=dict(name='ECU board',model='muse-spark-1.3',components=components),parts=[dict(id='motor',name='Small DC can motors',kind='part',total=3,condition='Untested',identity='Photo candidate',location='Sample tray A',purpose='Candidate drive motors; ratings and load suitability need checking.',image='assets/motors.jpg'),dict(id='buzzer',name='Piezo buzzer',kind='part',total=1,condition='Untested',identity='Sample record',location='Sample tray B',purpose='A possible voice for Juno. Voltage and drive requirements are not verified.'),dict(id='donor',name='DVD / CD donor drive',kind='donor',total=1,condition='Not working · sample',identity='Donor device',location='Donor shelf',purpose='Potential motors and switches remain on this donor. They are not loose stock.'),dict(id='iron',name='Soldering iron',kind='tool',total=1,condition='User-reported working · sample',identity='Reusable tool',location='Workbench',purpose='Bench equipment stays available as a tool; it is not a component to install.')])
(OUT/'sample.js').write_text('// Curated recorded map + explicitly illustrative inventory; no live database or API.\nexport const SAMPLE = '+json.dumps(sample,indent=2)+';\n',encoding='utf-8')
print('Prepared two metadata-stripped photos and 18 curated recorded annotations; no notes, IDs, conversations or settings exported.')
