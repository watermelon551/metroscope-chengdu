/* Orthographic projection of the existing rail schematic. All lengths, including
 * column height, are expressed in the same world coordinates for every scenario. */
class PeakView {
  constructor(layout, data, onScenario, onDetail, journey) {
    this.journey = journey;
    this.layout = layout;
    this.data = data;
    this.onScenario = onScenario;
    this.onDetail = onDetail;
    this.stage = document.querySelector('#peakStage');
    this.svg = d3.select('#peakCanvas');
    this.stationByName = new Map(layout.stations.map(s => [s.name,s]));
    this.cache = new Map();
    this.heightUnit = 610;
    this.rateColor = d3.scaleLinear().domain([0,.25,.5,.75,1])
      .range(['#35677a','#498c94','#df8063','#ffb167','#fff2b0']).interpolate(d3.interpolateLab).clamp(true);
    this.svg.select('#peakColorScale').selectAll('stop').data(d3.range(21).map(i=>i/20)).join('stop')
      .attr('offset',v=>v).attr('stop-color',this.rateColor);
    this.resetCamera();
    this.ground = this.svg.select('.peak-ground');
    this.ground.select('.peak-rails').selectAll('path').data(layout.paths).join('path')
      .attr('d',p => p.d).attr('stroke',p => p.color).attr('stroke-width',2.8)
      .attr('stroke-linecap','round').attr('fill','none').attr('opacity',.72);
    this.ground.select('.peak-stations').selectAll('circle').data(layout.stations).join('circle')
      .attr('cx',s => s.x).attr('cy',s => s.y).attr('r',2.4).attr('fill','#a2cace');
    this.ground.select('.peak-stations').on('click',(event) => {
      const name = event.target.__data__?.name;
      if (this.stats.has(name)) this.select(name);
    });
    this.towers = this.svg.select('.peak-towers');
    this.labels = this.svg.select('.peak-labels');
    this.bindControls();
    this.resize = new ResizeObserver(() => this.schedule());
    this.resize.observe(this.stage);
  }

  resetCamera() {
    this.camera = {yaw:-.37, pitch:.55, zoom:1, x:-78, y:30};
  }

