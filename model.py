"""Line-state routing. Costs are (operating-stop intervals, transfers), not minutes."""
from collections import defaultdict
from heapq import heappop, heappush


class Network:
    def __init__(self, rides, transfers):
        self.adj = defaultdict(list)
        self.at = defaultdict(set)
        for e in rides + transfers:
            a, b = (e['a'], e['la']), (e['b'], e['lb'])
            cost = (1, 0) if e['kind'] == 'ride' else (0, 1)
            for u, v in [(a, b), (b, a)]:
                self.adj[u].append((v, cost, e['kind']))
                self.at[u[0]].add(u)

    def shortest(self, origin, blocked=None):
        dist, prev, heap = {}, {}, []
        for s in sorted(self.at[origin]):
            dist[s] = (0, 0)
            heappush(heap, (0, 0, s))
        while heap:
            r, t, u = heappop(heap)
            if dist[u] != (r, t):
                continue
            for v, cost, kind in self.adj[u]:
                if kind == 'internal' and u[0] == blocked:
                    continue
                candidate = (r + cost[0], t + cost[1])
                if v not in dist or candidate < dist[v]:
                    dist[v], prev[v] = candidate, u
                    heappush(heap, (*candidate, v))
        best = {name: min(((dist[s], s) for s in states if s in dist), default=None)
                for name, states in self.at.items()}
        return best, prev

    def path(self, origin, destination, blocked=None):
        best, prev = self.shortest(origin, blocked)
        hit = best.get(destination)
        if hit is None:
            return {'cost': None, 'states': []}
        cost, state = hit
        states = [state]
        while state in prev:
            state = prev[state]
            states.append(state)
        return {'cost': list(cost), 'states': list(reversed(states))}


def category(before, after):
    if before is None:
        return 'excluded'
    if after is None:
        return 'unreachable'
    if after < before:
        raise ValueError('Removing transfer edges cannot improve the optimum')
    if after[0] > before[0]:
        return 'more_stops'
    if after[1] > before[1]:
        return 'more_transfers'
    return 'unchanged'
