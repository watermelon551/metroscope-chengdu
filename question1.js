const scenarios = window.METRO_DATA.scenarios;
const picker = document.querySelector('#station');
const whole = document.querySelector('#whole');
const categoryNames = {unchanged:'代价不变',more_transfers:'仅增加换乘',more_stops:'增加乘车区段',unreachable:'不可达'};
for (const s of scenarios) picker.add(new Option(s.station,s.station));
const chart = new ScenarioStack(document.querySelector('#chart'),(station,category) => {
  picker.value = station;
  render(category);
});
function render(category) {
  const s = scenarios.find(row => row.station === picker.value);
  const scenarioLink = document.querySelector('#openScenario');
  scenarioLink.href = 'index.html?' + new URLSearchParams({scenario:s.station});
  scenarioLink.textContent = '在线网中查看' + s.station + '情景 →';
  chart.update(scenarios,s.station,whole.checked);
  chart.chart.setOption({grid:{left:102,right:53},legend:{textStyle:{fontSize:13}},xAxis:{axisLabel:{fontSize:12}},yAxis:{axisLabel:{fontSize:13}},series: chart.keys.map(()=>({barWidth:22}))});
  const total = chart.total(s), affected = chart.affected(s);
  document.querySelector('#summary').textContent = s.station+'受限 · '+affected.toLocaleString()+' 对受影响，占 '+(100*affected/total).toFixed(2)+'%';
  document.querySelector('#breakdown').textContent = category ? categoryNames[category]+'：'+s.counts[category].toLocaleString()+' 对，占全部组合的 '+(100*s.counts[category]/total).toFixed(2)+'%。' :
    Object.entries(categoryNames).map(([k,v])=>v+' '+s.counts[k].toLocaleString()+' 对').join('　');
}
whole.onchange = () => render();
picker.onchange = () => render();
new ResizeObserver(()=>chart.resize()).observe(document.querySelector('#chart'));
const initialStation = new URLSearchParams(location.search).get('scenario');
if (scenarios.some(s => s.station === initialStation)) picker.value = initialStation;
render();
