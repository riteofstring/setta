import os
import queue
import sqlite3
from contextlib import contextmanager

from .db_path import get_db_path


class DB:
    def __init__(self):
        self.conn = None
        self.cursor = None

    def connect(self):
        if not self.conn:
            print("connect to", get_db_path())
            self.conn = sqlite3.connect(get_db_path(), check_same_thread=False)
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
        path = get_db_path()
        if os.path.exists(path):
            self.disconnect()
            os.remove(path)

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
        return self.conn.__enter__(*args, **kwargs)

    def __exit__(self, *args, **kwargs):
        return self.conn.__exit__(*args, **kwargs)


class DBQueue:
    def __init__(self, n):
        self.queue = queue.Queue()
        for _ in range(n):
            self.queue.put(DB())

    @contextmanager
    def get(self):
        db = self.queue.get()
        try:
            yield db
        finally:
            self.queue.put(db)

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

    def commit(self):
        with self.get() as db:
            db.commit()

    def execute(self, *args, **kwargs):
        with self.get() as db:
            db.execute(*args, **kwargs)

    def executemany(self, *args, **kwargs):
        with self.get() as db:
            db.executemany(*args, **kwargs)

    def fetchall(self, *args, **kwargs):
        with self.get() as db:
            return db.fetchall(*args, **kwargs)

    def fetchone(self, *args, **kwargs):
        with self.get() as db:
            return db.fetchone(*args, **kwargs)

    def __enter__(self, *args, **kwargs):
        with self.get() as db:
            return db.__enter__(*args, **kwargs)

    def __exit__(self, *args, **kwargs):
        with self.get() as db:
            return db.__exit__(*args, **kwargs)


db = DBQueue(1)
