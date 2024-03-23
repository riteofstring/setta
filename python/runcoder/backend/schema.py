import os
import queue
import sqlite3
from contextlib import contextmanager


class DB:
    def __init__(self, path):
        self.conn = None
        self.cursor = None
        self.path = path

    def connect(self):
        if not self.conn:
            print("connect to", self.path, flush=True)
            self.conn = sqlite3.connect(self.path, check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
            self.cursor = self.conn.cursor()
        self.execute("PRAGMA foreign_keys = ON;")

    def disconnect(self):
        if self.conn:
            self.cursor.close()
            self.conn.close()
            self.cursor = None
            self.conn = None

    def delete(self):
        if os.path.exists(self.path):
            os.remove(self.path)
        self.disconnect()

    def commit(self):
        self.conn.commit()

    def execute(self, *args, **kwargs):
        self.cursor.execute(*args, **kwargs)

    def executemany(self, *args, **kwargs):
        self.cursor.executemany(*args, **kwargs)

    def fetchall(self, *args, **kwargs):
        return self.cursor.fetchall(*args, **kwargs)

    def fetchone(self, *args, **kwargs):
        return self.cursor.fetchone(*args, **kwargs)

    def __enter__(self, *args, **kwargs):
        self.conn.__enter__(*args, **kwargs)
        return self

    def __exit__(self, *args, **kwargs):
        return self.conn.__exit__(*args, **kwargs)


class DBQueue:
    def __init__(self, path, n=1):
        self.queue = queue.Queue()
        for _ in range(n):
            self.queue.put(DB(path))

    @contextmanager
    def get(self):
        with CombinedContextManager(self.queue) as db:
            yield db

    def process_conns(self, fn_name):
        all_dbs = []
        while True:
            try:
                db = self.queue.get_nowait()
            except queue.Empty:
                break
            else:
                fn = getattr(db, fn_name)
                fn()
                all_dbs.append(db)

        for db in all_dbs:
            self.queue.put(db)

    def connect(self):
        self.process_conns("connect")

    def disconnect(self):
        self.process_conns("disconnect")

    def delete(self):
        self.process_conns("delete")


class CombinedContextManager:
    def __init__(self, queue):
        self.queue = queue
        self.db = None

    def __enter__(self, *args, **kwargs):
        self.db = self.queue.get()
        return self.db.__enter__(*args, **kwargs)

    def __exit__(self, *args, **kwargs):
        if self.db is not None:
            self.db.__exit__(*args, **kwargs)
            self.queue.put(self.db)


dbs = {}