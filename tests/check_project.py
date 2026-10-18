from pathlib import Path
from html.parser import HTMLParser
import subprocess
root=Path(__file__).resolve().parents[1]
class Scripts(HTMLParser):
 def __init__(self,p): super().__init__();self.p=p;self.scripts=[];self.inside=False
 def handle_starttag(self,t,a):
  a=dict(a)
  if t=='script':
   src=a.get('src','')
   if src and not src.startswith('http'):self.scripts.append((self.p.parent/src).read_text())
   self.inside=not src
 def handle_endtag(self,t):
  if t=='script':self.inside=False;self.scripts.append('\n;\n')
 def handle_data(self,d):
  if self.inside:self.scripts.append(d)
errors=[]
for p in root.rglob('*.html'):
 s=Scripts(p);s.feed(p.read_text());r=subprocess.run(['node','--check'],input=''.join(s.scripts),text=True,capture_output=True)
 if r.returncode:errors.append((str(p),r.stderr))
for p,e in errors:print(p,e)
print(f'Checked scripts together across {len(list(root.rglob("*.html")))} pages; {len(errors)} failed')

if errors: raise SystemExit(1)
