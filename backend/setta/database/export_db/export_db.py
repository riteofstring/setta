import os

from ..db_objs import DBQueue
from .export_all_variants_readable import export_all_variants_readable
from .export_raw import export_raw
from .export_readable import export_readable


def _export_database(db, filename):
    export_raw(db, filename)
    export_readable(db, filename)
    export_all_variants_readable(db, filename)


def export_database(path):
    # Connect to the SQLite database
    dbq = DBQueue(path, False)
    dbq.connect()
    with dbq as db:
        # Export the database, including schema and data, to JSON and YAML
        _export_database(db, os.path.splitext(os.path.basename(path))[0])
    dbq.disconnect()
