"""Explicit MongoDB/TinyDB adapters. MongoDB failure never silently changes storage."""
import json
import os
from pathlib import Path
from threading import RLock
from datetime import datetime, timezone

from pymongo import MongoClient, ASCENDING, ReplaceOne
from tinydb import TinyDB, Query
from tinydb.middlewares import CachingMiddleware
from tinydb.storages import JSONStorage


class Store:
    def __init__(self):
        self.lock = RLock()
        self.backend = os.getenv("DB_BACKEND", "tinydb")
        if self.backend == "mongodb":
            uri = os.getenv("MONGODB_URI")
            if not uri:
                raise RuntimeError("DB_BACKEND=mongodb requires MONGODB_URI")
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command("ping")
            self.db = self.client[os.getenv("MONGODB_DATABASE", "climatrace")]
            for name in ("weather", "analyses"):
                self.db[name].create_index([("key", ASCENDING)], unique=True)
        elif self.backend == "tinydb":
            path = Path(os.getenv("LOCAL_DB_PATH", str(Path(__file__).parent / "data/cache/db.json")))
            path.parent.mkdir(parents=True, exist_ok=True)
            # Single-process local storage: parse the growing JSON file once,
            # keep reads in server memory, and persist every write immediately.
            storage = CachingMiddleware(JSONStorage)
            storage.WRITE_CACHE_SIZE = 1
            self.db = TinyDB(path, storage=storage)
        else:
            raise RuntimeError("DB_BACKEND must be mongodb or tinydb")

    def get(self, collection, key):
        with self.lock:
            if self.backend == "mongodb":
                doc = self.db[collection].find_one({"key": key}, {"_id": 0})
            else:
                doc = self.db.table(collection).get(Query().key == key)
            # Return a detached document so response mutation cannot affect local records.
            return json.loads(json.dumps(doc["value"])) if doc else None

    def put(self, collection, key, value):
        with self.lock:
            doc = {"key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()}
            if self.backend == "mongodb":
                self.db[collection].replace_one({"key": key}, doc, upsert=True)
            else:
                self.db.table(collection).upsert(doc, Query().key == key)

    def close(self):
        (self.client if self.backend == "mongodb" else self.db).close()

    def put_many(self, collection, values):
        """Persist a weather batch once, rather than rewrite a large JSON per year."""
        with self.lock:
            if self.backend == "mongodb":
                now = datetime.now(timezone.utc).isoformat()
                self.db[collection].bulk_write([ReplaceOne({"key": key}, {"key": key, "value": value, "updated_at": now}, upsert=True) for key, value in values])
            else:
                storage = self.db.storage
                # TinyDB upsert can perform an update pass and an insert pass.
                storage.WRITE_CACHE_SIZE = 2 * len(values) + 1
                try:
                    for key, value in values:
                        self.put(collection, key, value)
                finally:
                    storage.flush()
                    storage.WRITE_CACHE_SIZE = 1
