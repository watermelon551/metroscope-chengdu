"""Adapt the RMP Gallery Chengdu schematic to the audited routing network.
Layout and diagonal/perpendicular geometry adapted from railmapgen/rmp(-gallery), GPL-3.0.
This file and its generated layout are GPL-3.0; see licenses/RMP-GPL-3.0.txt.
"""
from pathlib import Path
from collections import defaultdict, deque
from math import hypot, sqrt, sin, cos, pi
import json

ROOT=Path(__file__).resolve().parent
source=json.loads((ROOT/'data/raw/rmp-chengdu.json').read_text(encoding='utf-8'))
net=json.loads((ROOT/'data/processed/network.json').read_text(encoding='utf-8'))
nodes={n['key']:n['attributes'] for n in source['graph']['nodes']}
names=defaultdict(list)
for k,a in nodes.items():
    name=a.get(a['type'],{}).get('names',[''])[0].replace('\n','')
    if name:names[name].append(k)
    a['stationName']=name
real={s['id'] for s in net['stations']}
edges={e['key']:e for e in source['graph']['edges']}
adj=defaultdict(lambda:defaultdict(list))
for e in edges.values():
    a=e['attributes'];code=a.get('single-color',{}).get('color',['',''])[1]
    if code.startswith('cd') and code[2:].isdigit():
        line=int(code[2:])
        adj[line][e['source']].append((e['target'],e['key']))
        adj[line][e['target']].append((e['source'],e['key']))

def find_chain(a,b,line):
    starts=[k for k in names[a] if k in adj[line]]
    targets=set(names[b]);queue=deque(starts);prev={k:None for k in starts}
    while queue:
        u=queue.popleft()
        if u in targets:
            found=[]
            while prev[u] is not None:
                u,e=prev[u];found.append(e)
            return list(reversed(found))
        for v,e in adj[line][u]:
            if v in prev:continue
            name=nodes[v]['stationName']
            if name in real and name not in (a,b):continue
            prev[v]=(u,e);queue.append(v)
    raise ValueError(('No exact schematic chain',a,b,line))

def rounded(points,radius):
    clean=[]
    for p in points:
        if not clean or hypot(p[0]-clean[-1][0],p[1]-clean[-1][1])>1e-7:clean.append(p)
    def f(p):return f'{p[0]:.4f},{p[1]:.4f}'
    out='M'+f(clean[0])
    for i in range(1,len(clean)-1):
        a,b,c=clean[i-1:i+2];l1=hypot(b[0]-a[0],b[1]-a[1]);l2=hypot(c[0]-b[0],c[1]-b[1]);r=min(radius,l1/2,l2/2)
        enter=(b[0]+(a[0]-b[0])*r/l1,b[1]+(a[1]-b[1])*r/l1)
        leave=(b[0]+(c[0]-b[0])*r/l2,b[1]+(c[1]-b[1])*r/l2)
        out+='L'+f(enter)+'Q'+f(b)+' '+f(leave)
    return out+'L'+f(clean[-1])

def geometry(e):
    a=e['attributes'];p=nodes[e['source']];q=nodes[e['target']]
    x1,y1,x2,y2=p['x'],p['y'],q['x'],q['y']
    typ=a['type'];opts=a.get(typ,{})
    start=opts.get('startFrom','from');o1=opts.get('offsetFrom',0);o2=opts.get('offsetTo',0)
    radius=opts.get('roundCornerFactor',10)
    if typ=='diagonal':
        if start=='to':x1,y1,x2,y2=x2,y2,x1,y1;o1,o2=o2,o1
        horizontal=abs(x2-x1)>=abs(y2-y1)
        sign=1 if (x2-x1)*(y2-y1)<0 else -1
        bx1=x1+(0 if horizontal else o1);by1=y1+(o1 if horizontal else 0)
        bx2=x2+o2/sqrt(2);by2=y2+o2/sqrt(2)*sign
        x=bx2+abs(by2-by1)*(-1 if bx2>bx1 else 1) if horizontal else bx1
        y=by1 if horizontal else by2+abs(bx2-bx1)*(-1 if by2>by1 else 1)
        points=[(bx1,by1),(x,y),(bx2,by2)]
        if start=='to':points.reverse()
    elif typ in ['perpendicular','ro-perp']:
        def rot(x,y):return ((x+y)/sqrt(2),(-x+y)/sqrt(2))
        def back(p):x,y=p;return ((x-y)/sqrt(2),(x+y)/sqrt(2))
        if typ=='ro-perp':x1,y1=rot(x1,y1);x2,y2=rot(x2,y2)
        if start=='from':y1+=o1;x2+=o2;middle=(x2,y1)
        else:x1+=o2;y2+=o1;middle=(x1,y2)
        points=[(x1,y1),middle,(x2,y2)]
        if typ=='ro-perp':points=list(map(back,points))
    elif typ=='ray-guided':
        an=opts.get('startAngle',0)*pi/180;bn=opts.get('endAngle',90)*pi/180
        u=(sin(an),-cos(an));v=(sin(bn),-cos(bn))
        x1+=cos(an)*o1;y1+=sin(an)*o1;x2+=cos(bn)*o2;y2+=sin(bn)*o2
        determinant=u[0]*v[1]-u[1]*v[0]
        t=((x2-x1)*v[1]-(y2-y1)*v[0])/determinant
        points=[(x1,y1),(x1+t*u[0],y1+t*u[1]),(x2,y2)]
    elif typ=='simple':points=[(x1,y1),(x2,y2)]
    else:raise ValueError(typ)
    return rounded(points,radius)

used=set();ride_map={}
for e in net['rides']:
    found=find_chain(e['a'],e['b'],e['la']);used.update(found)
    ride_map[f"{e['la']}|{e['a']}|{e['b']}"]=found
    ride_map[f"{e['la']}|{e['b']}|{e['a']}"]=list(reversed(found))
paths=[]
for k in sorted(used):
    e=edges[k];a=e['attributes'];colour=a['single-color']['color']
    paths.append(dict(id=k,d=geometry(e),line=int(colour[1][2:]),color=colour[2]))
stations=[]
for s in net['stations']:
    a=nodes[names[s['id']][0]];opts=a[a['type']]
    stations.append(dict(name=s['id'],x=a['x'],y=a['y'],lines=s['lines'],kind=a['type'],options=opts))
output=dict(source='railmapgen/rmp-gallery',blob='1033e5abacdb22f6bc54fd5a350af26c642c01e0',
            license='GPL-3.0',stations=stations,paths=paths,ridePaths=ride_map)
(ROOT/'layout-data.js').write_text('window.METRO_LAYOUT='+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
(ROOT/'data/processed/layout-audit.json').write_text(json.dumps(dict(matchedStations=len(stations),mappedRides=len(net['rides']),renderedSegments=len(paths),missingStations=[],missingRidePaths=[]),indent=2),encoding='utf-8')
print(f'Matched {len(stations)} stations and {len(net["rides"])} ride edges; retained {len(paths)} schematic segments.')
