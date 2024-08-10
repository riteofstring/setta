import queue
import sqlite3

from setta.utils.constants import C

from .db_path import get_db_path_from_config, validate_path


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

    @property
    def description(self):
        return self.cursor.description

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


class DBs:
    def __init__(self, db_specs, create_if_not_exists):
        names_to_paths = self.parse_dbs_arg(db_specs, create_if_not_exists)
        self.dbs = {}
        self.names_to_paths = {}
        self.db_source_mapping = {}

        for name, path in names_to_paths:
            if path not in self.dbs:
                self.dbs[path] = DBQueue(path)
                self.names_to_paths[name] = path
                self.db_source_mapping[name] = name
            else:
                existing_alias = None
                for k, v in self.names_to_paths.items():
                    if v == path:
                        existing_alias = k
                        break
                if not existing_alias:
                    raise ValueError
                self.db_source_mapping[name] = existing_alias

    # Path example:
    # --d "api_keys=/path/to/some.db"
    # Alias example:
    # --d api_keys
    def parse_dbs_arg(self, db_specs, create_if_not_exists):
        output = []
        for db_spec in db_specs:
            output.append(self.parse_one_arg(db_spec, create_if_not_exists))

        if C.DEFAULT_DB_ALIAS not in [x[0] for x in output]:
            output.append(
                (C.DEFAULT_DB_ALIAS, get_db_path_from_config(C.DEFAULT_DB_ALIAS))
            )

        return move_default_to_beginning(output)

    def parse_one_arg(self, db_spec, create_if_not_exists):
        # it's an alias
        if "=" not in db_spec:
            name, path = db_spec, get_db_path_from_config(db_spec)
        else:
            split_str = db_spec.split("=")
            name, path = split_str[0], "".join(split_str[1:])

        if path:
            validate_path(path, create_if_not_exists)
        else:
            raise ValueError(f"{name} not found in config file")

        return name, path

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

    def __getitem__(self, key):
        mapped_source = self.db_source_mapping[key]
        return self.dbs[self.names_to_paths[mapped_source]].curr

    def __contains__(self, key):
        return key in self.db_source_mapping

    def items(self):
        output = {}
        for k, v in self.names_to_paths.items():
            output[k] = self.dbs[v].curr
        return output.items()

    def values(self):
        return [x[1] for x in self.items()]

    @property
    def default(self):
        return self[C.DEFAULT_DB_ALIAS]


def move_default_to_beginning(x):
    def custom_sort_key(item):
        if item[0] == C.DEFAULT_DB_ALIAS:
            return 0
        else:
            return 1

    return sorted(x, key=custom_sort_key)


def create_dbs_with_input_as_default(path, create_if_not_exists):
    return DBs([f"default={path}"], create_if_not_exists)