  bindControls() {
    const svg = this.svg.node();
    const overhead = document.querySelector('#reliefOverhead');
    overhead.onclick = () => {
      const toggle = overhead.getAttribute('aria-pressed') !== 'true';
      if(toggle){
        this.previousCamera={...this.camera};
        this.camera={x:-78,y:25,yaw:0,pitch:Math.PI/2-.001,zoom:.89};
      }else this.camera=this.previousCamera || this.camera;
      overhead.setAttribute('aria-pressed',String(toggle));
      overhead.textContent=toggle ? '返回剖面' : '俯看热区';
      this.draw();
    };
    const full=document.querySelector('#reliefFullscreen');
    full.hidden=!this.stage.requestFullscreen;
    full.onclick=async () => {
      try {if(document.fullscreenElement) await document.exitFullscreen();else await this.stage.requestFullscreen();}
      catch {full.title='当前窗口未开放全屏';}
    };
    document.addEventListener('fullscreenchange',()=>{full.textContent=document.fullscreenElement?'退出演示':'放大演示';this.schedule();});
    let pointer = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button !== 0 || pointer) return;
      pointer = {id:e.pointerId,x:e.clientX,y:e.clientY,yaw:this.camera.yaw,pitch:this.camera.pitch,moved:false};
    });
    svg.addEventListener('pointermove', e => {
      if (!pointer || e.pointerId !== pointer.id) return;
      const dx = e.clientX-pointer.x, dy = e.clientY-pointer.y;
      if (Math.hypot(dx,dy) < 4 && !pointer.moved) return;
      pointer.moved = true;
      svg.setPointerCapture(e.pointerId);
      this.camera.yaw = pointer.yaw + dx*.008;
      overhead.setAttribute('aria-pressed','false');overhead.textContent='俯看热区';
      this.camera.pitch = Math.max(.22,Math.min(1.18,pointer.pitch + dy*.006));
      this.schedule();
    });
    const end = () => { this.dragged=pointer?.moved; pointer = null; };
    svg.addEventListener('pointerup',end);
    svg.addEventListener('pointercancel',end);
    svg.addEventListener('pointerleave',() => { if (!pointer?.moved) end(); });
    svg.addEventListener('click',e => {
      if(!this.relief || this.dragged) return;
      const name=this.relief.pick(e,svg.getBoundingClientRect());
      if(name){
        this.select(name);
        if(document.querySelector('#peakArcClick').checked) this.onColumnArcs(name);
      }
    });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom(Math.exp(-e.deltaY*.0014));
    },{passive:false});
    document.querySelector('#peakZoomIn').onclick = () => this.zoom(1.24);
    document.querySelector('#peakZoomOut').onclick = () => this.zoom(1/1.24);
    document.querySelector('#peakHome').onclick = () => { this.resetCamera();overhead.setAttribute('aria-pressed','false');overhead.textContent='俯看热区'; this.draw(); };
    document.querySelector('#peakFocus').onclick = () => {
      this.pinned = false;
      this.refreshSelection(this.top.name);
      this.focusSelection();
    };
    document.querySelector('#peakDetail').onclick = () => this.onDetail(this.selected);
    const field = document.querySelector('#peakOrigin');
    field.oninput = () => field.setCustomValidity('');
    document.querySelector('#peakForm').onsubmit = e => {
      e.preventDefault();
      const name = field.value.trim();
      if (this.stats.has(name)) { this.select(name); this.focusSelection(); }
      else {field.setCustomValidity('请选择可进出的站点'); field.reportValidity();}
    };
    svg.addEventListener('keydown',e => {
      const step = {'ArrowLeft':-.15,'ArrowRight':.15}[e.key];
      if (step) {e.preventDefault(); this.camera.yaw += step; this.draw();}
    });
  }

  zoom(factor) {
    this.camera.zoom = Math.max(.48,Math.min(3.4,this.camera.zoom*factor));
    this.draw();
  }

  activate(active,scenario,atlas) {
    this.active = active;
    document.querySelector('.analysis-grid').classList.toggle('peak-open',active);
    for (const id of ['peakStage','peakPanel','peakBar','peakJourney']) document.getElementById(id).hidden = !active;
    if (active) this.setScenario(scenario,atlas);
  }

  setScenario(scenario,atlas) {
    this.scenario = scenario;
    this.stats = new Map(atlas.stats.map(s => [s.name,s]));
    this.cache.set(scenario.station,this.stats);
    this.top = atlas.ranked[0];
    this.rows = atlas.stats.map(stat => ({...stat,station:this.stationByName.get(stat.name)}));
    if (!this.triedGL) {
      this.triedGL=true;
      try {
        this.relief=new PeakRelief(this.stage,this.layout,this.rows,this.heightUnit,this.rateColor);
        this.stage.classList.add('relief-on');
        this.relief.renderer.domElement.addEventListener('webglcontextlost',() => {
          this.relief.renderer.domElement.remove();this.relief=null;
          this.stage.classList.remove('relief-on');this.draw();
        },{once:true});
      } catch(error) { console.info('使用矢量峰值图',error.message); }
    }
    this.ground.select('.peak-shadows').selectAll('path').data(this.rows.filter(s=>s.count),s=>s.name)
      .join('path').attr('fill','#020c14').attr('opacity',.42).attr('d',s => {
        const {x,y} = s.station, d = s.rate*this.heightUnit*.48;
        return 'M'+(x-7)+','+(y+4)+' l14,-8 '+d+','+(d*.5)+' -14,8 Z';
      });
    this.ground.select('.peak-ban').attr('transform','translate('+this.stationByName.get(scenario.station).x+','+this.stationByName.get(scenario.station).y+')');
    const groups = this.towers.selectAll('g').data(this.rows,s => s.name).join('g')
      .attr('data-station',s => s.name).on('click',(_,s) => {
        this.select(s.name);
        if (document.querySelector('#peakArcClick').checked) this.onColumnArcs(s.name);
      });
    groups.each(function(s) {
      const g = d3.select(this);
      for (const cls of ['face-x','face-y','cap']) g.selectAll('.'+cls).data([s]).join('path').attr('class',cls);
      g.selectAll('title').data([s]).join('title').text(v=>v.name+' · '+(v.rate*100).toFixed(1)+'%');
    });
    this.setLine(this.line);
    document.querySelector('#peakScenario').textContent = scenario.station+'换乘受限';
    document.querySelector('#peakStamp').textContent = scenario.station + '换乘受限 · 358 个起点';
    this.refreshSelection(this.pinned && this.stats.has(this.selected) ? this.selected : this.top.name);
    this.draw();
  }

  select(name) {
    this.pinned = true;
    this.refreshSelection(name);
    this.draw();
  }

  focusSelection() {
    const station = this.stationByName.get(this.selected);
    this.camera.x = station.x;
    this.camera.y = station.y;
    this.camera.zoom = 1.45;
    // Centre the midpoint of the pillar, even when its summit is far above the tracks.
    this.camera.focusHeight = this.stats.get(this.selected).rate*this.heightUnit*.5;
    this.draw();
  }

  setLine(line) {
    this.line = line;
    if(this.relief && this.active){this.relief.update(this.rows,this.scenario.station,line);this.schedule();}
    this.ground.select('.peak-rails').selectAll('path').attr('opacity',p => line && p.line !== line ? .14 : .72);
    this.towers.selectAll('g').attr('opacity',s => line && !s.station.lines.includes(line) ? .18 : 1);
  }

  refreshSelection(name) {
    this.selected = name;
    const stat = this.stats.get(name), field = document.querySelector('#peakOrigin');
    this.journey.setOrigin(stat,this.scenario);
    field.value = name; field.setCustomValidity('');
    document.querySelector('#peakStation').textContent = name;
    document.querySelector('#peakRate').textContent = (100*stat.rate).toFixed(1)+'%';
    document.querySelector('#peakMode').textContent = this.pinned ? '已固定起点' : '当前情景最高峰';
    document.querySelector('#peakCount').textContent = stat.count+' / '+stat.comparable+' 个目的地受影响';
    document.querySelector('#peakBreakdown').textContent = stat.detour+' 个需多坐区段 · '+stat.transfer+' 个仅多换乘'+(stat.lost?' · '+stat.lost+' 个不可达':'');
    const compare = document.querySelector('#peakCompare');
    compare.replaceChildren();
    for (const scenario of this.data.scenarios) {
      if (!this.cache.has(scenario.station)) {
        const stats = summarizeImpactOrigins(scenario,this.data.order);
        this.cache.set(scenario.station,new Map(stats.map(s=>[s.name,s])));
      }
      const other = this.cache.get(scenario.station).get(name);
      const button = document.createElement('button');
      button.classList.toggle('current',scenario.station===this.scenario.station);
      const label = document.createElement('span'), rail = document.createElement('i'), fill = document.createElement('i'), val = document.createElement('b');
      label.textContent = scenario.station;
      fill.style.width = other.rate*100+'%';
      val.textContent = (100*other.rate).toFixed(1)+'%';
      rail.append(fill); button.append(label,rail,val);
      button.onclick = () => {this.pinned = true; this.onScenario(scenario.station);};
      compare.append(button);
    }
  }

  schedule() {
    if (this.active && !this.frame) this.frame = requestAnimationFrame(() => {this.frame = 0; if (this.active) this.draw();});
  }

  draw() {
    if (!this.active || !this.rows) return;
    const {width:w,height:h} = this.stage.getBoundingClientRect();
    if (!w || !h) return;
    const camera = this.camera, cos = Math.cos(camera.yaw), sin = Math.sin(camera.yaw);
    const tilt = Math.sin(camera.pitch), lift = Math.cos(camera.pitch);
    const overhead=document.querySelector('#reliefOverhead').getAttribute('aria-pressed')==='true';
    const k = Math.min((w-48)/1720,(h-70)/(overhead?1480:860))*camera.zoom;
    const a=k*cos, b=k*sin*tilt, c=-k*sin, d=k*cos*tilt;
    const tx=w*.5-a*camera.x-c*camera.y;
    const ty=h*.53-b*camera.x-d*camera.y+(camera.focusHeight || 0)*k*lift;
    const xy = (x,y) => [a*x+c*y,b*x+d*y];
    const base = s => [a*s.x+c*s.y+tx,b*s.x+d*s.y+ty];
    this.svg.attr('viewBox','0 0 '+w+' '+h);
    if(this.relief){
      this.relief.render(camera,w,h,k);
      this.drawLabels(w,h,k*lift,base);
      return;
    }
    this.ground.attr('transform','matrix('+[a,b,c,d,tx,ty].join(' ')+')');
    // Ground depth determines the painter's order for parallel, upright prisms.
    this.towers.selectAll('g').sort((p,q)=>sin*(p.station.x-q.station.x)+cos*(p.station.y-q.station.y));
    const heightUnit = this.heightUnit;
    const rx = sin >= 0 ? 1 : -1, ry = cos >= 0 ? 1 : -1;
    const palette = this.rateColor;
    this.towers.selectAll('g').each(function(s) {
      const r=6.7, z=s.rate*heightUnit*k*lift, p=base(s.station);
      const corners=[xy(-r,-r),xy(r,-r),xy(r,r),xy(-r,r)];
      const top=corners.map(([x,y])=>[x,y-z]);
      const path = pts => 'M'+pts.map(v=>v.join(',')).join('L')+'Z';
      const side = (i,j) => path([corners[i],corners[j],top[j],top[i]]);
      const color=d3.rgb(palette(s.rate));
      const g=d3.select(this).attr('transform','translate('+p+')').attr('data-height',s.rate*heightUnit);
      // Fixed world-space key light from the northwest. The visible faces change as the camera turns.
      g.select('.face-x').attr('d',rx>0?side(1,2):side(3,0)).attr('fill',color.darker(rx>0?.85:.15));
      g.select('.face-y').attr('d',ry>0?side(2,3):side(0,1)).attr('fill',color.darker(ry>0?.45:.05));
      g.select('.cap').attr('d',path(top)).attr('fill',s.count?color.brighter(.42):'#6b969d');
    });
    this.drawLabels(w,h,k*lift,base);
  }

  drawLabels(w,h,vertical,base) {
    this.svg.select('.peak-color-key').attr('transform','translate('+(w-158)+','+(h-44)+')');
    const name=this.selected, stat=this.stats.get(name), point=base(this.stationByName.get(name));
    const tip=[point[0],point[1]-stat.rate*this.heightUnit*vertical];
    const pos = this.labels.select('.peak-pointer');
    pos.attr('visibility',tip[0]>=0 && tip[0]<=w && tip[1]>=0 && tip[1]<=h ? 'visible' : 'hidden');
    const text=name+'   '+(stat.rate*100).toFixed(1)+'%', width=72+name.length*12;
    const x=Math.min(w-width-5,Math.max(5,tip[0]+17)), y=Math.max(48,Math.min(h-38,tip[1]-38));
    pos.select('path').attr('d','M'+tip+'L'+(x+8)+','+(y+21)).attr('stroke','#fff1cd');
    pos.select('circle').attr('cx',tip[0]).attr('cy',tip[1]);
    pos.select('rect').attr('x',x).attr('y',y).attr('width',width);
    pos.select('text').attr('x',x+9).attr('y',y+16).text(text);
    const ruler=this.labels.select('.peak-ruler'), span=this.heightUnit*vertical;
    ruler.attr('visibility',vertical*this.heightUnit<32?'hidden':'visible');
    const bottom=h-48;
    ruler.attr('transform','translate(32,'+bottom+')');
    const ticks=[0,.25,.50,.75,1].filter(v => bottom-span*v >= 60);
    ruler.select('path').attr('d','M0,0V-'+(span*ticks.at(-1))).attr('stroke','#8cb6bb');
    ruler.selectAll('g').data(ticks).join('g').attr('transform',v=>'translate(0,'+(-span*v)+')').each(function(v) {
      const g=d3.select(this);
      g.selectAll('line').data([v]).join('line').attr('x1',-3).attr('x2',4).attr('stroke','#aacece');
      g.selectAll('text').data([v]).join('text').attr('x',7).attr('y',3).attr('fill','#bdd1d3').attr('font-size',9).text((100*v)+'%');
    });
  }

  exportSVG() {
    const clone=this.svg.node().cloneNode(true);
    const {width,height}=this.stage.getBoundingClientRect();
    clone.setAttribute('width',width); clone.setAttribute('height',height);
    const ns='http://www.w3.org/2000/svg';
    if(this.relief){
      this.draw();
      const frame=document.createElementNS(ns,'image');
      frame.setAttribute('width',width);frame.setAttribute('height',height);
      frame.setAttribute('href',this.relief.renderer.domElement.toDataURL('image/png'));
      clone.querySelector('.peak-ground').replaceWith(frame);
      clone.querySelector('.peak-towers').remove();
      clone.querySelector('.relief-key').removeAttribute('style');
    } else {clone.querySelector('.relief-key').remove();}
    const title=document.createElementNS(ns,'title');
    title.textContent=this.scenario.station+'换乘受限 · 三维影响峰值 · 柱高表示受影响目的地占比';
    clone.prepend(title);
    const metadata=document.createElementNS(ns,'metadata');
    metadata.textContent='Chengdu schematic adapted from Rail Map Painter and RMP Gallery (GPL-3.0). Topology adapted from Open-Metro-PIS (CC BY-NC-SA 4.0).';
    clone.prepend(metadata);
    return new XMLSerializer().serializeToString(clone);
  }
}
