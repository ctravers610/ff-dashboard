import json
import time
import urllib.request
from urllib.error import HTTPError, URLError

RETRY_STATUSES = {429, 500, 502, 503, 504}
ATTEMPTS = 4


class Sleeper:
    """Sleeper's public API (https://docs.sleeper.com). No sign-in needed."""

    # Sleeper asks clients to stay under 1,000 calls a minute; this keeps to 600.
    def __init__(self, base_url: str, min_interval: float = 0.1, urlopen=urllib.request.urlopen, sleep=time.sleep):
        self.base_url = base_url.rstrip('/')
        self.min_interval = min_interval
        self.calls = 0
        self._urlopen = urlopen
        self._sleep = sleep
        self._last = 0.0

    def get(self, path: str):
        """The decoded JSON at path, or None when Sleeper has nothing there (404)."""
        for attempt in range(ATTEMPTS):
            wait = self._last + self.min_interval - time.monotonic()
            if wait > 0:
                self._sleep(wait)
            self._last = time.monotonic()
            self.calls += 1

            request = urllib.request.Request(
                self.base_url + path,
                headers={'Accept': 'application/json', 'User-Agent': 'ffd-analytics-loader'},
            )
            last_try = attempt == ATTEMPTS - 1
            try:
                with self._urlopen(request, timeout=60) as res:
                    return json.load(res)
            except HTTPError as e:
                if e.code == 404:
                    return None
                if e.code not in RETRY_STATUSES or last_try:
                    raise RuntimeError(f'Sleeper {path} returned HTTP {e.code}') from e
            except URLError as e:
                if last_try:
                    raise RuntimeError(f'Could not reach Sleeper for {path}: {e.reason}') from e
            self._sleep(2**attempt)  # 1s, 2s, 4s
