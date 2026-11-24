/* Analytical layers use the existing schematic coordinate system. */
const impactPalette = {
  neutral: '#acb9bd', low: '#f6b347', mid: '#ef7337', high: '#bd293b',
  transfer: '#197e83', lost: '#724889', origin: '#154c55'
};

function impactBin(code, detail) {
  if (detail && code === -2) return 'transfer';
  if (detail && code === -1) return 'lost';
  if (!(code > 0)) return 'neutral';
  if (detail) return code <= 2 ? 'low' : code <= 4 ? 'mid' : 'high';
  return code < 0.1 ? 'low' : code < 0.3 ? 'mid' : 'high';
}

function summarizeImpactOrigins(scenario, order) {
  const n = order.length;
  return order.map((name, i) => {
    const row = scenario.matrix.slice(i * n, i * n + n);
    let comparable = 0, detour = 0, transfer = 0, lost = 0;
    for (const v of row) {
      if (v === -3 || v === -4) continue;
      comparable++;
      if (v > 0) detour++;
      if (v === -2) transfer++;
      if (v === -1) lost++;
    }
    const count = detour + transfer + lost;
    return {name, row, comparable, detour, transfer, lost, count, rate: comparable ? count / comparable : 0};
  });
}

class ImpactAtlas {
  constructor(map, order, onRoute) {
    this.map = map;
    this.order = order;
    this.index = new Map(order.map((name, i) => [name, i]));
    this.onRoute = onRoute;
    this.wash = map.scene.insert('g', '.base-rails').attr('class', 'impact-wash');
    this.points = map.scene.insert('g', '.station-layer').attr('class', 'impact-points');
    map.scene.selectAll('.station-group').insert('circle', ':first-child')
      .attr('class','impact-hit').attr('r',5).attr('fill','transparent');
    this.flag = map.scene.append('g').attr('class', 'impact-flag');
    this.callout = map.scene.append('g').attr('class', 'impact-callout');
    this.callout.append('path').attr('d','M0,0 l-20,-37 h-16').attr('fill','none')
      .attr('stroke','#783b43').attr('stroke-width',1.3);
    this.callout.append('rect').attr('x',-153).attr('y',-53).attr('width',118)
      .attr('height',30).attr('rx',6).attr('fill','#552b37');
    this.callout.append('text').attr('x',-94).attr('y',-34).attr('text-anchor','middle')
      .attr('font-size',12).attr('font-weight',600).attr('fill','#fff9f0');
    map.zoom.on('zoom.impact-callout', () => this.placeCallout());
    this.panel = document.querySelector('#impactPanel');
    document.querySelector('#impactBack').onclick = () => this.show(null);
    document.querySelector('#impactSwitch').onchange = () => this.syncLayer();
    document.querySelector('#impactForm').onsubmit = e => {
      e.preventDefault();
      const field = document.querySelector('#impactOrigin');
      const name = field.value.trim();
      if (this.index.has(name)) this.show(name);
      else { field.setCustomValidity('请选择可进出的地铁站'); field.reportValidity(); }
    };
    document.querySelector('#impactOrigin').oninput = e => e.target.setCustomValidity('');
  }

  setScenario(scenario) {
    this.scenario = scenario;
    this.stats = summarizeImpactOrigins(scenario,this.order);
    this.ranked = [...this.stats].sort((a, b) => b.rate - a.rate);
    this.show(this.active ? this.origin : null, false);
    if (this.active) this.frame(false);
  }

  activate(active) {
    this.active = active;
    document.querySelector('.analysis-grid').classList.toggle('atlas-open', active);
    this.panel.hidden = !active;
    document.querySelector('#atlasBar').hidden = !active;
    document.querySelector('#impactLegend').hidden = !active;
    this.syncLayer();
    if (active) this.frame(false);
  }

  frame(animate) {
    const blocked = this.map.byName.get(this.scenario.station);
    const anchor = this.map.byName.get(this.origin || this.ranked[0].name);
    const w = Math.max(395, Math.abs(anchor.x - blocked.x) + 145);
    const h = Math.max(260, Math.abs(anchor.y - blocked.y) + 120);
    this.map.fit([(anchor.x + blocked.x - w) / 2, (anchor.y + blocked.y - h) / 2, w, h], animate);
  }

  syncLayer() {
    const visible = document.querySelector('#impactSwitch').checked;
    this.map.scene.classed('atlas-view', !!this.active).classed('atlas-painted', !!this.active && visible);
    this.map.scene.selectAll('.station-group').each(function(s) {
      this.querySelector('title').textContent = this.closest('.atlas-painted') ? this.dataset.impactHint :
        s.name + ' · ' + s.lines.join('/') + '号线';
    });
    document.querySelector('#mapContainer').classList.toggle('atlas-map', !!this.active);
    document.querySelector('#impactLayerState').textContent = visible ? '显示影响' : '原图对照';
    document.querySelector('#impactLegend').style.opacity = visible ? '1' : '.45';
  }

