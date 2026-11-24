/* Reuse the exact states, schematic edge geometries and clock of the 2D replay. */
class LayerJourney {
  constructor(replay, lines) {
    this.replay = replay;
    this.lines = lines;
    this.svg = d3.select('#layerSvg');
    this.scene = this.svg.select('.layer-scene');
    replay.onFrame = (step,point,fraction) => this.update(step,point,fraction);
    for (const [id,phase] of [['playBeforeLayer','before'],['playAfterLayer','after']]) {
      document.getElementById(id).onclick = () => {
        replay.seek(phase === 'before' ? 0 : replay.cut+1);
        if (replay.position < replay.steps.length) replay.play(phase === 'before' ? replay.cut : replay.steps.length);
      };
    }
  }

  update(step, point, fraction) {
    if (!this.active) return;
    const r=this.replay, phase=step?.phase==='after'||!step ? 'after':'before';
    if (this.steps !== r.steps || this.phase !== phase) this.build(phase);
    const index=Math.floor(r.position);
    if (index!==this.index) {
      this.paths.attr('opacity',s=>s.index<=index?.98:.34);
      this.links.attr('stroke',s=>step?.phase==='restriction' && s.from[0]===r.map.blocked ? '#ff695c':'#ffe6a7')
        .attr('opacity',s=>s.index<=index?1:.42);
      this.index=index;
    }
    const map=r.map;
    let lane=step?.from?.[1] ?? this.lastLine;
    if (step?.phase==='restriction') {
      const transfer=this.transfers.find(s=>s.from[0]===map.blocked);
      if (!transfer) {this.dot.attr('visibility','hidden');return;}
      lane=transfer.from[1];point=map.byName.get(transfer.from[0]);
    }
    if (!this.levels.has(lane)) {this.dot.attr('visibility','hidden');return;}
    let pos=this.project(point,lane);
    if (step?.transfer) {
      const a=this.project(map.byName.get(step.from[0]),step.from[1]);
      const b=this.project(map.byName.get(step.to[0]),step.to[1]);
      pos=[a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction];
    }
    this.dot.attr('visibility','visible').attr('transform','translate('+pos+')');
  }

  build(phase) {
    const r=this.replay,map=r.map, journey=map.selection[phase];
    this.phase=phase;this.steps=r.steps;this.index=-1;
    const states=journey.states, lineIds=[...new Set(states.map(s=>s[1]))];
    this.lastLine=states.at(-1)?.[1];
    const h=Math.max(410,135+lineIds.length*79);
    this.svg.attr('viewBox','0 0 800 '+h);
    this.scene.selectAll('*').remove();
    const title=phase==='before'?'原路径':'受限后路径';
    this.scene.append('text').attr('x',24).attr('y',31).attr('fill','#b5d7d5').attr('font-size',13)
      .text(title+'　 /　'+map.selection.a+' → '+map.selection.b+'　 ·　'+(journey.cost?journey.cost[0]+' 区段，'+journey.cost[1]+' 次换乘':'不可达'));
    this.levels=new Map(lineIds.map((id,i)=>[id,95+i*(h-160)/Math.max(1,lineIds.length-1)]));
    const stations=states.map(([name])=>map.byName.get(name));
    const x=p=>p.x-.4*p.y, y=p=>.28*p.y+.08*p.x;
    const [x0,x1]=d3.extent(stations,x), [y0,y1]=d3.extent(stations,y);
    const sx=Math.min(4,450/Math.max(1,x1-x0)), sy=Math.min(2,45/Math.max(1,y1-y0));
    const tx=424-sx*(x0+x1)/2, ty=-sy*(y0+y1)/2;
    this.project=(p,id)=>[tx+sx*x(p),this.levels.get(id)+ty+sy*y(p)];
    const steps=r.steps.map((s,index)=>({...s,index})).filter(s=>s.phase===phase);
    this.transfers=steps.filter(s=>s.transfer);
    const decks=this.scene.append('g').selectAll('g').data(lineIds).join('g');
    decks.each((id,i,nodes)=>{
      const g=d3.select(nodes[i]), offset=this.levels.get(id), color=this.lines.get(id).color;
      g.attr('transform','translate(0,'+offset+')');
      g.append('path').attr('d','M125,-29 727,-29 680,29 78,29Z').attr('fill','#203a48').attr('fill-opacity',.86).attr('stroke','#42606c');
      g.append('path').attr('d','M78,29H680l47,-58').attr('fill','none').attr('stroke',color).attr('stroke-width',2);
      g.append('text').attr('x',18).attr('y',4).attr('fill','#e5eeef').attr('font-size',15).text(id+'号线');
      const trace=g.append('g').attr('transform','matrix('+[sx,.08*sy,-.4*sx,.28*sy,tx,ty]+')');
      for (const s of steps.filter(s=>!s.transfer&&s.from[1]===id)) {
        for(const part of s.parts) trace.append('path').datum(s).attr('class','level-track')
          .attr('d',part.node.getAttribute('d')).attr('fill','none').attr('stroke',color)
          .attr('stroke-width',4).attr('vector-effect','non-scaling-stroke').attr('stroke-linecap','round');
      }
      for (const name of new Set(states.filter(s=>s[1]===id).map(s=>s[0]))) {
        const p=this.project(map.byName.get(name),id);
        g.append('circle').attr('cx',p[0]).attr('cy',p[1]-offset).attr('r',3.2).attr('fill','#fff').attr('stroke',color);
      }
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches && g.node().animate)
        g.node().animate([{opacity:.18,transform:'translateY('+((h+30)/2)+'px)'},{opacity:1,transform:'translateY('+offset+'px)'}],{duration:480,easing:'ease-out'});
    });
    this.paths=this.scene.selectAll('.level-track');
    this.links=this.scene.append('g').selectAll('path').data(this.transfers).join('path')
      .attr('d',s=>'M'+this.project(map.byName.get(s.from[0]),s.from[1])+'L'+this.project(map.byName.get(s.to[0]),s.to[1]))
      .attr('fill','none').attr('stroke-width',2.5).attr('stroke-dasharray','4 3');
    const labels=steps.filter(s=>s.transfer).map(s=>({name:s.from[0]+(s.external?' → '+s.to[0]:''),p:this.project(map.byName.get(s.from[0]),s.from[1])}));
    if(states.length) for(const [s,prefix] of [[states[0],'起'],[states.at(-1),'终']])
      labels.push({name:prefix+' · '+s[0],p:this.project(map.byName.get(s[0]),s[1])});
    this.scene.append('g').selectAll('text').data(labels).join('text').attr('x',s=>s.p[0]+8).attr('y',s=>s.p[1]-8)
      .attr('font-size',12).attr('fill','#fff4d9').attr('paint-order','stroke').attr('stroke','#172e3a').attr('stroke-width',3).text(s=>s.name);
    this.dot=this.scene.append('g');
    this.dot.append('circle').attr('r',9).attr('fill','#fff2ae').attr('opacity',.28);
    this.dot.append('circle').attr('r',4.7).attr('fill','#fff2ae').attr('stroke','#835b36');
  }
}
