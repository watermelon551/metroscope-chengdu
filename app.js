'use strict';
const D=window.METRO_DATA,L=window.METRO_LAYOUT,$=s=>document.querySelector(s),N=D.order.length;
const stations=new Map(D.stations.map(s=>[s.id,s])),lines=new Map(D.lines.map(l=>[l.id,l])),indices=new Map(D.order.map((s,i)=>[s,i]));
const router=new MetroRouting(D),keys=['unchanged','more_transfers','more_stops','unreachable'];
const names={unchanged:'代价不变',more_transfers:'仅换乘增加',more_stops:'乘车区段增加',unreachable:'不可达'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const total=s=>keys.reduce((n,k)=>n+s.counts[k],0),affected=s=>total(s)-s.counts.unchanged,pct=(a,b)=>b?(100*a/b).toFixed(2)+'%':'—';
const group=n=>stations.get(n).lines[0],category=v=>v===0?'unchanged':v===-2?'more_transfers':v===-1?'unreachable':v>0?'more_stops':'excluded';
let current=D.scenarios[0],selected=null,filter=null,mode='groups',focusedGroup=null,showStops=false,lineFocus=null;
let matrixRows=[],matrixCols=[],groupCells=[],routePinned=false;
const map=new MetroMap(L,openStation),matrix=echarts.init($('#matrixChart'),null,{renderer:'canvas'});
const comparison=new ScenarioStack($('#compareChart'),(station,kind)=>{filter=kind;chooseScenario(station,true)});
const replay = new RouteReplay(map);
const atlas = new ImpactAtlas(map, D.order, (a,b) => {
   showPath(a,b);
   setMapMode('replay');
   $('.map-card').scrollIntoView({block:'nearest'});
 });
 const reach = new Reachability(map,router,D.order,atlas.onRoute);
 const peakJourney = new PeakJourney(D.order,router,atlas.onRoute);
 const peaks = new PeakView(L,D,chooseScenario,name => {setMapMode('impact');atlas.show(name);},peakJourney);
 const layered = new LayerJourney(replay,lines);
 const lens = new ScenarioLens(D,L,chooseScenario,(a,b) => {
   showPath(a,b);
   setMapMode('layers');
   $('.map-card').scrollIntoView({block:'nearest'});
 });
 peaks.onColumnArcs = name => setMapMode('arcs',name);
 $('#peakArcs').onclick = () => peaks.onColumnArcs(peaks.selected);
 $('#deltaToArcs').onclick=()=>{
   const name=lens.name, target=lens.second.value;
   chooseScenario(target);
   setMapMode('arcs',name);
 };
 function inspectionOrigin() {
   if (atlas.active) return atlas.origin;
   if (peaks.active) return peaks.selected;
   if (reach.active) return reach.origin;
   if (lens.mode) return lens.name;
   return selected?.a;
 }
 $('#atlasLink').onclick = e => {
   const name = inspectionOrigin();
   e.currentTarget.href = name ? 'scenarios.html?'+new URLSearchParams({origin:name}) : 'scenarios.html';
 };
 const modeButtons=document.querySelectorAll('#mapModes button,#lensNav button');
 function setMapMode(next,origin) {
   const fromOrigin=inspectionOrigin();
   if(!origin && (next==='arcs'||next==='delta')) origin=fromOrigin || selected.a;
   const inheritedPeak=next==='peak' && !peaks.active && (atlas.active || reach.active || lens.mode || replay.active) && fromOrigin;
   const inheritedAtlas=next==='impact' && peaks.active && peaks.pinned ? peaks.selected : null;
   layered.active=next==='layers';
   $('#layerHost').hidden=!layered.active;
   $('.analysis-grid').classList.toggle('layer-open',layered.active);
   lens.activate(['arcs','delta'].includes(next)?next:null,current,origin);
   $('#deltaToArcs').hidden=next!=='delta';
   peaks.activate(next === 'peak',current,atlas);
   if(inheritedPeak && peaks.stats.has(inheritedPeak)) peaks.select(inheritedPeak);
   $('#exportMap').lastChild.textContent = next === 'peak' ? ' 导出峰值图 SVG' : lens.mode || layered.active ? ' 导出专题图 SVG' : ' 导出线网 SVG';
   const reachOrigin = fromOrigin || reach.origin || selected.a;
   $('#stationPopup').hidden = true;
   map.setMode(next);
   atlas.activate(next === 'impact');
   if(inheritedAtlas) atlas.show(inheritedAtlas);
   reach.activate(next === 'reach',reachOrigin,current.station);
   replay.activate(next === 'replay' || layered.active);
   modeButtons.forEach(button => {
     button.classList.toggle('active', button.dataset.mode === next);
     button.setAttribute('aria-pressed', String(button.dataset.mode === next));
   });
   updateMapHint();
 }
 function updateMapHint() {
   $('#mapHint').textContent = lineFocus ? '聚焦 ' + lineFocus + ' 号线 · 统计仍使用全网' :
     map.mode === 'delta' ? '柱高为第二情景减第一情景的百分点差。滑块仅演示从零到完整差值的展开过程。' :
     map.mode === 'arcs' ? '点选弧线或右侧目的站，查看实际线路与换乘过程。' :
     map.mode === 'layers' ? '每层对应一条线路。沿层移动表示乘车，跨层虚线表示换乘。' :
     map.mode === 'peak' ? '拖动旋转 · 滚轮缩放 · 点柱后在下方选目的站，对照两条路径。六种情景共用高度标尺。' :
     map.mode === 'reach' ? '实线为仍可乘坐的区段，虚线为受限后超出预算的区段。站数不含起点和仅供换乘的天府站。' :
     map.mode === 'replay' ? '拖动进度条可逐步对照，两次行程使用相同视角。' :
     map.mode === 'impact' ? '色晕辅助定位；数值以站点为准。点击站点查看详情。' : '放大后显示普通站名，点击站点查看详情。';
 }
 const icons=()=>lucide.createIcons();
$('#scenarios').innerHTML=D.scenarios.map(s=>`<button class="scenario-button" data-station="${esc(s.station)}" aria-label="设置${esc(s.station)}换乘受限"><span><i></i>${esc(s.station)}</span><small>${pct(affected(s),total(s))}</small></button>`).join('');
$('#scenarios').querySelectorAll('button').forEach(b=>b.onclick=()=>chooseScenario(b.dataset.station));
$('#stationNames').innerHTML=D.order.map(s=>`<option value="${esc(s)}"></option>`).join('');
$('#linePicker').innerHTML=D.lines.map(l=>`<button class="line-chip" data-line="${l.id}" aria-label="聚焦${l.id}号线"><i style="--lc:${l.color}">${l.id}</i>${l.id}号线</button>`).join('');
$('#linePicker').querySelectorAll('button').forEach(b=>b.onclick=()=>setLine(lineFocus===+b.dataset.line?null:+b.dataset.line));
function setLine(n){lineFocus=n;map.setLine(n);peaks.setLine(n);$('#linePicker').querySelectorAll('button').forEach(b=>b.classList.toggle('active',+b.dataset.line===n));updateMapHint()}
function value(a,b){return current.matrix[indices.get(a)*N+indices.get(b)]}
function chooseScenario(name,keep=false){current=D.scenarios.find(s=>s.station===name);if(!keep)filter=null;focusedGroup=null;$('#stationPopup').hidden=true;$('#scenarios').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.station===name));$('#currentStation').textContent=name;$('#currentLines').innerHTML=stations.get(name).lines.map(id=>`<span class="line-badge" style="background:${lines.get(id).color}">${id}</span>`).join('');$('#impactRate').textContent=pct(affected(current),total(current));$('#impactCount').textContent=`${affected(current).toLocaleString()} / ${total(current).toLocaleString()} 个站点对`;
 $('#detourCount').textContent=current.counts.more_stops.toLocaleString();$('#transferCount').textContent=current.counts.more_transfers.toLocaleString();$('#unreachableCount').textContent=`不可达：${current.counts.unreachable} 个站点对`;
 const e=current.example;$('#caseReplay').textContent='回放情景案例　'+e.a+' → '+e.b;$('#insightTitle').textContent=current.counts.unreachable===0?'网络保持连通，绕行仍会发生。':'部分起终点失去连接。';$('#insightText').textContent=`${e.a} → ${e.b}：从 ${e.before.cost[0]} 个区段、${e.before.cost[1]} 次换乘，变为 ${e.after.cost[0]} 个区段、${e.after.cost[1]} 次换乘。点击下方按钮，在图中追踪这条路径。`;
 drawMatrix();drawComparison();const route=routePinned && selected ? selected : e;showPath(route.a,route.b,false);atlas.setScenario(current);if(lens.mode)lens.activate(lens.mode,current,lens.name);if(peaks.active)peaks.setScenario(current,atlas);if(reach.active)reach.load(reach.origin,current.station);icons();
}
function drawComparison(){document.querySelector('.task-link').href='question1.html?'+new URLSearchParams({scenario:current.station});comparison.update(D.scenarios,current.station,$('#showUnchanged').checked);$('#compareNote').textContent=$('#showUnchanged').checked?'显示全部四类组合，占比之和为 100%。':'仅绘制发生变化的组合；分母仍是全部 127,806 个可比较站点对。'}
function groupData(){const ids=D.lines.map(l=>l.id),m=new Map();for(const a of ids)for(const b of ids)m.set(a+'|'+b,{row:a,col:b,total:0,count:0,example:null,score:-Infinity});for(let i=0;i<N;i++)for(let j=0;j<N;j++){if(i===j)continue;const v=current.matrix[i*N+j];if(v===-4)continue;const c=m.get(group(D.order[i])+'|'+group(D.order[j]));c.total++;const hit=filter?category(v)===filter:v!==0;if(hit){c.count++;const score=v>0?v:v===-1?100:0;if(score>c.score){c.score=score;c.example={a:D.order[i],b:D.order[j]}}}}
 return [...m.values()].map(c=>({...c,value:[ids.indexOf(c.col),ids.indexOf(c.row),c.total?Math.round(c.count/c.total*10000)/100:0]}))}
