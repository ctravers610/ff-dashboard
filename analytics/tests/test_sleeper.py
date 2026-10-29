import io
import json
from urllib.error import HTTPError, URLError

import pytest

from loader.sleeper import Sleeper


def fake_urlopen(*outcomes):
    """Each call takes the next outcome: an int is an HTTP error, an exception is raised, else the JSON body."""
    requests = []

    def urlopen(request, timeout):
        requests.append(request.full_url)
        outcome = outcomes[len(requests) - 1]
        if isinstance(outcome, int):
            raise HTTPError(request.full_url, outcome, 'error', {}, None)
        if isinstance(outcome, Exception):
            raise outcome
        return io.BytesIO(json.dumps(outcome).encode())

    return urlopen, requests


def client(urlopen, sleeps=None):
    return Sleeper('https://sleeper.test/v1/', min_interval=0, urlopen=urlopen, sleep=(sleeps if sleeps is not None else []).append)


def test_returns_the_decoded_json():
    urlopen, requests = fake_urlopen({'week': 8})
    api = client(urlopen)
    assert api.get('/state/nfl') == {'week': 8}
    assert requests == ['https://sleeper.test/v1/state/nfl']
    assert api.calls == 1


def test_nothing_there_is_none():
    urlopen, _ = fake_urlopen(404)
    assert client(urlopen).get('/league/0/rosters') is None


def test_rate_limits_and_server_errors_are_retried_with_backoff():
    urlopen, requests = fake_urlopen(429, 503, URLError('reset'), [1, 2])
    sleeps = []
    assert client(urlopen, sleeps).get('/players/nfl') == [1, 2]
    assert len(requests) == 4
    assert sleeps == [1, 2, 4]


def test_gives_up_after_four_tries():
    urlopen, _ = fake_urlopen(500, 500, 500, 500)
    with pytest.raises(RuntimeError, match='returned HTTP 500'):
        client(urlopen).get('/state/nfl')


def test_other_errors_are_not_retried():
    urlopen, requests = fake_urlopen(400)
    with pytest.raises(RuntimeError, match='HTTP 400'):
        client(urlopen).get('/user/x')
    assert len(requests) == 1


def test_calls_are_spaced_out():
    urlopen, _ = fake_urlopen({}, {})
    sleeps = []
    api = Sleeper('https://sleeper.test/v1', min_interval=5, urlopen=urlopen, sleep=sleeps.append)
    api.get('/a')
    api.get('/b')
    assert len(sleeps) == 1 and 4 < sleeps[0] <= 5
