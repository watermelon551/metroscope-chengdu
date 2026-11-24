class Reachability {
  constructor(map, router, order, onRoute) {
    this.map = map;
    this.router = router;
    this.order = order;
    this.onRoute = onRoute;
    this.budget = 5;
    this.slider = document.querySelector('#reachBudget');
    this.slider.oninput = () => this.setBudget(Number(this.slider.value));
    const field = document.querySelector('#reachOrigin');
    field.oninput = () => field.setCustomValidity('');
    document.querySelector('#reachForm').onsubmit = event => {
      event.preventDefault();
      const name = field.value.trim();
      if (!this.order.includes(name)) {
        field.setCustomValidity('请选择可作为起点的地铁站。');
        field.reportValidity();
        return;
      }
      this.load(name,this.blocked);
    };
    document.querySelector('#reachFit').onclick = () => this.frame(true);
    this.points = map.scene.insert('g','.station-layer').attr('class','reach-points');
    this.corridors = map.scene.insert('g','.reach-points').attr('class','reach-corridors');
    this.badges = map.scene.append('g').attr('class','reach-badges');
    this.annotation = map.scene.append('g').attr('class','reach-annotation');
    this.annotation.append('path').attr('d','M0,0 l20,-21 h12').attr('stroke','#79354e').attr('fill','none');
    this.annotation.append('rect').attr('x',31).attr('y',-34).attr('height',26).attr('rx',5).attr('fill','#76374c');
    this.annotation.append('text').attr('x',39).attr('y',-17).attr('fill','white').attr('font-size',11);
    map.zoom.on('zoom.reach', () => this.placeAnnotation());
    this.chart = d3.select('#reachProfile');
  }

  activate(active, origin, blocked) {
    this.active = active;
    document.querySelector('.analysis-grid').classList.toggle('reach-open',active);
    this.map.scene.classed('reach-view',active);
    for (const id of ['reachPanel','reachBar','reachControls']) document.getElementById(id).hidden = !active;
    if (active) this.load(origin,blocked);
  }

  load(origin, blocked) {
    document.querySelector('#stationPopup').hidden = true;
    const before = this.origin === origin ? this.before : this.router.rangeFrom(origin);
    this.before = before;
    this.origin = origin;
    this.blocked = blocked;
    const after = this.router.rangeFrom(origin,blocked);
    this.rows = this.order.filter(name => name !== origin).map(name => ({
      name, before:before.intervals.get(name) ?? Infinity, after:after.intervals.get(name) ?? Infinity
    }));
    const segments = new Map();
    this.router.data.rides.forEach((ride,i) => {
      const ids = this.map.layout.ridePaths[ride.la+'|'+ride.a+'|'+ride.b];
      for (const id of ids) {
        const existing = segments.get(id) || {id,d:this.map.paths.get(id).d,before:Infinity,after:Infinity};
        existing.before = Math.min(existing.before,before.rides[i]);
        existing.after = Math.min(existing.after,after.rides[i]);
        segments.set(id,existing);
      }
    });
    this.segments = [...segments.values()];
    this.byName = new Map(this.rows.map(row => [row.name,row]));
    const max = d3.max(this.rows, r => Math.max(Number.isFinite(r.before) ? r.before : 0, Number.isFinite(r.after) ? r.after : 0));
    this.slider.max = max;
    this.profile = d3.range(max+1).map(k => this.rows.filter(r => r.before <= k && r.after > k).length);
    document.querySelector('#reachOrigin').value = origin;
    document.querySelector('#reachOrigin').setCustomValidity('');
    document.querySelector('#reachContext').textContent = origin + '出发 · ' + blocked + '换乘受限';
    document.querySelector('#reachMax').textContent = max + ' 区段';
    this.drawProfile();
    this.setBudget(Math.min(this.budget,max));
    this.frame(false);
  }

  setBudget(value) {
    this.budget = value;
    this.slider.value = value;
    this.slider.setAttribute('aria-valuetext',value + ' 个乘车区段');
    document.querySelector('#stationPopup').hidden = true;
    const kept = this.rows.filter(r => r.after <= value);
    const lost = this.rows.filter(r => r.before <= value && r.after > value)
      .sort((a,b) => (b.after-b.before) - (a.after-a.before) || a.before - b.before);
    document.querySelector('#reachValue').textContent = value;
    document.querySelector('#reachBefore').textContent = kept.length + lost.length;
    document.querySelector('#reachAfter').textContent = kept.length;
    document.querySelector('#reachLost').textContent = lost.length;
    document.querySelector('#reachOutside').textContent = (this.rows.length-kept.length-lost.length) + ' 站原本已超出预算';
    this.chart.selectAll('.budget-bar').attr('fill',k => k === value ? '#a63e5e' : '#d8b7bf');
    this.chart.select('.budget-guide').attr('x',this.x(value));
    const categories = new Map(kept.map(r => [r.name,'kept']));
    for (const r of lost) categories.set(r.name,'lost');
    categories.set(this.origin,'origin');
    this.corridors.selectAll('path').data(this.segments.filter(s => s.before <= value),s => s.id).join('path')
      .attr('d',s => s.d).attr('fill','none').attr('stroke-linecap','round').attr('stroke-linejoin','round')
      .attr('stroke',s => s.after <= value ? '#309887' : '#c75c7b')
      .attr('stroke-width',s => s.after <= value ? 3.4 : 4).attr('stroke-dasharray',s => s.after <= value ? null : '5 3');
    this.map.scene.selectAll('.station-group').attr('data-reach',s =>
      categories.get(s.name) || (this.byName.has(s.name) ? 'outside' : 'transfer-only'));
    const inside = this.map.layout.stations.filter(s => categories.has(s.name));
    this.points.selectAll('path').data(inside,s => s.name).join('path')
      .attr('transform',s => 'translate('+s.x+','+s.y+')')
      .attr('d',s => categories.get(s.name) === 'lost' ? 'M0,-8L8,0 0,8 -8,0Z' : 'M-5,0a5,5 0 1,0 10,0a5,5 0 1,0 -10,0')
      .attr('fill',s => categories.get(s.name) === 'lost' ? '#b34466' : '#25988a')
      .attr('stroke','#fff').attr('stroke-width',1);
    const badges = [{name:this.blocked,label:'×',color:'#933d49',dx:8},{name:this.origin,label:'O',color:'#164858',dx:-8}];
    const groups = this.badges.selectAll('g').data(badges).join('g').attr('transform',d => {
      const p = this.map.byName.get(d.name);
      return 'translate('+(p.x+d.dx)+','+(p.y-7)+')';
    });
    groups.selectAll('circle').data(d => [d]).join('circle').attr('r',6).attr('fill',d => d.color).attr('stroke','white');
    groups.selectAll('text').data(d => [d]).join('text').attr('text-anchor','middle').attr('y',3)
      .attr('font-size',9).attr('fill','white').text(d => d.label);
    this.drawList(lost);
    this.highlight = lost[0];
    this.annotation.style('visibility',this.highlight ? 'visible' : 'hidden');
    if (this.highlight) {
      const r = this.highlight, after = Number.isFinite(r.after) ? r.after : '不可达';
      this.annotation.select('text').text(r.name+'　'+r.before+' → '+after);
      this.annotation.select('rect').attr('width',r.name.length*11+70);
      this.placeAnnotation();
    }
  }

  placeAnnotation() {
    if (!this.active || !this.highlight) return;
    const p = this.map.byName.get(this.highlight.name);
    this.annotation.attr('transform','translate('+p.x+','+p.y+') scale('+1/this.map.transform.k+')');
  }

  drawProfile() {
    const w = 284, h = 45;
    this.chart.selectAll('*').remove();
    const ticks = d3.range(this.profile.length);
    this.x = d3.scaleBand().domain(ticks).range([2,w-2]).padding(.15);
    const y = d3.scaleLinear().domain([0,d3.max(this.profile) || 1]).range([h,4]);
    this.chart.append('g').selectAll('rect').data(ticks).join('rect').attr('class','budget-bar')
      .attr('x',k => this.x(k)).attr('width',this.x.bandwidth())
      .attr('y',k => y(this.profile[k])).attr('height',k => h-y(this.profile[k]));
    this.chart.append('rect').attr('class','budget-guide').attr('width',this.x.bandwidth())
      .attr('y',47).attr('height',3).attr('rx',1).attr('fill','#9d3358');
    this.chart.append('g').selectAll('rect').data(ticks).join('rect')
      .attr('x',k => this.x(k)).attr('width',this.x.step()).attr('height',52)
      .attr('fill','transparent').style('cursor','pointer').on('click',(_,k) => this.setBudget(k))
      .append('title').text(k => k+' 区段预算 · '+this.profile[k]+' 个目的站超出原范围');
  }

  drawList(rows) {
    const list = document.querySelector('#reachList');
    list.replaceChildren();
    list.scrollTop = 0;
    if (!rows.length) list.textContent = '当前预算下，前后可达的目的站集合相同。';
    for (const row of rows) {
      const button = document.createElement('button');
      const cost = document.createElement('b');
      cost.textContent = row.before+' → '+(Number.isFinite(row.after) ? row.after : '不可达');
      button.append(row.name,cost);
      button.title = '回放从'+this.origin+'到'+row.name+'的路径';
      button.onclick = () => this.onRoute(this.origin,row.name);
      list.append(button);
    }
  }

  frame(animate) {
    const baseline = this.rows.filter(r => r.before <= this.budget);
    const lost = baseline.filter(r => r.after > this.budget);
    const extent = !animate && lost.length ? lost : baseline;
    const names = [this.origin,...extent.map(r => r.name)];
    const nodes = names.map(n => this.map.byName.get(n));
    const [x1,x2] = d3.extent(nodes,s => s.x), [y1,y2] = d3.extent(nodes,s => s.y);
    this.map.fit([x1-45,y1-30,Math.max(90,x2-x1+90),Math.max(60,y2-y1+60)],animate);
  }
}