function drawMatrix(){
 $('#groupMatrix').classList.toggle('active',mode==='groups');$('#stationMatrix').classList.toggle('active',mode==='stations');$('#stationScope').disabled=mode==='groups'||!!focusedGroup;$('#clearFilter').hidden=!filter;
 const isGroup=mode==='groups';let data,xNames,yNames,visual,zoom=[];
 if(isGroup){groupCells=groupData();data=groupCells;xNames=yNames=D.lines.map(l=>String(l.id));visual={type:'continuous',min:0,max:100,orient:'horizontal',left:'center',bottom:4,itemWidth:9,itemHeight:128,calculable:true,text:['100%','0%'],textGap:8,textStyle:{fontSize:9,color:'#91a3ac'},inRange:{color:['#f1f5f5','#b9ddd4','#58b3a4','#eca56b','#d5613b']},dimension:2};$('#matrixExplainer').textContent=`行：起点归属线路 / 列：终点归属线路 · ${filter?names[filter]:'受影响'}占比`;
 $('#matrixNote').textContent='点击格子展开站点对；换乘站只归入一条线路。';
 }else{const pool=$('#stationScope').value==='hubs'?D.order.filter(n=>stations.get(n).lines.length>1):D.order;matrixRows=focusedGroup?D.order.filter(n=>group(n)===focusedGroup.row):pool;matrixCols=focusedGroup?D.order.filter(n=>group(n)===focusedGroup.col):pool;xNames=matrixCols;yNames=matrixRows;data=[];for(let i=0;i<matrixRows.length;i++)for(let j=0;j<matrixCols.length;j++){const v=value(matrixRows[i],matrixCols[j]);data.push({value:[j,i,v],itemStyle:filter&&category(v)!==filter?{color:'#f6f8f9'}:undefined})}visual={type:'piecewise',orient:'horizontal',left:'center',bottom:0,itemWidth:9,itemHeight:9,itemGap:8,textStyle:{fontSize:8,color:'#859ba5'},dimension:2,pieces:[{value:0,label:'不变',color:'#e9eef1'},{value:-2,label:'多换乘',color:'#329a92'},{min:1,max:2,label:'+1–2',color:'#f1c89b'},{min:3,max:5,label:'+3–5',color:'#e79461'},{min:6,label:'+6及以上',color:'#cd6044'},{value:-1,label:'不可达',color:'#876d9c'}],outOfRange:{color:'#fff'}};
 const end=xNames.length>90?30:100;zoom=[{type:'slider',xAxisIndex:0,bottom:31,height:9,start:0,end,showDetail:false,brushSelect:false,borderColor:'#e6edef',fillerColor:'#339b921c',handleStyle:{color:'#719e97'}},{type:'slider',yAxisIndex:0,right:6,width:9,start:0,end,showDetail:false,brushSelect:false,borderColor:'#e6edef',fillerColor:'#339b921c'},{type:'inside',xAxisIndex:0,filterMode:'filter'},{type:'inside',yAxisIndex:0,filterMode:'filter'}];$('#matrixExplainer').textContent=focusedGroup?`${focusedGroup.row}号线归组 → ${focusedGroup.col}号线归组 · 颜色表示增加区段`:`${matrixRows.length} × ${matrixCols.length} 起终点矩阵 · 颜色表示增加区段`;
 $('#matrixNote').textContent=filter?`正在突出：${names[filter]}；拖动滑块或滚轮缩放`:'拖动滑块或滚轮缩放，点击单元格解释路径。';
 }
 matrix.setOption({animation:false,textStyle:{fontFamily:'Microsoft YaHei'},grid:{left:isGroup?38:64,right:isGroup?18:27,top:isGroup?24:43,bottom:isGroup?43:63},tooltip:{position:'top',confine:true,backgroundColor:'#fff',borderColor:'#dce6e9',textStyle:{color:'#365863',fontSize:10},formatter:p=>{if(isGroup){const c=p.data;return`<b>${c.row}号线归组 → ${c.col}号线归组</b><br>${filter?names[filter]:'受影响'}：${c.count} / ${c.total} 对<br><b>${c.value[2].toFixed(2)}%</b>`}const[j,i,v]=p.value,a=matrixRows[i],b=matrixCols[j];return`<b>${esc(a)} → ${esc(b)}</b><br>${v>0?`增加 ${v} 个乘车区段`:v===-3?'同一起终点，不计入统计':v===-4?'基线不可达':names[category(v)]}`}},xAxis:{type:'category',position:'top',data:xNames,splitArea:{show:false},axisLine:{show:false},axisTick:{show:false},axisLabel:{fontSize:isGroup?9:8,color:'#8198a3',interval:isGroup?0:'auto',rotate:isGroup?0:40,hideOverlap:true,formatter:n=>String(n).length>5?String(n).slice(0,5)+'…':n}},yAxis:{type:'category',inverse:true,data:yNames,axisLine:{show:false},axisTick:{show:false},axisLabel:{fontSize:9,color:'#8198a3',interval:isGroup?0:'auto',hideOverlap:true,formatter:n=>isGroup?n+'号线':String(n).length>5?String(n).slice(0,5)+'…':n}},visualMap:visual,dataZoom:zoom,series:[{type:'heatmap',data,progressive:0,label:{show:false},itemStyle:{borderColor:'#fff',borderWidth:isGroup?2:0},emphasis:{itemStyle:{borderColor:'#295d66',borderWidth:1,shadowBlur:3,shadowColor:'#295d6630'}}}]},true);
}
matrix.on('click',p=>{if(p.componentType!=='series')return;if(mode==='groups'){const cell=p.data;if(!cell.total)return;focusedGroup={row:cell.row,col:cell.col};mode='stations';drawMatrix();if(cell.example)atlas.onRoute(cell.example.a,cell.example.b)}else{const[j,i]=p.value,a=matrixRows[i],b=matrixCols[j];if(a!==b)atlas.onRoute(a,b)}});
function journey(p){if(!p.cost)return'<span>当前情景不可达</span>';const segments=[];let segment={line:p.states[0][1],from:p.states[0][0],to:p.states[0][0],count:0};for(let i=1;i<p.states.length;i++){const[n,l]=p.states[i],[pn,pl]=p.states[i-1];if(l===pl){segment.to=n;segment.count++}else{segments.push(segment);segment={line:l,from:n,to:n,count:0,external:n!==pn}}}segments.push(segment);let out=`<strong>${esc(p.states[0][0])}</strong>`;segments.forEach((s,i)=>{if(i){const restricted=s.from===current.station;out+=`<span class="transfer-station ${restricted?'restricted':''}"><i data-lucide="shuffle"></i>${esc(s.from)}${s.external?'（站外）':''}</span>`}const c=lines.get(s.line).color;out+=`<span class="train-segment" style="--segment-color:${c};--segment-bg:${c}0d;--segment-border:${c}35">${s.line}号线 <span>${s.count}区段</span></span><i data-lucide="chevron-right"></i>`});return out+`<strong>${esc(p.states.at(-1)[0])}</strong>`}
function drawPaths(){if(!selected)return;$('#pathDetails').innerHTML=[[selected.before,'基线路径','before'],[selected.after,'受限后路径','after']].map(([p,label,cls])=>`<div class="path-row ${cls}"><div class="path-row-head"><span><i class="path-icon"></i>${label}</span><b>${p.cost?`${p.cost[0]} 区段 <span style="color:#bac5ca">/</span> ${p.cost[1]} 次换乘`:'不可达'}</b></div><div class="journey">${journey(p)}</div>${showStops?`<div class="stop-list">${p.states.map(([n,l],i)=>i&&n===p.states[i-1][0]?`[换乘${l}号线]`:esc(n)).join(' → ')}</div>`:''}</div>`).join('')+`<div class="delta-note">${selected.after.cost?`<b>+${selected.after.cost[0]-selected.before.cost[0]} 个乘车区段</b><span>跨线换乘变化 ${selected.after.cost[1]-selected.before.cost[1]>=0?'+':''}${selected.after.cost[1]-selected.before.cost[1]}</span>`:'<b>不可达</b>'}<span>同价最优路径可能不唯一</span></div>`;icons()}
function showPath(a,b,pin=true){$('#origin').value=a;$('#destination').value=b;if(!indices.has(a)||!indices.has(b)||a===b){$('#pathDetails').innerHTML='<p class="error">请输入两个不同的有效起终点。天府站仅用于换乘。</p>';return}if(pin)routePinned=true;selected={a,b,before:router.route(a,b),after:router.route(a,b,current.station)};drawPaths();map.setSelection(current.station,selected);if(replay.active)replay.load()}
function openStation(name){const s=stations.get(name),box=$('#stationPopup');box.hidden=false;box.innerHTML=`<button class="popup-close" aria-label="关闭站点详情"><i data-lucide="x"></i></button><h3>${esc(name)}</h3><small>${s.lines.join(' / ')} 号线${s.endpoint?'':' · 仅换乘，不作为起终点'}</small><div class="popup-actions">${s.endpoint?'<button data-action="origin">设为起点</button><button data-action="destination">设为终点</button>':''}</div>${D.scenarios.some(s=>s.station===name)?'<button class="text-button" data-action="scenario" style="margin-top:10px">模拟此站换乘受限</button>':''}`;if (atlas.active && s.endpoint) {
   const stat = atlas.stats[indices.get(name)];
   const desc = document.createElement('p');
   desc.className = 'popup-stat';
   desc.textContent = atlas.origin ? atlas.origin + ' → ' + name + ' · ' + impactDescription(value(atlas.origin,name)) :
     '从本站出发，' + stat.count + ' / ' + stat.comparable + ' 个目的地受影响';
   const action = document.createElement('button');
   action.className = 'atlas-action';
   action.textContent = '查看从本站出发的影响 →';
   action.onclick = () => atlas.show(name);
   box.querySelector('.popup-actions').before(desc,action);
   if (atlas.origin && atlas.origin !== name) {
     const path = document.createElement('button');
     path.className = 'text-button';
     path.textContent = '对比到本站的路径 →';
     path.onclick = () => atlas.onRoute(atlas.origin,name);
     action.after(path);
   }
 }
 if (reach.active && s.endpoint) {
   const row = reach.byName.get(name);
   const info = document.createElement('p');
   info.className = 'popup-stat';
   const format = v => Number.isFinite(v) ? v + ' 区段' : '不可达';
   info.textContent = row ? reach.origin + '出发 · ' + format(row.before) + ' → ' + format(row.after) : '当前比较起点';
   box.querySelector('.popup-actions').before(info);
   box.querySelector('[data-action="origin"]').textContent = '从本站看范围';
   const destination = box.querySelector('[data-action="destination"]');
   destination.textContent = '回放到本站';
   destination.disabled = !row;
 }
 box.querySelector('.popup-close').onclick=()=>box.hidden=true;box.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>{const action=b.dataset.action;if(action==='scenario')chooseScenario(name);else if(reach.active){if(action==='origin')reach.load(name,current.station);else reach.onRoute(reach.origin,name)}else{const a=action==='origin'?name:selected.a,d=action==='destination'?name:selected.b;if(a!==d)atlas.onRoute(a,d)}box.hidden=true});icons()}