  placeCallout() {
    if (!this.anchor || !this.map.transform) return;
    const {x,y} = this.map.byName.get(this.anchor.name);
    this.callout.attr('transform', 'translate(' + x + ',' + y + ') scale(' + 1 / this.map.transform.k + ')');
  }

  show(origin, refocus = true) {
    this.origin = origin || null;
    const row = this.origin && this.stats[this.index.get(this.origin)];
    this.anchor = row || this.ranked[0];
    const badgeWidth = Math.max(118, this.anchor.name.length * 12 + 67);
    this.callout.select('rect').attr('width',badgeWidth).attr('x',-35-badgeWidth);
    this.callout.select('text').attr('x',-35-badgeWidth/2)
      .text(this.anchor.name + ' · ' + (this.anchor.rate * 100).toFixed(1) + '%');
    this.placeCallout();
    document.querySelector('#impactOrigin').value = this.origin || '';
    document.querySelector('#impactOrigin').setCustomValidity('');
    document.querySelector('#impactBack').hidden = !row;
    document.querySelector('#stationPopup').hidden = true;
    document.querySelector('#atlasCaption').textContent = row ? '从' + origin + '出发 · 目的站变化' : '各站出发 · 受影响目的地占比';
    const values = new Map(this.stats.map((s, i) => [s.name, row ? row.row[i] : s.rate]));
    const marks = this.map.layout.stations.map(s => {
      const v = values.get(s.name);
      const bin = impactBin(v, !!row);
      return {...s, v, bin};
    });
    this.drawMap(marks, row);
    this.drawPanel(row);
    this.drawLegend(!!row);
    if (this.active) document.querySelector('#impactSwitch').checked = true;
    this.syncLayer();
    if (this.active && refocus) this.frame(true);
  }

