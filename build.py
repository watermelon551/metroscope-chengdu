"""Rebuild audited draft tables, reproducible scenarios and offline prototype data."""
from pathlib import Path
from itertools import combinations
from collections import defaultdict, Counter
import json, csv, hashlib
from model import Network, category

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'data' / 'processed'
OUT.mkdir(exist_ok=True)
routes = json.loads((RAW / 'candidate-route.json').read_text(encoding='utf-8'))
colors = json.loads((RAW / 'candidate-color.json').read_text(encoding='utf-8'))
line_ids = [1,2,3,4,5,6,7,8,9,10,13,17,18,19,27,30]
inactive = {'玉虹路','分水','白仁店'}
members, ride_keys, sequences = defaultdict(set), set(), {}
lines = []
for number in line_ids:
    key = f'line_{number}'
    chosen = ['route1','route2'] if number == 1 else ['route1']
    paths = [[s for s in service['stations'] if s not in inactive]
             for service in routes[key]['services'] if service['service_name'] in chosen]
    # Official network map and RMP both show 观东→新通大道→新川路→龙灯山.
    # The candidate route JSON reverses the two middle stops; retain raw source unchanged.
    if number == 6:
        for path in paths:
            i,j=path.index('新川路'),path.index('新通大道')
            path[i],path[j]='新通大道','新川路'
    sequences[number] = paths
    for path in paths:
        for station in path: members[station].add(number)
        pairs = list(zip(path,path[1:]))
        if number == 7: pairs.append((path[-1],path[0]))
        for a,b in pairs: ride_keys.add((number,*sorted((a,b))))
    lines.append(dict(id=number,color=colors[key],services=chosen,
                      stationCount=len(set(sum(paths,[]))),paths=paths))
rides = [dict(a=a,b=b,la=line,lb=line,kind='ride') for line,a,b in sorted(ride_keys)]
transfers = [dict(a=station,b=station,la=a,lb=b,kind='internal')
             for station, group in sorted(members.items()) for a,b in combinations(sorted(group),2)]
# Separate names remain separate OD endpoints. Official map explicitly marks these walking links.
external = [('双流机场2航站楼',10,'双流机场2航站楼东',19),
            ('双流机场2航站楼',10,'双流机场2航站楼东',30),
            ('龙泉驿火车站',2,'龙泉驿火车站南',30)]
transfers += [dict(a=a,b=b,la=la,lb=lb,kind='external') for a,la,b,lb in external]

# Hand-placed schematic anchors, explicitly NOT longitude/latitude or measured railway geometry.
anchors = {
 '韦家碾':(640,180),'火车北站':(590,290),'人民北路':(590,340),'骡马市':(590,440),
 '天府广场':(590,480),'华西坝':(590,560),'省体育馆':(590,600),'倪家桥':(590,650),
 '火车南站':(590,720),'孵化园':(590,810),'世纪城':(590,870),'海昌路':(590,970),
 '四河':(590,920),'五根松':(650,940),'西博城':(630,1060),'科学城':(760,1075),
 '犀浦':(190,240),'羊犀立交':(285,350),'一品天下':(340,390),'中医大·省医院':(460,440),
 '人民公园':(540,480),'春熙路':(660,510),'牛王庙':(735,545),'东大路':(800,575),
 '成都东客站':(900,620),'惠王陵':(970,665),'龙泉驿火车站':(1040,730),'龙泉驿':(1200,730),
 '成都医学院':(820,40),'驷马桥':(730,320),'前锋路':(690,365),'红星桥':(690,410),
 '市二医院':(690,470),'新南门':(640,570),'高升桥':(450,600),'红牌楼':(410,640),
 '太平园':(380,680),'武青南路':(250,680),'龙桥路':(160,680),'双流西站':(60,800),
 '西河':(1200,470),'槐树店':(940,470),'双桥路':(845,470),'玉双路':(780,470),
 '文化宫':(280,440),'成都西站':(180,440),'凤溪河':(80,440),'万盛':(15,440),
 '华桂路':(480,30),'洞子口':(480,180),'北站西二路':(480,290),'西北桥':(480,370),
 '青羊宫':(460,540),'省骨科医院':(450,570),'九兴大道':(450,650),'神仙树':(460,720),
 '市一医院':(460,770),'锦城大道':(460,810),'怡心湖':(460,1040),'回龙':(460,1120),
 '望丛祠':(110,60),'金府':(340,270),'西南交大':(390,320),'建设北路':(790,400),
 '三官堂':(750,600),'东光':(750,650),'琉璃场':(750,720),'金石路':(750,770),
 '金融城东':(750,810),'天府商务区':(650,1020),'兰家沟':(380,1120),
 '龙爪堰':(300,570),'高朋大道':(420,700),'四川师大':(840,680),
 '理工大学':(920,370),'二仙桥':(850,340),'桂龙路':(1120,270),
 '净居寺':(810,650),'三元':(390,810),'珠江路':(380,870),'龙港':(300,950),
 '黄田坝':(150,380),'培风':(180,540),'机投桥':(180,570),'华兴':(270,780),
 '武侯祠':(505,570),'双流机场1航站楼':(170,800),'双流机场2航站楼':(120,800),'新平':(60,1060),
 '龙安':(930,920),'娇子立交':(890,770),'小南街':(540,550),'东坡路':(280,540),'瓦窑滩':(70,540),
 '高洪':(1120,340),'九江北':(80,570),'锦城广场东':(625,840),'兴隆':(690,1045),
 '天府站':(810,1040),'三岔':(890,1040),'福田':(970,1040),'天府机场1号2号航站楼':(1080,1040),'天府机场北':(1180,1040),
 '金星':(80,340),'市五医院':(80,400),'双流机场2航站楼东':(130,765),
 '石佛':(800,35),'蜀鑫路':(180,340),'龙泉驿火车站南':(1050,770)
}
coords = dict(anchors)
for line,paths in sequences.items():
    for path in paths:
        if line == 7: path = path + [path[0]]
        known = [i for i,s in enumerate(path) if s in anchors]
        assert known[0] == 0 and known[-1] == len(path)-1, (line,known)
        for i,j in zip(known,known[1:]):
            a,b = anchors[path[i]],anchors[path[j]]
            for k in range(i+1,j):
                f=(k-i)/(j-i)
                coords.setdefault(path[k],(round(a[0]+(b[0]-a[0])*f,2),round(a[1]+(b[1]-a[1])*f,2)))

