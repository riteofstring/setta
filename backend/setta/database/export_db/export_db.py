import os

from ..db_objs import create_dbs_with_input_as_default
from .export_all_variants_readable import export_all_variants_readable
from .export_raw import export_raw
from .export_readable import export_readable


def _export_database(dbs, filename):
    export_raw(dbs, filename)
    export_readable(dbs, filename)
    export_all_variants_readable(dbs, filename)


def export_database(path):
    # Connect to the SQLite database
    dbs = create_dbs_with_input_as_default(path, False)
    dbs.connect()
    with dbs:
        # Export the database, including schema and data, to JSON and YAML
        _export_database(dbs, os.path.splitext(os.path.basename(path))[0])
    dbs.disconnect()
