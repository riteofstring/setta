import queue
import sqlite3

from setta.utils.constants import SETTA_FILES_FOLDER


class DB:
    def __init__(self, path):
        self.conn = None
        self.cursor = None
        self.path = path

    def connect(self):
        if not self.conn:
            self.conn = sqlite3.connect(
                self.path,
                check_same_thread=False,
            )
            self.conn.row_factory = sqlite3.Row
            self.cursor = self.conn.cursor()
            self.execute("PRAGMA foreign_keys = ON;")

    def disconnect(self):
        if self.conn and self.cursor:
            self.cursor.close()
            self.conn.close()
            self.cursor = None
            self.conn = None

    def commit(self):
        if self.conn:
            self.conn.commit()

    def rollback(self):
        if self.conn:
            self.conn.rollback()

    def execute(self, *args, **kwargs):
        if self.cursor:
            self.cursor.execute(*args, **kwargs)

    def executemany(self, *args, **kwargs):
        if self.cursor:
            self.cursor.executemany(*args, **kwargs)

    def executescript(self, *args, **kwargs):
        if self.cursor:
            self.cursor.executescript(*args, **kwargs)

    def fetchall(self, *args, **kwargs):
        if self.cursor:
            return self.cursor.fetchall(*args, **kwargs)

    def fetchone(self, *args, **kwargs):
        if self.cursor:
            return self.cursor.fetchone(*args, **kwargs)

    @property
    def description(self):
        if self.cursor:
            return self.cursor.description

    def __enter__(self, *args, **kwargs):
        self.connect()
        if self.conn:
            self.conn.__enter__(*args, **kwargs)
        return self

    def __exit__(self, *args, **kwargs):
        if self.conn:
            return self.conn.__exit__(*args, **kwargs)


class DBQueue:
    def __init__(self, path, n=10):
        self.queue = queue.Queue()
        for _ in range(n):
            self.queue.put(DB(path))
        self.curr = None

    def set_curr(self):
        self.curr = self.queue.get()

    def put_back_curr(self):
        self.queue.put(self.curr)
        self.curr = None

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

    def __enter__(self, *args, **kwargs):
        self.set_curr()
        if self.curr:
            self.curr.__enter__(*args, **kwargs)
            return self.curr

    def __exit__(self, *args, **kwargs):
        if self.curr is not None:
            result = self.curr.__exit__(*args, **kwargs)
            self.put_back_curr()
            return result
        return None


def get_default_db_path():
    return SETTA_FILES_FOLDER / "setta.db"