order = []
for line,paths in sequences.items():
    for path in paths:
        for station in path:
            if station not in order and station != '天府站': order.append(station)
stations = [dict(id=s,lines=sorted(members[s]),endpoint=s!='天府站',x=coords[s][0],y=coords[s][1])
            for s in sorted(members)]
network = Network(rides,transfers)
baseline = {}
for origin in order:
    best,_ = network.shortest(origin)
    baseline[origin] = {s: value[0] if value else None for s,value in best.items()}

scenarios = []
selected = ['太平园','孵化园','天府广场','中医大·省医院','成都东客站','九江北']
for blocked in selected:
    counts = Counter(dict(unchanged=0,more_transfers=0,more_stops=0,unreachable=0,excluded=0))
    matrix, example_candidates = [], []
    for origin in order:
        best,_ = network.shortest(origin,blocked)
        for destination in order:
            if origin == destination:
                matrix.append(-3)
                continue
            before = baseline[origin][destination]
            hit = best[destination]
            after = hit[0] if hit else None
            kind = category(before,after)
            counts[kind] += 1
            value = {'excluded':-4,'unreachable':-1,'more_transfers':-2,'unchanged':0}.get(kind)
            if kind == 'more_stops':
                value = after[0]-before[0]
                # Prefer a compact, affected example, with neither endpoint equal to the restriction.
                if 2 <= before[0] <= 5 and origin != blocked and destination != blocked:
                    example_candidates.append((-value,before[0],len(origin)+len(destination),origin,destination))
            matrix.append(value)
    assert sum(counts.values()) == len(order)*(len(order)-1)
    for i in range(len(order)):
        for j in range(i): assert matrix[i*len(order)+j] == matrix[j*len(order)+i]
    _,_,_,a,b = min(example_candidates)
    example = dict(a=a,b=b,before=network.path(a,b),after=network.path(a,b,blocked))
    scenarios.append(dict(station=blocked,counts=dict(counts),matrix=matrix,example=example))
    print(blocked, dict(counts), 'example',a,b, example['before']['cost'],example['after']['cost'],flush=True)

metrics = dict(lines=len(lines),stations=len(stations),endpoints=len(order),
               lineStates=sum(len(v) for v in members.values()),rideEdges=len(rides),
               transferHubs=sum(len(v)>1 for v in members.values()),
               internalTransfers=sum(e['kind']=='internal' for e in transfers),externalTransfers=3,
               orderedPairs=len(order)*(len(order)-1))
manifest = dict(version='draft-v0.1',retrievedDate='2026-11-03',status='关键差异已核验；全量逐站复核待完成',
                officialMap='https://www.chengdurail.com/ckfw/xlt.htm',
                officialImage='https://www.chengdurail.com/images/longquanyihuochezhankaitong2222.png',
                candidate='https://github.com/DPCau/Open-Metro-PIS/tree/main/data/chengdu',
                candidateLicense='CC BY-NC-SA 4.0',
                gitBlobs={'route':'b085817ba30d19a0ba862c17fbb68fb118da9e6b',
                          'station':'78b506b986e7dab797dd6f0160c2a988627d451f',
                          'color':'d92943ea26d9b8da6c8de744be82dd0be85f068b'},
                sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in RAW.iterdir() if p.is_file()},
                excludedLines=['S3','蓉2'],inactiveStations=sorted(inactive),transferOnly=['天府站'],
                corrections=['6号线新通大道与新川路站序按官方图纠正'],
                metrics=metrics,stationCoordinates='hand-placed schematic anchors, no geographic CRS')

def csv_write(name,rows,fields):
    with (OUT/name).open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)

csv_write('stations.csv',[dict(station=s['id'],lines=';'.join(map(str,s['lines'])),endpoint=s['endpoint'],x=s['x'],y=s['y']) for s in stations],['station','lines','endpoint','x','y'])
csv_write('ride_edges.csv',rides,['a','b','la','lb','kind'])
csv_write('transfer_edges.csv',transfers,['a','b','la','lb','kind'])
csv_write('scenario_summary.csv',[dict(station=s['station'],**s['counts']) for s in scenarios],['station','unchanged','more_transfers','more_stops','unreachable','excluded'])
data=dict(manifest=manifest,lines=lines,stations=stations,rides=rides,transfers=transfers,order=order,scenarios=scenarios)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'network.json').write_text(json.dumps({k:v for k,v in data.items() if k not in ['scenarios']},ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'prototype-data.js').write_text('window.METRO_DATA='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
print(json.dumps(metrics,ensure_ascii=False),flush=True)
