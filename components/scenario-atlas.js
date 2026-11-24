(() => {
  const data = window.METRO_DATA, layout = window.METRO_LAYOUT;
  const stations = new Map(layout.stations.map(s => [s.name,s]));
  const order = data.order.map(name => stations.get(name));
  const index = new Map(data.order.map((name,i) => [name,i]));
  const delaunay = d3.Delaunay.from(order,s => s.x,s => s.y);
  const network = layout.paths.map(p => p.d).join(' ');
  const field = document.querySelector('#atlasOrigin'), tip = document.querySelector('#atlasTip');
  const bins = [
    {color:'#afb6b0',label:'代价不变',size:4},
    {color:'#157c80',label:'仅多换乘',size:14},
    {color:'#edb460',label:'多 1–2 段',size:11},
    {color:'#da7037',label:'多 3–4 段',size:12},
    {color:'#a93732',label:'多 5 段及以上',size:14},
    {color:'#754786',label:'不可达',size:14}
  ];
  const binOf = v => v === -2 ? 1 : v === -1 ? 5 : v <= 0 ? 0 : v <= 2 ? 2 : v <= 4 ? 3 : 4;
  function pointShape(x,y,b) {
    const r = bins[b].size;
    if(b === 1) return `M${x},${y-r}l${r},${r} -${r},${r} -${r},-${r}Z`;
    if(b === 5) return `M${x},${y-r}l${r},${2*r}h-${r*2}Z`;
    return `M${x-r},${y}a${r},${r} 0 1,0 ${r*2},0a${r},${r} 0 1,0 -${r*2},0Z`;
  }
  const cards = data.scenarios.map((scenario,i) => {
    const card = document.createElement('article');
    card.dataset.scenario = scenario.station;
    card.innerHTML = '<div class="card-top"><h3><span class="ordinal"></span><span class="name"></span></h3><strong class="ratio"></strong></div><svg viewBox="-830 -705 1510 1460" role="img"></svg><div class="card-bottom"><span class="count"></span><a>看三维剖面 ↗</a></div>';
    card.querySelector('.ordinal').textContent = String(i+1).padStart(2,'0');
    card.querySelector('.name').textContent = scenario.station+'受限';
    document.querySelector('#maps').append(card);
    const svg = d3.select(card.querySelector('svg'));
    const glow = svg.selectAll('path.halo').data(bins).join('path').attr('class','halo')
      .attr('fill','none').attr('stroke',b=>b.color).attr('stroke-width',34).attr('opacity',.16);
    svg.append('path').attr('d',network).attr('fill','none').attr('stroke','#b9c3b9').attr('stroke-width',4);
    const marks = svg.selectAll('path.mark').data(bins).join('path').attr('class','mark')
      .attr('fill',(b,i) => i===5?'none':b.color).attr('stroke',b => b.color).attr('stroke-width',(_,i)=>i===5?8:1);
    const ban = stations.get(scenario.station);
    svg.append('path').attr('d',`M${ban.x-16},${ban.y-16}l32,32m0,-32l-32,32`)
      .attr('fill','none').attr('stroke','#302e42').attr('stroke-width',8);
    const ring = svg.append('circle').attr('r',26).attr('fill','none').attr('stroke','#173f46').attr('stroke-width',7);
    const note = svg.append('g').attr('class','map-note').attr('pointer-events','none');
    note.append('path').attr('fill','none').attr('stroke','#6e6254').attr('stroke-width',4);
    note.append('text').attr('font-size',76).attr('font-weight',650).attr('fill','#503e32')
      .attr('stroke','#fffdf7').attr('stroke-width',17).attr('paint-order','stroke');
    const item = {card,svg,glow,marks,ring,scenario,note};
    const nearby = e => {
      const [x,y] = d3.pointer(e,svg.node()), j = delaunay.find(x,y);
      return Math.hypot(order[j].x-x,order[j].y-y) < 25 ? j : -1;
    };
    svg.on('pointermove',e => {
      const j = nearby(e);
      if(j < 0){tip.hidden=true;return;}
      const code = item.row[j];
      const label = code===-3 ? '当前起点' : code===-4 ? '未比较' : code>0 ? '多 '+code+' 个区段' : bins[binOf(code)].label;
      tip.textContent = item.scenario.station+'受限　／　'+order[j].name+' · '+label;
      tip.hidden=false;
      tip.style.left=Math.max(4,Math.min(innerWidth-tip.offsetWidth-4,e.clientX+10))+'px';
      tip.style.top=Math.max(4,Math.min(innerHeight-tip.offsetHeight-4,e.clientY+12))+'px';
    }).on('pointerleave',() => {tip.hidden=true;}).on('click',e => {
      const j=nearby(e);
      if(j>=0) select(order[j].name);
    });
    return item;
  });

  function select(name) {
    if(!index.has(name)){field.setCustomValidity('请选择可以进出的地铁站');field.reportValidity();return;}
    field.setCustomValidity('');field.value=name;tip.hidden=true;
    document.querySelector('#originCaption').textContent=name;
    for(const button of document.querySelectorAll('#examples button')) button.setAttribute('aria-pressed',String(button.textContent===name));
    const start=index.get(name)*order.length, station=stations.get(name);
    for(const item of cards){
      const {card,marks,ring,scenario}=item;
      item.row=scenario.matrix.slice(start,start+order.length);
      const symbols=bins.map(()=>[]);let comparable=0, count=0;
      item.row.forEach((v,j)=>{
        if(v< -2)return;
        comparable++;if(v!==0)count++;
        const b=binOf(v);
        symbols[b].push(pointShape(order[j].x,order[j].y,b));
      });
      item.count=count;item.comparable=comparable;
      marks.attr('d',(_,i)=>symbols[i].join(' '));
      item.glow.attr('d',(_,i)=>i ? marks.nodes()[i].getAttribute('d') : '');
      card.style.setProperty('--share',(comparable ? 100*count/comparable : 0)+'%');
      // Label one strongest detour as an example. Other stations remain available on hover.
      const worst = Math.max(...item.row);
      item.note.attr('display',worst>0?null:'none');
      if(worst>0){
        const dest=order[item.row.indexOf(worst)];
        const tx=dest.x>0?-765:620, anchor=dest.x>0?'start':'end';
        const ty=Math.max(-620,Math.min(680,dest.y-145));
        const elbowX=tx+(anchor==='start'?210:-210);
        item.note.select('path').attr('d','M'+dest.x+','+dest.y+'L'+elbowX+','+(ty+17)+'H'+tx);
        item.note.select('text').attr('x',tx).attr('y',ty).attr('text-anchor',anchor).text(dest.name+' +'+worst+'段');
      }
      ring.attr('cx',station.x).attr('cy',station.y);
      card.querySelector('.ratio').textContent=comparable?(100*count/comparable).toFixed(1)+'%':'—';
      card.querySelector('.count').innerHTML='<b>'+count+'</b> / '+comparable+' 站受影响';
      card.querySelector('a').href='index.html?'+new URLSearchParams({scenario:scenario.station,origin:name})+'#peak';
      item.svg.attr('aria-label',scenario.station+'受限，从'+name+'出发有'+count+'个目的站受影响');
    }
    const max=Math.max(...cards.map(c=>c.count)), leaders=cards.filter(c=>c.count===max);
    cards.forEach(c=>c.card.classList.toggle('leader',max>0 && c.count===max));
    document.querySelector('#summaryStation').textContent=leaders.length===1?leaders[0].scenario.station+'受限':leaders.map(c=>c.scenario.station).join('、')+'并列';
    document.querySelector('#summaryCount').textContent=max+' / '+leaders[0].comparable;
    document.querySelector('#summaryText').textContent='从'+name+'出发，'+max+' 个目的站的最优行程发生变化。';
  }
  for(const name of data.order) document.querySelector('#atlasStations').append(new Option(name,name));
  field.oninput=()=>field.setCustomValidity('');
  field.form.onsubmit=e=>{e.preventDefault();select(field.value.trim());};
  for(const b of document.querySelectorAll('#examples button')) b.onclick=()=>select(b.textContent);
  const linked=new URLSearchParams(location.search).get('origin');
  select(index.has(linked)?linked:'锦城广场');
})();
