/* Keep the two paths on one ride-interval axis. Transfers never advance the ruler. */
class PeakJourney {
  constructor(order, router, onReplay) {
    this.order = order;
    this.router = router;
    this.choice = document.querySelector('#journeyDestination');
    this.chart = d3.select('#journeyChart');
    this.choice.onchange = () => this.draw();
    document.querySelector('#journeyReplay').onclick = () => onReplay(this.origin, this.choice.value);
  }

  setOrigin(stat, scenario) {
    const previous = this.origin === stat.name ? this.choice.value : null;
    this.origin = stat.name;
    this.blocked = scenario.station;
    this.choice.replaceChildren();
    const groups = new Map();
    const kind = code => code > 0 ? '乘车区段增加' : code === -2 ? '仅换乘增加' : code === -1 ? '不可达' : '代价相同';
    const entries = this.order.map((name, i) => ({name, code: stat.row[i]}))
      .filter(item => item.code >= -2 && item.name !== stat.name)
      .sort((a, b) => Number(b.code !== 0) - Number(a.code !== 0) || b.code - a.code);
    for (const {name, code} of entries) {
      const label = kind(code);
      if (!groups.has(label)) {
        const group = document.createElement('optgroup');
        group.label = label;
        groups.set(label, group);
        this.choice.add(group);
      }
      groups.get(label).append(new Option(code > 0 ? name + '　+' + code + ' 段' : name, name));
    }
    const example = scenario.example;
    const preferred = previous || (example.a === stat.name ? example.b : null);
    if (entries.some(item => item.name === preferred)) this.choice.value = preferred;
    this.draw();
  }

  draw() {
    const dest = this.choice.value;
    const before = this.router.route(this.origin, dest);
    const after = this.router.route(this.origin, dest, this.blocked);
    const delta = (v, unit, unchanged) => v === 0 ? unchanged : (v > 0 ? '多' : '少') + Math.abs(v) + unit;
    const verdict = after.cost && before.cost
      ? delta(after.cost[0] - before.cost[0], '个区段', '区段数不变') + '，' +
        delta(after.cost[1] - before.cost[1], '次换乘', '换乘数不变')
      : '受限后不可达';
    document.querySelector('#journeyTitle').textContent = this.origin + ' → ' + dest;
    document.querySelector('#journeyDelta').textContent = this.blocked + '暂停站内换乘后，' + verdict;
    const max = Math.max(1, before.cost?.[0] || 0, after.cost?.[0] || 0);
    const longest = Math.max(0, ...before.states.concat(after.states).map(([name]) => name.length));
    const left = 116, width = Math.max(680, left + max * Math.max(72,longest * 11 + 8) + 66);
    const x = i => left + i * (width - left - 66) / max;
    this.chart.selectAll('*').remove();
    this.chart.attr('viewBox', '0 0 ' + width + ' 197').style('min-width', width * .93 + 'px')
      .attr('aria-label', this.origin + '至' + dest + '，' + verdict);
    const text = (xPos, y, content, size, fill, anchor = 'middle') => this.chart.append('text')
      .attr('x', xPos).attr('y', y).attr('text-anchor', anchor)
      .attr('font-size', size).attr('fill', fill).text(content);
    text(8, 14, '乘车区段数', 10, '#aec6ca', 'start');
    for (let i = 0; i <= max; i++) {
      this.chart.append('path').attr('d', 'M' + x(i) + ',21v152').attr('stroke', '#304d58');
      text(x(i), 14, i, 10, '#aec6ca');
    }
    for (const [route, y, color, label] of [[before,62,'#8ad9ce','正常换乘'],[after,147,'#ffaf79','受限后']]) {
      text(8, y, label, 14, color, 'start').attr('font-weight', 700);
      text(8, y + 19, route.cost ? route.cost[0] + ' 段 · ' + route.cost[1] + ' 次换乘' : '不可达', 11, '#c1d2d3','start');
      if (!route.cost) continue;
      const stops = [{names:[route.states[0][0]]}];
      let lastRideLine = null;
      for (let i = 1; i < route.states.length; i++) {
        const [name, line] = route.states[i], [from, fromLine] = route.states[i-1];
        if (line !== fromLine) {
          const stop = stops.at(-1);
          stop.transfer = true;
          if (from !== name) stop.names.push(name);
          continue;
        }
        const n = stops.length;
        if (line !== lastRideLine) text((x(n-1)+x(n))/2, y-13, line+'号线', 10, color);
        lastRideLine = line;
        stops.push({names:[name]});
      }
      this.chart.append('path').attr('d','M'+x(0)+','+y+'H'+x(stops.length-1)).attr('stroke',color).attr('stroke-width',3);
      stops.forEach((stop,i) => {
        this.chart.append('circle').attr('cx',x(i)).attr('cy',y).attr('r',stop.transfer ? 6 : 3.8)
          .attr('fill','#142e3a').attr('stroke',color).attr('stroke-width',2);
        if (stop.transfer) this.chart.append('circle').attr('cx',x(i)).attr('cy',y).attr('r',2).attr('fill',color);
        stop.names.forEach((name,j) => text(x(i),y+22+j*14,name,11,'#f1f5ef').attr('font-weight',stop.transfer ? 700 : 400));
      });
    }
    this.chart.node().parentElement.scrollLeft = 0;
  }
}