  drawMap(marks, row) {
    const colors = impactPalette;
    const hot = marks.filter(s => s.bin !== 'neutral');
    // Smooth station-local fields on the schematic. Max prevents dense clusters
    // from manufacturing a higher apparent value than their strongest station.
    const xs = d3.extent(marks, s => s.x), ys = d3.extent(marks, s => s.y);
    const step = 5, pad = 45, x0 = xs[0] - pad, y0 = ys[0] - pad;
    const width = Math.ceil((xs[1] + pad - x0) / step) + 1;
    const height = Math.ceil((ys[1] + pad - y0) / step) + 1;
    const grid = new Float32Array(width * height);
    for (const s of hot) {
      if (s.bin === 'transfer' || s.bin === 'lost') continue;
      const strength = row ? Math.min(1, s.v / 6) : Math.min(1, s.v / 0.5);
      const cx = (s.x - x0) / step, cy = (s.y - y0) / step;
      const radius = 3 + strength * 5;
      for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, cy + radius); y++) {
        for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, cx + radius); x++) {
          const value = strength * (1 - ((x - cx) ** 2 + (y - cy) ** 2) / radius ** 2);
          grid[y * width + x] = Math.max(grid[y * width + x], value);
        }
      }
    }
    const contours = d3.contours().size([width, height]).thresholds([0.07, 0.23, 0.49, 0.76])(grid);
    const path = d3.geoPath(d3.geoIdentity().scale(step).translate([x0 - step / 2, y0 - step / 2]));
    this.wash.selectAll('path').data(contours).join('path').attr('d', path)
      .attr('fill', (_, i) => ['#fff1ce','#ffe2b3','#ffc8a4','#f9a78c'][i])
      .attr('stroke', (_, i) => ['#f4dfb1','#efcea0','#eeb499','#df9782'][i]).attr('stroke-width', .65);
    this.points.selectAll('circle').data(hot, s => s.name).join('circle')
      .attr('cx', s => s.x).attr('cy', s => s.y)
      .attr('r', s => s.bin === 'high' ? 5 : 3.8)
      .attr('fill', s => colors[s.bin]).attr('stroke', '#fff').attr('stroke-width', 1);
    const byName = new Map(marks.map(s => [s.name, s]));
    this.map.scene.selectAll('.station-group').each(function(s) {
      const mark = byName.get(s.name);
      const hit = mark.bin !== 'neutral';
      this.style.setProperty('--mark', hit ? colors[mark.bin] : '#9baaad');
      this.style.setProperty('--tint', hit ? d3.interpolateRgb('#fff', colors[mark.bin])(.22) : '#fff');
      const hint = mark.v === undefined ? '仅用于换乘' : row ? impactDescription(mark.v) :
        '受影响目的地占比 ' + (100 * mark.v).toFixed(1) + '%';
      this.dataset.impactHint = s.name + ' · ' + hint;
    });
    const blocked = this.map.byName.get(this.scenario.station);
    const badges = [{s:blocked, label:'×', color:'#943341', offset:1}];
    if (row) badges.push({s:this.map.byName.get(row.name), label:'O', color:colors.origin, offset:-1});
    const badge = this.flag.selectAll('g').data(badges).join('g')
      .attr('transform', d => 'translate(' + (d.s.x + d.offset * 7) + ',' + (d.s.y - 8) + ')');
    badge.selectAll('circle').data(d => [d]).join('circle').attr('r', 6.2).attr('fill', d => d.color)
      .attr('stroke', 'white').attr('stroke-width', 1.3);
    badge.selectAll('text').data(d => [d]).join('text').attr('text-anchor', 'middle').attr('y', 2.7)
      .attr('font-size', 9).attr('font-weight', 700).attr('fill','white').text(d => d.label);
  }

  drawPanel(row) {
    const target = row || this.ranked[0];
    document.querySelector('#atlasTitle').textContent = target.name + '出发';
    document.querySelector('#atlasKicker').textContent = row ? '当前选定起点' : '受影响比例最高的起点';
    document.querySelector('#atlasStat').textContent = target.count;
    document.querySelector('#atlasDen').textContent = '/ ' + target.comparable;
    document.querySelector('#atlasSub').textContent = '受影响目的站 / 可比较目的站';
    document.querySelector('#atlasBreakdown').textContent =
      target.detour + ' 个需多坐区段 · ' + target.transfer + ' 个仅多换乘' + (target.lost ? ' · ' + target.lost + ' 个不可达' : '');
    document.querySelector('#atlasGuide').textContent = row ?
      '现在每个点代表一个目的站。橙红色表示从当前起点出发需要多坐区段，青色表示区段数相同但需要多换乘。' :
      '每个点代表一个起点。颜色越深，从这里出发时需要多坐区段或多换乘的目的地占比越高。点击上方排行可查看目的站。';
    document.querySelector('#rankTitle').textContent = row ? '目的站变化' : '受影响比例最高的起点';
    const items = row ? this.order.map((name, i) => ({name, v:row.row[i]}))
      .filter(s => s.v > 0 || s.v === -2 || s.v === -1)
      .sort((a,b) => (b.v === -1 ? Infinity : b.v) - (a.v === -1 ? Infinity : a.v))
      .slice(0,5) : this.ranked.slice(0,5);
    const list = document.querySelector('#atlasRanks');
    list.replaceChildren();
    if (!items.length) list.textContent = '全部可比较目的地的最优代价保持不变。';
    items.forEach((item,i) => {
      const button = document.createElement('button');
      const rate = row ? null : (100 * item.rate).toFixed(1) + '%';
      const bin = impactBin(row ? item.v : item.rate, !!row);
      button.style.setProperty('--rank-color', impactPalette[bin]);
      button.style.setProperty('--rank-width', row ? '0%' : rate);
      button.innerHTML = '<span class="rank-no">' + String(i + 1).padStart(2,'0') +
        '</span><strong></strong><span class="rank-value"></span><span aria-hidden="true">↗</span>';
      button.querySelector('strong').textContent = item.name;
      button.querySelector('.rank-value').textContent = row ? impactDescription(item.v) : rate;
      button.onclick = () => row ? this.onRoute(row.name,item.name) : this.show(item.name);
      list.append(button);
    });
  }

  drawLegend(detail) {
    const entries = detail ? [['neutral','代价不变'],['transfer','仅多换乘'],['low','+1–2 区段'],['mid','+3–4'],['high','+5 及以上']] :
      [['neutral','0%'],['low','0% < 占比 < 10%'],['mid','10% ≤ 占比 < 30%'],['high','≥30%']];
    if (detail && this.scenario.counts.unreachable) entries.push(['lost','不可达']);
    document.querySelector('#impactLegend').innerHTML = entries.map(([key,label]) =>
      '<span><i style="background:' + impactPalette[key] + '"></i>' + label + '</span>').join('') +
      '<span class="legend-block">× 换乘受限</span>';
  }
}

function impactDescription(v) {
  if (v > 0) return '+' + v + ' 区段';
  if (v === -2) return '仅多换乘';
  if (v === -1) return '不可达';
  if (v === -3) return '当前起点';
  return v === -4 ? '基线不可达' : '代价不变';
}
