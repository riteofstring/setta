import os
import sqlite3

from .db_path import get_db_path


class DB:
    conn = None
    cursor = None

    def connect(self):
        if not self.conn:
            print("connect to", get_db_path())
            self.conn = sqlite3.connect(get_db_path(), check_same_thread=False)
            self.conn.row_factory = sqlite3.Row
        if not self.cursor:
            self.cursor = self.conn.cursor()
        self.execute("PRAGMA foreign_keys = ON;")

    def disconnect(self):
        if self.conn:
            self.conn.close()
            self.cursor.close()
            self.conn = None
            self.cursor = None

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
        self.connect()
        return self.conn.__enter__(*args, **kwargs)

    def __exit__(self, *args, **kwargs):
        return self.conn.__exit__(*args, **kwargs)


db = DB()
