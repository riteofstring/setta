import os
import queue
import sqlite3
from contextlib import contextmanager
from .db_path import get_db_path_from_config, validate_path, DEFAULT_DB_ALIAS, get_default_db_path
from .environ import get_cli_arg

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



class DBs:
    def __init__(self):
        db_specs = get_cli_arg("db_specs")
        names_to_paths = self.parse_dbs_arg(db_specs)
        print("names_to_paths", names_to_paths)
        self.dbs = {}
        for name, path in names_to_paths.items():
            if path is None:
                path = get_db_path_from_config(name)
            if path:
                validate_path(path)
            else:
                raise ValueError(f"{name} not found in config file")
            self.dbs[name] = DBQueue(path)
        
        if DEFAULT_DB_ALIAS not in self.dbs:
            self.dbs[DEFAULT_DB_ALIAS] = DBQueue(get_default_db_path())
    

    # Path example:
    # --d "api_keys=/path/to/some.db"
    # Alias example:
    # --d api_keys
    def parse_dbs_arg(self, db_specs):
        output = {}
        for db in db_specs:
            # it's an alias, so we'll get the path later
            if "=" not in db:
                output[db] = None
            else:
                split_str = db.split("=")
                output[split_str[0]] = "".join(split_str[1:])
        return output


    def connect(self):
        for v in self.dbs.values():
            v.connect()

    def disconnect(self):
        for v in self.dbs.values():
            v.disconnect()


    def __getitem__(self, key):
        return self.dbs[key]