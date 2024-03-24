import queue
import sqlite3

from .db_init import maybe_create_tables_and_seed
from .db_path import DEFAULT_DB_ALIAS, get_db_path_from_config, validate_path
from .environ import get_cli_arg


class DB:
    def __init__(self, path):
        self.conn = None
        self.cursor = None
        self.path = path

    def connect(self):
        if not self.conn:
            print("connect to", self.path, flush=True)
            self.conn = sqlite3.connect(
                self.path,
                check_same_thread=False,
            )
            self.conn.row_factory = sqlite3.Row
            self.cursor = self.conn.cursor()
        self.execute("PRAGMA foreign_keys = ON;")

    def disconnect(self):
        if self.conn:
            self.cursor.close()
            self.conn.close()
            self.cursor = None
            self.conn = None

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

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
        self.curr = None

    def set_curr(self):
        self.curr = self.queue.get()
        print("set_curr", self.curr)
        return self.curr

    def put_back_curr(self):
        if self.curr is not None:
            self.queue.put(self.curr)

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


class DBs:
    def __init__(self):
        db_specs = get_cli_arg("db_specs")
        names_to_paths = self.parse_dbs_arg(db_specs)
        self.dbs = {}
        for name, path in names_to_paths.items():
            if path is None:
                path = get_db_path_from_config(name)
            if path:
                validate_path(path, get_cli_arg("create_if_not_exists"))
            else:
                raise ValueError(f"{name} not found in config file")
            self.dbs[name] = DBQueue(path)

        self.connect()
        with self:
            for k, v in self.dbs.items():
                with_example_projects = k == DEFAULT_DB_ALIAS and get_cli_arg(
                    "with_example_projects"
                )
                maybe_create_tables_and_seed(
                    v.curr, with_example_projects=with_example_projects
                )
        self.disconnect()

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
        if DEFAULT_DB_ALIAS not in output:
            output[DEFAULT_DB_ALIAS] = get_db_path_from_config(DEFAULT_DB_ALIAS)
        return output

    def connect(self):
        for v in self.dbs.values():
            v.connect()

    def disconnect(self):
        for v in self.dbs.values():
            v.disconnect()

    def __enter__(self):
        for v in self.dbs.values():
            v.set_curr()
        return self

    def __exit__(self, exc_type, *_):
        if exc_type is None:
            # Attempt to commit both transactions if there were no exceptions
            try:
                for v in self.dbs.values():
                    v.curr.commit()
            except sqlite3.Error:
                # If commit fails in either database, roll back both
                for v in self.dbs.values():
                    v.curr.rollback()
                raise  # Optionally re-raise the commit exception
        else:
            # Rollback both transactions if there were errors during processing
            for v in self.dbs.values():
                v.curr.rollback()

        for v in self.dbs.values():
            v.put_back_curr()
