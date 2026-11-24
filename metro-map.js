/* Chengdu schematic rendering adapted from Rail Map Painter / RMP Gallery.
 * GPL-3.0. See THIRD_PARTY.md, build_layout.py and licenses/RMP-GPL-3.0.txt.
 * Modified: analytical overlays, line-state route binding, semantic zoom and mini-map.
 */
window.MetroMap=class{
 constructor(layout,onStation){this.layout=layout;this.byName=new Map(layout.stations.map(s=>[s.name,s]));this.paths=new Map(layout.paths.map(p=>[p.id,p]));this.svg=d3.select('#network');this.scene=d3.select('#mapScene');this.minimap=d3.select('#minimap');this.onStation=onStation;this.focusLine=null;this.mode='all';this.selection=null;this.blocked=null;this.esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));this.zoom=d3.zoom().scaleExtent([.22,5]).on('zoom',event=>{this.transform=event.transform;this.scene.attr('transform',event.transform);this.updateLabels();this.updateMini()});this.svg.call(this.zoom).on('dblclick.zoom',null);this.drawBase();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(document.getElementById('mapContainer'));this.resize();this.fitCenter(false)}
 resize(){const r=document.getElementById('mapContainer').getBoundingClientRect();this.width=r.width;this.height=r.height;this.svg.attr('viewBox',`0 0 ${r.width} ${r.height}`);this.updateMini()}
 drawBase(){this.scene.html('<g class="base-rails"></g><g class="route-layer"></g><g class="station-layer"></g><g class="marker-layer"></g>');this.scene.select('.base-rails').selectAll('path').data(this.layout.paths).join('path').attr('class','rail-path').attr('d',p=>p.d).attr('stroke',p=>p.color).attr('stroke-width',4).attr('opacity',.88);this.scene.select('.station-layer').selectAll('g.station-group').data(this.layout.stations).join('g').attr('class','station-group').attr('transform',s=>`translate(${s.x},${s.y})`).attr('data-name',s=>s.name).attr('aria-label',s=>s.name).html(s=>this.stationMarkup(s)).on('click',(event,s)=>{event.stopPropagation();this.onStation(s.name)});this.minimap.selectAll('path').data(this.layout.paths).join('path').attr('d',p=>p.d).attr('fill','none').attr('stroke',p=>p.color).attr('stroke-width',10).attr('opacity',.65);this.minimap.append('rect').attr('id','viewportRect').attr('fill','#0d8b8315').attr('stroke','#318a80').attr('stroke-width',10);this.scene.selectAll('g.station-group').append('title').text(s=>`${s.name} · ${s.lines.join('/')}号线`)}
 stationMarkup(s){const o=s.options,e=this.esc;const isInt=s.kind.endsWith('-int');if(isInt){const vertical=o.direction==='vertical',length=Math.max(53,s.name.length*9.6+10),w=vertical?15:length,h=vertical?length:15;return`<rect class="station-core" x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="7.5" fill="#fff" stroke="#7a8f99" stroke-width=".8"/><text fill="#34515f" font-family="Microsoft YaHei" font-size="9" font-weight="600" text-anchor="middle" dominant-baseline="central" ${vertical?'writing-mode="vertical-rl"':''}>${e(s.name)}</text>`}const color=o.color?.[2]||'#6c929e';let mark=`<circle class="station-core" r="2" fill="white" stroke="${color}" stroke-width="1.1"/>`;if(o.stationType==='joint')mark='<rect class="station-core" x="-2.5" y="-4.8" rx="2.5" width="5" height="9.6" fill="white" stroke="#7c939c" stroke-width=".8"/>';
 const vertical=o.direction==='vertical',ox=o.nameOffsetX||'right',oy=o.nameOffsetY||'middle';let x=ox==='left'?-6:ox==='right'?6:0,y=oy==='top'?-7:oy==='bottom'?10:2.5,anchor=ox==='left'?'end':ox==='right'?'start':'middle';if(vertical){x=0;y=oy==='top'?-7:7;anchor=oy==='top'?'end':'start'}return mark+`<text class="station-name ordinary-label" x="${x}" y="${y}" font-size="7.3" fill="#6b828d" text-anchor="${anchor}" ${vertical?'writing-mode="vertical-rl" dominant-baseline="central"':''}>${e(s.name)}</text>`}
 fit(bounds,animate=true){this.svg.interrupt();this.resize();const[x,y,w,h]=bounds,k=Math.max(.22,Math.min(4,Math.min((this.width-65)/w,(this.height-70)/h))),t=d3.zoomIdentity.translate(this.width/2-k*(x+w/2),this.height/2-k*(y+h/2)).scale(k);if(animate)this.svg.transition().duration(650).call(this.zoom.transform,t);else this.svg.call(this.zoom.transform,t)}
 fitCenter(animate=true){this.fit([-530,-150,850,470],animate)}
 fitAll(){this.fit([-820,-720,1500,1490])}
 fitRoute(animate=true){if(!this.selection)return;const ns=[...this.selection.before.states,...this.selection.after.states].map(s=>this.byName.get(s[0]));const xs=ns.map(s=>s.x),ys=ns.map(s=>s.y);this.fit([Math.min(...xs)-70,Math.min(...ys)-55,Math.max(190,Math.max(...xs)-Math.min(...xs)+140),Math.max(180,Math.max(...ys)-Math.min(...ys)+110)],animate)}
 scale(f){this.svg.transition().duration(250).call(this.zoom.scaleBy,f)}
 updateMini(){if(!this.transform||!this.width)return;const t=this.transform,p=t.invert([0,0]),q=t.invert([this.width,this.height]);this.minimap.select('#viewportRect').attr('x',p[0]).attr('y',p[1]).attr('width',q[0]-p[0]).attr('height',q[1]-p[1])}
 updateLabels(){const k=this.transform?.k||1,onPath=new Set(this.selection?[...this.selection.before.states,...this.selection.after.states].map(s=>s[0]):[]);this.scene.selectAll('.ordinary-label').attr('opacity',function(){const s=this.parentNode.__data__;return k>=1.3||onPath.has(s.name)?1:0})}
 setLine(line){this.focusLine=line;this.applyFocus()}
 setMode(mode){this.mode=mode;this.applyFocus()}
 applyFocus(){this.scene.classed('map-dim',this.mode==='route');this.scene.selectAll('.rail-path').attr('opacity',p=>this.focusLine&&p.line!==this.focusLine? .12:.9);this.scene.selectAll('.station-group').style('opacity',s=>this.focusLine&&!s.lines.includes(this.focusLine)? .22:null)}
 pathSegments(p){const ids=new Set();const external=[];for(let i=1;i<p.states.length;i++){const[a,la]=p.states[i-1],[b,lb]=p.states[i];if(a===b)continue;if(la===lb){const chain=this.layout.ridePaths[`${la}|${a}|${b}`];if(!chain)throw Error(`Unmapped ride ${la}:${a}→${b}`);chain.forEach(k=>ids.add(k))}else{const u=this.byName.get(a),v=this.byName.get(b);external.push(`M${u.x},${u.y}L${v.x},${v.y}`)}}return[...ids].map(k=>this.paths.get(k).d).concat(external)}
 setSelection(blocked,selection){this.blocked=blocked;this.selection=selection;const onPath=new Set([...selection.before.states,...selection.after.states].map(s=>s[0]));this.scene.selectAll('.station-group').classed('on-path',s=>onPath.has(s.name)||s.name===blocked);let out='';for(const[p,color,dash]of[[selection.before,'#2b536a','5 3'],[selection.after,'#e97843','']])for(const d of this.pathSegments(p)){out+=`<path d="${d}" class="route-halo"/><path d="${d}" class="route-overlay" stroke="${color}" stroke-width="4.4" stroke-dasharray="${dash}"/>`;if(!dash)out+=`<path d="${d}" class="route-overlay route-running" stroke="#fff" opacity=".65" stroke-width="1.8"/>`}this.scene.select('.route-layer').html(out);const b=this.byName.get(blocked),o=b.options,vertical=o.direction==='vertical',isInt=b.kind.endsWith('-int'),length=Math.max(53,blocked.length*9.6+10),w=isInt?(vertical?20:length+6):16,h=isInt?(vertical?length+6:20):16;let marks=`<rect x="${b.x-w/2}" y="${b.y-h/2}" width="${w}" height="${h}" rx="9" fill="#d1584912" stroke="#c95149" stroke-width="1.8"/><circle cx="${b.x+w/2-2}" cy="${b.y-h/2}" r="5" fill="#c95149"/><path d="M${b.x+w/2-4.5},${b.y-h/2}h5" stroke="#fff" stroke-width="1.3"/>`;for(const[n,l,c]of[[selection.a,'O','#0d8b83'],[selection.b,'D','#e97843']]){const s=this.byName.get(n);marks+=`<circle cx="${s.x}" cy="${s.y}" r="6.5" fill="${c}" stroke="white" stroke-width="1.5"/><text x="${s.x}" y="${s.y+2.6}" text-anchor="middle" font-family="Arial" font-size="7.5" fill="white">${l}</text>`}this.scene.select('.marker-layer').html(marks);this.updateLabels();this.applyFocus()}
 exportSVG(){
   const source = this.svg.node();
   const canvasStyle = getComputedStyle(document.querySelector('#mapContainer'));
   const exportInk = canvasStyle.getPropertyValue('--map-export-ink').trim() || '#27444f';
   const exportMuted = canvasStyle.getPropertyValue('--map-export-muted').trim() || '#46595e';
   const clone = source.cloneNode(true);
   const elements = clone.querySelectorAll('*');
   const properties = ['display','visibility','opacity','fill','fill-opacity','stroke','stroke-opacity',
     'stroke-width','stroke-dasharray','stroke-dashoffset','stroke-linecap','stroke-linejoin','paint-order','font-family',
     'font-size','font-weight','mix-blend-mode','text-anchor','writing-mode','dominant-baseline'];
   source.querySelectorAll('*').forEach((el,i) => {
     const target = elements[i], css = getComputedStyle(el);
     for (const prop of properties) target.style.setProperty(prop, css.getPropertyValue(prop));
     if (el.classList.contains('route-running')) target.style.display = 'none';
   });
   const ns = 'http://www.w3.org/2000/svg';
   const out = document.createElementNS(ns,'svg');
   const heading = 40, foot = 36;
   out.setAttribute('width', this.width);
   out.setAttribute('height', this.height + heading + foot);
   out.setAttribute('viewBox', [0,0,this.width,this.height+heading+foot].join(' '));
   function add(tag, attrs, content){
     const node=document.createElementNS(ns,tag);
     Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,v));
     if(content !== undefined) node.textContent=content;
     out.append(node);
     return node;
   }
   add('metadata',{},'Chengdu schematic adapted from railmapgen/rmp-gallery, GPL-3.0. Open-Metro-PIS topology, CC BY-NC-SA 4.0. Structural scenario.');
   add('rect',{width:'100%',height:'100%',fill:canvasStyle.backgroundColor});
   const painted = this.scene.classed('atlas-painted');
   const caption = this.mode === 'reach' ? document.querySelector('#reachContext').textContent + ' · ' + document.querySelector('#reachValue').textContent + ' 区段预算' : this.mode === 'impact' ? (painted ? document.querySelector('#atlasCaption').textContent : '原线网对照') :
     this.mode === 'replay' ? document.querySelector('#replayOD').textContent + ' · ' + document.querySelector('#replayPhase').textContent : this.mode === 'route' ? '路径对比' : '完整线网';
   add('text',{x:14,y:25,'font-size':15,'font-family':'Microsoft YaHei',fill:exportInk},this.blocked+'换乘受限 · '+caption);
   clone.setAttribute('width',this.width);
   clone.setAttribute('height',this.height);
   clone.setAttribute('y',heading);
   clone.setAttribute('overflow','hidden');
   out.append(clone);
   const font = {'font-size':10,'font-family':'Microsoft YaHei',fill:exportMuted};
   if (painted) {
     const labels = [...document.querySelectorAll('#impactLegend span')];
     let x = 10;
     const scale = Math.min(1,(this.width-20)/450);
     for(const label of labels) {
       const dot=label.querySelector('i');
       if(dot) add('circle',{cx:x+4,cy:this.height+heading+17,r:4,fill:dot.style.background});
       add('text',{...font,x:x+(dot?12:0),y:this.height+heading+21,'font-size':10*scale},label.textContent);
       x += (label.textContent.length*7+26)*scale;
     }
   } else {
     add('text',{...font,x:14,y:this.height+heading+22},this.mode==='reach'?'绿色为仍可达，莓红色为受限后超出预算，灰色为原本超出预算。':this.mode==='replay'?'蓝绿线为原路径，橙线为受限后路径。圆点标记回放位置。':this.mode==='impact'?'图层已关闭 · 成都地铁拓扑示意':'深色虚线为基线，橙色实线为受限后路径');
   }
   return new XMLSerializer().serializeToString(out);
 }
};
