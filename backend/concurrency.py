"""Process-local keyed locks: identical work waits; unrelated locations can proceed."""
from contextlib import contextmanager
from threading import Lock


class KeyedLocks:
    def __init__(self):
        self.guard = Lock()
        self.entries = {}

    @contextmanager
    def hold(self, key):
        with self.guard:
            lock, users = self.entries.get(key, (Lock(), 0))
            self.entries[key] = (lock, users + 1)
        try:
            with lock:
                yield
        finally:
            with self.guard:
                _, users = self.entries[key]
                if users == 1:
                    del self.entries[key]
                else:
                    self.entries[key] = (lock, users - 1)
