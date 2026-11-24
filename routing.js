/* Original line-state routing implementation. Browser counterpart of model.py. */
window.MetroRouting=class{
 constructor(data){this.data=data;this.adj=new Map();this.at=new Map();for(const e of [...data.rides,...data.transfers]){const a=e.a+'|'+e.la,b=e.b+'|'+e.lb;for(const[u,v,n]of[[a,b,e.a],[b,a,e.b]]){if(!this.adj.has(u))this.adj.set(u,[]);this.adj.get(u).push({v,kind:e.kind,name:n,cost:e.kind==='ride'?[1,0]:[0,1]});if(!this.at.has(n))this.at.set(n,new Set());this.at.get(n).add(u)}}}
 search(origin, blocked, destination = null) {
   const costs = new Map(), previous = new Map(), settled = new Set(), firstAt = new Map();
   const less = (a,b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
   for (const state of this.at.get(origin) || []) costs.set(state,[0,0]);
   while (true) {
     let state = null, best = null;
     for (const [candidate,cost] of costs) {
       if (!settled.has(candidate) && less(cost,best)) { state = candidate; best = cost; }
     }
     if (state === null) break;
     settled.add(state);
     const name = state.split('|')[0];
     if (!firstAt.has(name)) firstAt.set(name,state);
     if (name === destination) break;
     for (const edge of this.adj.get(state)) {
       if (edge.kind === 'internal' && edge.name === blocked) continue;
       const cost = [best[0] + edge.cost[0], best[1] + edge.cost[1]];
       if (less(cost,costs.get(edge.v))) {
         costs.set(edge.v,cost);
         previous.set(edge.v,state);
       }
     }
   }
   return {costs,previous,firstAt};
 }
 rangeFrom(origin, blocked = null) {
   const {costs,firstAt} = this.search(origin,blocked);
   const intervals = new Map(Array.from(firstAt, ([name,state]) => [name,costs.get(state)[0]]));
   // One more ride must fit after reaching either end on this specific line.
   const rides = this.data.rides.map(({a,b,la,lb}) =>
     1 + Math.min(costs.get(a+'|'+la)?.[0] ?? Infinity,costs.get(b+'|'+lb)?.[0] ?? Infinity));
   return {intervals,rides};
 }
 route(origin,destination,blocked = null) {
   const {costs,previous,firstAt} = this.search(origin,blocked,destination);
   const end = firstAt.get(destination);
   if (!end) return {cost:null,states:[]};
   const states = [];
   for (let state = end; state; state = previous.get(state)) {
     const [name,line] = state.split('|');
     states.push([name,Number(line)]);
   }
   return {cost:costs.get(end),states:states.reverse()};
 }
};
