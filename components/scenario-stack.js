/* Percentages use the same OD denominator in both the standalone and linked views. */
window.ScenarioStack = class {
  constructor(element, onSelect) {
    this.chart = echarts.init(element, null, {renderer:'canvas'});
    this.labels = {unchanged:'代价不变',more_transfers:'仅换乘增加',more_stops:'区段增加',unreachable:'不可达'};
    this.colors = {unchanged:'#e6ebf2',more_transfers:'#428eaa',more_stops:'#e69463',unreachable:'#9b85b9'};
    this.chart.on('click', p => {
      if (p.componentType === 'series') onSelect(this.rows[p.dataIndex].station,this.keys[p.seriesIndex]);
    });
    this.chart.on('legendselectchanged', e => this.chart.setOption({series:this.highlightedSeries(e.selected)}));
    this.resize = () => this.chart.resize();
  }

  labelledSeries(visible = {}) {
    const enabled = this.keys.filter(k => visible[this.labels[k]] !== false);
    const ends = this.rows.map(s => enabled.filter(k => s.counts[k] > 0).at(-1));
    const totals = this.rows.map(s => enabled.reduce((n,k) => n + s.counts[k],0) / this.total(s) * 100);
    return this.keys.map(key => ({
      name:this.labels[key], type:'bar', stack:'same-denominator',barMaxWidth:22,
      emphasis:{itemStyle:{borderColor:'#234b49',borderWidth:1}}, itemStyle:{color:this.colors[key]},
      label:{show:true,position:'right',distance:6,fontSize:12,color:'#415d7a',
        formatter:p => ends[p.dataIndex] === key ? totals[p.dataIndex].toFixed(2).replace('.00','')+'%' : ''},
      data:this.rows.map(s => 100*s.counts[key]/this.total(s))
    }));
  }

  update(rows, selected, includeUnchanged=false) {
    this.rows=[...rows].sort((a,b)=>this.affected(b)-this.affected(a));
    this.selected = selected;
    this.renderFocus(this.rows.find(row => row.station === selected));
    this.keys=includeUnchanged ? ['unchanged','more_transfers','more_stops','unreachable'] : ['more_transfers','more_stops','unreachable'];
    this.chart.setOption({
      animationDuration:300,textStyle:{fontFamily:'Microsoft YaHei'},
      grid:{left:102,right:50,top:16,bottom:62},
      legend:{bottom:4,itemWidth:11,itemHeight:9,itemGap:12,textStyle:{fontSize:11,color:'#75879b'},data:this.keys.map(k=>this.labels[k])},
      tooltip:{trigger:'axis',axisPointer:{type:'shadow',shadowStyle:{color:'#154b4509'}},confine:true,
        backgroundColor:'#fff',borderColor:'#d2dbd5',textStyle:{fontSize:12,color:'#294945'},
        formatter:items=>{
          const s=this.rows[items[0].dataIndex];
          return '<b>'+s.station+'暂停站内换乘</b><br>'+items.map(p=>p.marker+p.seriesName+'　'+s.counts[this.keys[p.seriesIndex]].toLocaleString()+' 对 · '+p.value.toFixed(2)+'%').join('<br>');
        }},
      xAxis:{type:'value',max:includeUnchanged?100:null,splitNumber:4,axisLabel:{fontSize:11,color:'#8796a9',formatter:'{value}%'},
        splitLine:{lineStyle:{color:'#e7edf4',type:'dashed'}},axisLine:{show:false}},
      yAxis:{type:'category',inverse:true,data:this.rows.map(s=>s.station),axisTick:{show:false},axisLine:{show:false},
        axisLabel:{fontSize:12,margin:10,formatter:n=>n===selected?'{chosen|● '+n+'}':n,color:'#62758d',rich:{chosen:{color:'#173f59',fontWeight:'bold',fontSize:13}}}},
      series:this.highlightedSeries()
    },true);
  }

  highlightedSeries(visible) {
    return this.labelledSeries(visible).map(series => ({
      ...series,
      data:series.data.map((value,i) => ({
        value, itemStyle:{opacity:this.rows[i].station === this.selected ? 1 : .56}
      }))
    }));
  }

  renderFocus(row) {
    const panel = document.querySelector('[data-stack-focus="'+this.chart.getDom().id+'"]');
    if (!panel || !row) return;
    const affected = this.affected(row);
    const total = this.total(row);
    const keys = ['more_stops','more_transfers','unreachable'];
    const entries = keys.filter(k => row.counts[k] > 0);
    const number = n => n.toLocaleString('zh-CN');
    const pct = (n,d,digits) => d ? (100*n/d).toFixed(digits)+'%' : '—';
    const node = (tag,cls,text) => {
      const el = document.createElement(tag);
      el.className = cls;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const head = node('div','sf-heading');
    head.append(node('strong','sf-name',row.station+'站内换乘受限'),
      node('span','sf-total',number(affected)+' 对受影响 · 占全网 '+pct(affected,total,2)));
    const title=node('p','sf-caption',affected?'这 '+number(affected)+' 对受影响行程中':'当前情景没有受影响行程');
    const bar=node('div','sf-bar');
    bar.setAttribute('aria-hidden','true');
    const legend=node('div','sf-legend');
    for (const key of entries) {
      const count=row.counts[key];
      const segment=node('span','sf-segment');
      segment.style.width=(100*count/affected)+'%';
      segment.style.backgroundColor=this.colors[key];
      bar.append(segment);
      const label=node('span','sf-item');
      const swatch=node('i','sf-swatch');
      swatch.style.backgroundColor=this.colors[key];
      label.append(swatch,node('span','',this.labels[key]+' '+number(count)+' 对'),
        node('b','',pct(count,affected,1)));
      legend.append(label);
    }
    panel.replaceChildren(head,title,bar,legend);
  }

  total(s){return ['unchanged','more_transfers','more_stops','unreachable'].reduce((n,k)=>n+s.counts[k],0);}
  affected(s){return this.total(s)-s.counts.unchanged;}
  dispose(){this.chart.dispose();}
};
