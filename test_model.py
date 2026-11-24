import unittest
from model import Network, category


def ride(a, b, line):
    return dict(a=a, b=b, la=line, lb=line, kind='ride')


def change(station, a, b, kind='internal', destination=None):
    return dict(a=station, b=destination or station, la=a, lb=b, kind=kind)


class RoutingTests(unittest.TestCase):
    def test_disabled_transfer_keeps_train_running_and_endpoint_access(self):
        n = Network([ride('A','X','1'), ride('X','B','1'), ride('C','X','2')],
                    [change('X','1','2')])
        self.assertEqual(n.path('A','B','X')['cost'], [2,0])
        self.assertEqual(n.path('X','C','X')['cost'], [1,0])
        self.assertEqual(n.path('A','C')['cost'], [2,1])
        self.assertIsNone(n.path('A','C','X')['cost'])

    def test_reroute_can_revisit_a_station_on_another_line(self):
        n = Network([ride('A','X','1'), ride('X','Y','1'), ride('Y','X','2'), ride('X','B','2')],
                    [change('X','1','2'), change('Y','1','2')])
        self.assertEqual(n.path('A','B')['cost'], [2,1])
        self.assertEqual(n.path('A','B','X')['cost'], [4,1])

    def test_lexicographic_not_arbitrary_transfer_penalty(self):
        n = Network([ride('A','B','1'),ride('B','C','1'),ride('C','D','1'),
                     ride('A','X','2'),ride('X','D','3')], [change('X','2','3')])
        self.assertEqual(n.path('A','D')['cost'], [2,1])

    def test_equal_stops_fewer_transfers(self):
        n = Network([ride('A','B','1'),ride('B','D','1'),ride('A','X','2'),ride('X','D','3')],
                    [change('X','2','3')])
        self.assertEqual(n.path('A','D')['cost'], [2,0])

    def test_external_transfer_survives_internal_restriction(self):
        n = Network([ride('A','X','1'),ride('Y','B','2')],
                    [change('X','1','2','external','Y')])
        self.assertEqual(n.path('A','B','X')['cost'], [2,1])

    def test_ring_and_branch(self):
        n = Network([ride('A','B','1'),ride('B','C','1'),ride('C','A','1'),ride('B','D','1')], [])
        self.assertEqual(n.path('A','C')['cost'], [1,0])
        self.assertEqual(n.path('C','D')['cost'], [2,0])

    def test_categories_and_monotonicity(self):
        self.assertEqual(category((2,1),(2,1)), 'unchanged')
        self.assertEqual(category((2,1),(2,2)), 'more_transfers')
        self.assertEqual(category((2,2),(3,0)), 'more_stops')
        self.assertEqual(category((2,1),None), 'unreachable')
        self.assertEqual(category(None,None), 'excluded')
        with self.assertRaises(ValueError): category((2,1),(1,9))


if __name__ == '__main__':
    unittest.main()