$('#resetLines').onclick=()=>setLine(null);$('#zoomIn').onclick=()=>map.scale(1.35);$('#zoomOut').onclick=()=>map.scale(1/1.35);$('#fitCenter').onclick=()=>map.fitCenter();$('#fitNetwork').onclick=()=>map.fitAll();$('#fitRoute').onclick=()=>{setMapMode('route');map.fitRoute()};
modeButtons.forEach(b => b.onclick = () => setMapMode(b.dataset.mode));
$('#groupMatrix').onclick=()=>{mode='groups';focusedGroup=null;drawMatrix()};$('#stationMatrix').onclick=()=>{mode='stations';focusedGroup=null;drawMatrix()};$('#stationScope').onchange=()=>{focusedGroup=null;drawMatrix()};$('#resetMatrix').onclick=()=>{mode='groups';filter=null;focusedGroup=null;drawMatrix()};$('#clearFilter').onclick=()=>{filter=null;drawMatrix()};$('#showUnchanged').onchange=drawComparison;
$('#showPath').onclick=()=>{const a=$('#origin').value.trim(), b=$('#destination').value.trim();if(indices.has(a)&&indices.has(b)&&a!==b)atlas.onRoute(a,b);else showPath(a,b)};$('#swapOD').onclick=()=>showPath($('#destination').value.trim(),$('#origin').value.trim());for(const id of ['origin','destination'])$('#'+id).onkeydown=e=>{if(e.key==='Enter')$('#showPath').click()};$('#toggleStops').onclick=()=>{showStops=!showStops;$('#toggleStops').textContent=showStops?'收起站点详情':'展开全部站点';drawPaths()};$('#caseReplay').onclick=$('#useExample').onclick=()=>atlas.onRoute(current.example.a,current.example.b);
for(const id of ['aboutSide','aboutFooter'])$('#'+id).onclick=()=>$('#aboutDialog').showModal();$('#closeAbout').onclick=()=>$('#aboutDialog').close();
$('#exportMap').onclick=()=>{const blob=new Blob([lens.mode || layered.active ? new XMLSerializer().serializeToString($(layered.active?'#layerSvg':'#lensSvg')) : peaks.active ? peaks.exportSVG() : map.exportSVG()],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`成都地铁-${current.station}-${({layers:'分层换乘',delta:'双情景差值',arcs:'目的站弧线',peak:'三维峰值'})[map.mode] || '换乘受限'}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
const resize=new ResizeObserver(()=>{matrix.resize();comparison.resize()});resize.observe($('#matrixChart'));resize.observe($('#compareChart'));
const linkedScenario=new URLSearchParams(location.search).get('scenario');
chooseScenario(D.scenarios.some(s=>s.station===linkedScenario) ? linkedScenario : current.station);
function entryMode() {
  const requested = location.hash.slice(1);
  return ['reach','replay','peak','delta','layers','arcs'].includes(requested) ? requested : 'impact';
}
setMapMode(entryMode());
const linkedOrigin=new URLSearchParams(location.search).get('origin');
if(peaks.active && indices.has(linkedOrigin)) peaks.select(linkedOrigin);
window.addEventListener('hashchange', () => setMapMode(entryMode()));
window.metroApp={layered,lens,peaks,reach,replay,atlas,router,map,matrix,comparison,chooseScenario,showPath,get current(){return current},get selected(){return selected},get matrixState(){return{mode,focusedGroup,rows:matrixRows,cols:matrixCols,filter}}};
