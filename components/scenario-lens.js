class ScenarioLens {
  constructor(data,layout,onScenario,onJourney) {
    this.data=data; this.layout=layout; this.onScenario=onScenario; this.onJourney=onJourney;
    this.svg=d3.select('#lensSvg');
    this.coords=new Map(layout.stations.map(p=>[p.name,p]));
    this.cache=new Map();
    this.progress=1;
    this.angle=-.28;
    this.first=document.querySelector('#lensFirst');
    this.second=document.querySelector('#lensSecond');
    for(const s of data.scenarios) {
      this.first.add(new Option(s.station,s.station));
      this.second.add(new Option(s.station,s.station));
    }
    this.second.selectedIndex=1;
    this.first.onchange=()=>this.onScenario(this.first.value);
    this.second.onchange=()=>this.refresh();
    document.querySelector('#lensSwap').onclick=()=>{
      const target=this.second.value;
      this.second.value=this.first.value;
      this.onScenario(target);
    };
    document.querySelector('#lensProgress').oninput=e=>{this.progress=Number(e.target.value)/100;this.draw();};
    document.querySelector('#lensAngle').oninput=e=>{this.angle=Number(e.target.value)*Math.PI/180;this.draw();};
    const input=document.querySelector('#lensOrigin');
    input.oninput=()=>input.setCustomValidity('');
    document.querySelector('#lensForm').onsubmit=e=>{
      e.preventDefault();
      const name=input.value.trim();
      if(this.data.order.includes(name)) this.pick(name);
      else {input.setCustomValidity('请选择可进出的站点');input.reportValidity();}
    };
  }

  summary(station) {
    if(!this.cache.has(station)) {
      const scenario=this.data.scenarios.find(s=>s.station===station);
      this.cache.set(station,new Map(summarizeImpactOrigins(scenario,this.data.order).map(s=>[s.name,s])));
    }
    return this.cache.get(station);
  }

  activate(mode,scenario,origin) {
    const enteringDelta=mode==='delta' && this.mode!=='delta';
    this.mode=mode;
    this.first.value=scenario.station;
    if (enteringDelta && this.second.value===this.first.value) this.second.value=this.data.scenarios.find(s=>s.station!==scenario.station).station;
    document.querySelector('#lensHost').hidden=!mode;
    document.querySelector('#lensPanel').hidden=!mode;
    document.querySelector('.analysis-grid').classList.toggle('lens-open',!!mode);
    if(!mode)return;
    document.querySelector('#deltaTools').hidden=mode!=='delta';
    document.querySelector('#deltaSlider').hidden=mode!=='delta';
    if(origin) this.name=origin;
    this.refresh();
  }

  refresh() {
    const first=this.summary(this.first.value), second=this.summary(this.second.value);
    this.rows=this.data.order.map(name=>({name,station:this.coords.get(name),left:first.get(name),right:second.get(name),
      delta:second.get(name).rate-first.get(name).rate}));
    this.ranked=[...this.rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    this.pick(this.name || (this.mode==='delta'?this.ranked[0].name:[...first.values()].sort((a,b)=>b.rate-a.rate)[0].name));
  }

  pick(name) {
    this.name=name;
    const row=this.rows.find(r=>r.name===name);
    const field=document.querySelector('#lensOrigin');
    field.value=name;field.setCustomValidity('');
    document.querySelector('#lensName').textContent=name;
    const diff=this.mode==='delta';
    const signed=v=>(v>0?'+':'')+(100*v).toFixed(1);
    document.querySelector('#lensEyebrow').textContent=diff?'SCENARIO DIFFERENCE　/　双情景差值':'DESTINATION ARCS　/　目的站弧线';
    document.querySelector('#lensValue').textContent=diff?signed(row.delta)+' 个百分点':row.left.count+' 个目的站';
    document.querySelector('#lensNote').textContent=diff?
      this.first.value+' '+row.left.count+'/'+row.left.comparable+' → '+this.second.value+' '+row.right.count+'/'+row.right.comparable:
      this.first.value+'换乘受限 · '+row.left.detour+' 个多坐区段，'+row.left.transfer+' 个仅多换乘'+(row.left.lost?'，'+row.left.lost+' 个不可达':'');
    this.arcs=row.left.row.map((v,i)=>({name:this.data.order[i],v}))
      .filter(s=>s.v>0||s.v===-2||s.v===-1).sort((a,b)=>this.priority(b.v)-this.priority(a.v)).slice(0,8);
    const list=document.querySelector('#lensList');list.replaceChildren();
    document.querySelector('#lensListTitle').textContent=diff?'差异最大的起点':'优先展示的目的站';
    const items=diff?this.ranked.slice(0,6):this.arcs;
    document.querySelector('#lensListNote').textContent=diff?'按差值绝对值排序 · 第二情景减第一情景':
      '最多 8 条 · 优先不可达，再按增加区段排序，同值按站点表顺序';
    if (!items.length) list.textContent='从本站出发，所有目的站的最优代价均保持不变。';
    items.forEach((s,i)=>{
      const button=document.createElement('button'), rank=document.createElement('small'), val=document.createElement('b');
      rank.textContent=String(i+1).padStart(2,'0');
      val.textContent=diff?signed(s.delta)+' pp':impactDescription(s.v);
      button.append(rank,s.name,val);
      button.onclick=()=>diff?this.pick(s.name):this.onJourney(this.name,s.name);
      list.append(button);
    });
    this.draw();
  }

  priority(v) {return v===-1?Infinity:v===-2?0:v;}
  color(v) {return v===-1?'#d7a7ff':v===-2?'#68ddd0':v<=2?'#ffda76':v<=4?'#ff9e66':'#ff6578';}

  draw() {
    const diff=this.mode==='delta', svg=this.svg;
    const sin=Math.sin(this.angle), cos=Math.cos(this.angle);
    const raw=p=>[cos*p.x-sin*p.y,.48*(sin*p.x+cos*p.y)];
    const focus=diff?this.layout.stations:[this.coords.get(this.name),...this.arcs.map(s=>this.coords.get(s.name))];
    const projected=focus.map(raw);
    const [x0,x1]=d3.extent(projected,p=>p[0]),[y0,y1]=d3.extent(projected,p=>p[1]);
    const k=diff?.395:Math.min(1.7,590/Math.max(220,x1-x0),200/Math.max(100,y1-y0));
    const dx=410-k*(x0+x1)/2,dy=(diff?235:278)-k*(y0+y1)/2;
    const point=p=>{const [x,y]=raw(p);return [dx+k*x,dy+k*y];};
    const ground=svg.select('.lens-floor').attr('transform','matrix('+[k*cos,k*.48*sin,-k*sin,k*.48*cos,dx,dy]+')');
    ground.select('.lens-base-rails').selectAll('path').data(this.layout.paths).join('path')
      .attr('d',p=>p.d).attr('stroke',p=>p.color).attr('stroke-width',diff?2.2:2.8).attr('opacity',diff?.46:.34).attr('fill','none');
    ground.select('.lens-base-dots').selectAll('circle').data(this.layout.stations).join('circle')
      .attr('cx',p=>p.x).attr('cy',p=>p.y).attr('r',2.6).attr('fill','#8cb4bf');
    svg.select('.lens-caption').text(diff?this.first.value+' → '+this.second.value+'　/　第二情景减第一情景':this.first.value+'换乘受限　/　从'+this.name+'出发');
    svg.select('.lens-legend').text(diff?'橙红 ↑ 占比上升　　蓝青 ↓ 占比下降　　线网平面 = 0 个百分点':
      '弧线仅连接起终点　　黄 +1–2　 橙 +3–4　 红 ≥5 区段　 青 仅多换乘　 紫 不可达');
    if(diff)this.drawDifference(point,raw);
    else this.drawArcs(point);
  }

  drawDifference(point,raw) {
    const svg=this.svg, t=this.progress;
    document.querySelector('#lensFraction').textContent=Math.round(t*100)+'%';
    svg.select('.lens-arcs').selectAll('*').remove();
    const plot=(group,rows)=>{
      const marks=group.selectAll('g').data(rows,s=>s.name).join('g')
        .attr('data-origin',s=>s.name).attr('transform',s=>'translate('+point(s.station)+')')
        .sort((a,b)=>raw(a.station)[1]-raw(b.station)[1]).on('click',(_,s)=>this.pick(s.name));
      marks.each(function(s){
        const z=s.delta*164*t, g=d3.select(this);
        const face=s.delta<0?'#3ec5df':'#ff9169', shade=s.delta<0?'#28748e':'#b75144';
        g.attr('data-delta',s.delta).attr('data-z',z);
        const faces=[['M-3,0L0,1.6V'+(1.6-z)+'L-3,'+(-z)+'Z',shade],
          ['M0,1.6L3,0V'+(-z)+'L0,'+(1.6-z)+'Z',face],
          ['M-3,'+(-z)+'l3,-1.6 3,1.6 -3,1.6Z',s.delta===0?'#769398':face]];
        g.selectAll('path').data(faces).join('path').attr('d',f=>f[0]).attr('fill',f=>f[1]);
        g.selectAll('title').data([s]).join('title').text(r=>r.name+' · '+(100*r.delta).toFixed(1)+' 个百分点');
      });
    };
    plot(svg.select('.lens-negative'),this.rows.filter(s=>s.delta<0));
    plot(svg.select('.lens-positive'),this.rows.filter(s=>s.delta>=0));
    const selected=this.rows.find(s=>s.name===this.name), p=point(selected.station);
    this.flag([p[0],p[1]-selected.delta*164*t],this.name+'　'+(selected.delta>0?'+':'')+(100*selected.delta*t).toFixed(1)+' pp');
    svg.select('.lens-scale').text('25 pp').attr('visibility','visible');
    svg.select('.lens-rule').attr('visibility','visible');
  }

  flag(point,text) {
    const label=this.svg.select('.lens-flag');
    const w=Math.max(104,text.length*9+12),x=Math.max(5,Math.min(795-w,point[0]+12)),y=Math.max(52,Math.min(385,point[1]-29));
    label.select('path').attr('d','M'+point+'L'+(x+4)+','+(y+15));
    label.select('rect').attr('x',x).attr('y',y).attr('width',w);
    label.select('text').attr('x',x+7).attr('y',y+16).text(text);
  }

  drawArcs(point) {
    const svg=this.svg, start=point(this.coords.get(this.name));
    svg.select('.lens-negative').selectAll('*').remove();svg.select('.lens-positive').selectAll('*').remove();
    svg.select('.lens-scale').attr('visibility','hidden');svg.select('.lens-rule').attr('visibility','hidden');
    const arcs=svg.select('.lens-arcs').selectAll('g').data(this.arcs,s=>s.name).join('g')
      .attr('data-destination',s=>s.name).on('click',(_,s)=>this.onJourney(this.name,s.name));
    arcs.each((s,i,nodes)=>{
      const g=d3.select(nodes[i]), end=point(this.coords.get(s.name)), color=this.color(s.v);
      const h=42+Math.min(114,Math.hypot(end[0]-start[0],end[1]-start[1])*.32)+i*2;
      const d='M'+start+' Q'+[(start[0]+end[0])/2,(start[1]+end[1])/2-h*2]+' '+end;
      g.selectAll('path').data([[9,color,.13],[2.6,color,1],[12,'transparent',1]]).join('path')
        .attr('d',d).attr('fill','none').attr('stroke',v=>v[1]).attr('stroke-width',v=>v[0]).attr('opacity',v=>v[2]);
      g.selectAll('circle').data([s]).join('circle').attr('cx',end[0]).attr('cy',end[1]).attr('r',8).attr('fill','#172e39').attr('stroke',color);
      g.selectAll('text').data([s]).join('text').attr('x',end[0]).attr('y',end[1]+3).attr('text-anchor','middle')
        .attr('fill','#fff').attr('font-size',9).attr('pointer-events','none').text(i+1);
      g.selectAll('title').data([s]).join('title').text(s=>s.name+' · '+impactDescription(s.v)+' · 点击回放');
    });
    const first=this.arcs[0];
    const firstLabel=svg.select('.lens-arcs').selectAll('text.arc-lead').data(first?[first]:[]).join('text').attr('class','arc-lead');
    if(first) {
      const end=point(this.coords.get(first.name));
      firstLabel.attr('x',Math.min(640,end[0]+12)).attr('y',end[1]-12).attr('fill','#fff2d4')
        .attr('paint-order','stroke').attr('stroke','#132a37').attr('stroke-width',3).attr('font-size',12)
        .text(first.name+' · '+impactDescription(first.v)).style('pointer-events','none');
    }
    this.flag(start,'起点　'+this.name);
  }
}
