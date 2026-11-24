/* Replay one routing edge at a time, in the order returned by the solver. */
class RouteReplay {
  constructor(map) {
    this.map = map;
    this.layer = map.scene.insert('g', '.station-layer').attr('class', 'replay-traces');
    this.cursor = map.scene.append('g').attr('class', 'replay-cursor');
    this.cursor.append('circle').attr('r', 8).attr('fill-opacity', .2);
    this.cursor.append('circle').attr('r', 4).attr('stroke','white').attr('stroke-width',1.6);
    this.slider = document.querySelector('#replayPosition');
    this.slider.oninput = () => this.seek(Number(this.slider.value));
    document.querySelector('#replayPlay').onclick = () => this.playing ? this.pause() : this.play();
    document.querySelector('#replayEnd').onclick = () => this.seek(this.steps.length);
    document.querySelector('#replayReset').onclick = () => this.seek(0);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
    this.active = false;
    this.position = 0;
  }

  activate(active) {
    this.pause();
    this.active = active;
    document.querySelector('.analysis-grid').classList.toggle('replay-open', active);
    this.map.scene.classed('replay-view', active);
    for (const id of ['replayBar','replayPanel','replayControls']) document.getElementById(id).hidden = !active;
    if (active) this.load();
  }

  load() {
    this.pause();
    const {map} = this, {selection,blocked} = map;
    this.layer.selectAll('*').remove();
    this.steps = [];
    this.parts = [];
    const addJourney = (phase, route) => {
      let rides = 0, transfers = 0;
      for (let i = 1; i < route.states.length; i++) {
        const from = route.states[i-1], to = route.states[i];
        const transfer = from[1] !== to[1];
        const external = transfer && from[0] !== to[0];
        const step = {
          phase, from, to, rides, transfers, transfer, external,
          title: transfer ? (external ? '站外换乘' : '站内换乘') : '乘坐 ' + to[1] + ' 号线',
          note: transfer ? from[0] + (external ? ' → ' + to[0] : '') + ' · ' + from[1] + ' 号线换 ' + to[1] + ' 号线' :
            from[0] + ' → ' + to[0],
          parts: []
        };
        const paths = map.pathSegments({states:[from,to]});
        let last = map.byName.get(from[0]), length = 0;
        for (const d of paths) {
          const node = this.layer.append('path').attr('d',d).attr('class','replay-track ' + phase).node();
          const size = node.getTotalLength(), start = node.getPointAtLength(0), end = node.getPointAtLength(size);
          const reverse = Math.hypot(start.x-last.x,start.y-last.y) > Math.hypot(end.x-last.x,end.y-last.y);
          const part = {node, size, reverse, offset:length, step:this.steps.length};
          step.parts.push(part);
          this.parts.push(part);
          last = reverse ? start : end;
          length += size;
        }
        step.length = length;
        if (transfer) transfers++; else rides++;
        this.steps.push(step);
      }
    };
    addJourney('before',selection.before);
    this.cut = this.steps.length;
    const usedTransfer = this.steps.some(s => s.transfer && !s.external && s.from[0] === blocked);
    this.steps.push({phase:'restriction', title:blocked + '暂停站内换乘',
      note:usedTransfer ? '原路径需要在这里换线，下面从同一起点重新出发。' : '这条基线路径无须在本站换线，下面对照受限后路径。'});
    addJourney('after',selection.after);
    this.slider.max = this.steps.length;
    document.querySelector('#replayOD').textContent = selection.a + ' → ' + selection.b;
    document.querySelector('#replayBlocked').textContent = blocked + '换乘受限';
    for (const phase of ['before','after']) {
      const route = selection[phase], list = document.querySelector('#' + phase + 'Transfers');
      const changes = this.steps.filter(s => s.phase === phase && s.transfer);
      list.replaceChildren();
      if (!route.cost || !changes.length) list.textContent = route.cost ? '直达，无需换乘' : '目的站不可达';
      for (const change of changes) {
        const li = document.createElement('li');
        const sequence = document.createElement('b');
        sequence.textContent = change.from[1] + ' → ' + change.to[1];
        li.append(sequence, change.from[0] + (change.external ? ' → ' + change.to[0] + '（站外）' : ''));
        list.append(li);
      }
    }
    const extent = [map.byName.get(blocked), ...selection.before.states.concat(selection.after.states).map(([n])=>map.byName.get(n))];
    const [left,right] = d3.extent(extent, p => p.x), [top,bottom] = d3.extent(extent, p => p.y);
    map.fit([left - 48, top - 18, right - left + 96, bottom - top + 36],false);
    this.seek(0);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.animation);
    this.updateButton();
  }

  seek(position) {
    this.pause();
    this.position = position;
    this.lastStep = null;
    this.render();
  }

  play(until = this.steps.length) {
    if (!this.active) return;
    if (this.position >= this.steps.length) this.seek(0);
    this.playing = true;
    this.updateButton();
    let previous = performance.now();
    const tick = now => {
      const step = this.steps[Math.floor(this.position)];
      const duration = step.phase === 'restriction' ? 1650 : step.transfer ? 1000 : 820;
      this.position = Math.min(until, this.position + Math.max(0, now - previous) / duration);
      previous = now;
      this.render();
      if (this.position >= until) this.pause();
      else this.animation = requestAnimationFrame(tick);
    };
    this.animation = requestAnimationFrame(tick);
  }

  updateButton() {
    document.querySelector('#replayPlay').textContent = this.playing ? 'Ⅱ　暂停' :
      this.position >= (this.steps?.length ?? Infinity) ? '↺　重播' : this.position > 0 ? '▶　继续' : '▶　播放';
  }

  render() {
    const index = Math.floor(this.position), steps = this.steps;
    const progress = this.position - index;
    const done = index === steps.length, step = steps[index];
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const distance = (step?.length || 0) * (reduced ? 0 : progress);
    const updated = index === this.lastStep ? (step?.parts || []) : this.parts;
    for (const part of updated) {
      const amount = part.step < index ? part.size : part.step === index ? Math.max(0,Math.min(part.size,distance-part.offset)) : 0;
      part.node.style.display = amount ? '' : 'none';
      part.node.setAttribute('stroke-dasharray', part.size + ' ' + part.size);
      part.node.setAttribute('stroke-dashoffset',(part.reverse ? -1 : 1) * (part.size - amount));
    }
    let point;
    if (done) point = this.map.byName.get(this.map.selection.b);
    else if (step.phase === 'restriction') point = this.map.byName.get(this.map.blocked);
    else {
      const part = step.parts.find(p => distance <= p.offset + p.size);
      point = part ? part.node.getPointAtLength(part.reverse ? part.size - distance + part.offset : distance - part.offset) :
        this.map.byName.get(step.to[0]);
    }
    this.cursor.attr('transform','translate(' + point.x + ',' + point.y + ')')
      .attr('fill', done || step.phase === 'after' ? '#d7622b' : step.phase === 'restriction' ? '#a63545' : '#176d79');
    this.onFrame?.(step,point,reduced ? 0 : progress);
    if (index === this.lastStep) return;
    this.lastStep = index;
    const {selection} = this.map;
    const phase = done ? 'result' : step.phase;
    const before = index >= this.cut ? selection.before.cost : [step.rides,step.transfers];
    const after = done ? selection.after.cost : phase === 'after' ? [step.rides,step.transfers] : [0,0];
    const format = cost => cost ? cost[0] + ' 区段 · ' + cost[1] + ' 换乘' : '不可达';
    document.querySelector('#beforeCost').textContent = format(before);
    document.querySelector('#afterCost').textContent = format(after);
    const maxRides = Math.max(1,selection.before.cost?.[0] || 0,selection.after.cost?.[0] || 0);
    for (const [id,cost] of [['beforeBar',before],['afterBar',after]]) {
      document.getElementById(id).style.width = (cost?.[0] || 0) / maxRides * 100 + '%';
    }
    const delta = selection.after.cost && selection.before.cost && selection.after.cost.map((v,i)=>v-selection.before.cost[i]);
    const signed = v => (v >= 0 ? '+' : '') + v;
    document.querySelector('#replayEvent').textContent = done ? '两条路径对比完成' : step.title;
    document.querySelector('#replayNote').textContent = done ? delta ?
      '相较基线，乘车区段 ' + signed(delta[0]) + '，跨线换乘 ' + signed(delta[1]) + '。' : '两次计算的可达状态不同。' : step.note;
    document.querySelector('#replayPhase').textContent = {before:'01 / 原路径',restriction:'02 / 换乘受限',after:'03 / 替代路径',result:'04 / 对比结果'}[phase];
    document.querySelector('#replayPanel').dataset.phase = phase;
    this.map.scene.classed('replay-baseline',phase === 'before');
    this.slider.value = index;
    this.slider.setAttribute('aria-valuetext', document.querySelector('#replayPhase').textContent + '，' + document.querySelector('#replayEvent').textContent);
    this.updateButton();
  }
}
