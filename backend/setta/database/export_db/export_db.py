import os

from setta.utils.constants import USER_SETTINGS

from ..db_objs import DBQueue
from .export_all_variants_readable import export_all_variants_readable
from .export_raw import export_raw
from .export_readable import export_readable


def _export_database(db, filename, raw=True, readable=True, all_variants_readable=True):
    if not raw and not readable and not all_variants_readable:
        return
    filename = os.path.splitext(os.path.basename(filename))[0]
    if raw:
        export_raw(db, filename)
    if readable:
        export_readable(db, filename, with_variants=False)
    if all_variants_readable:
        export_all_variants_readable(db, filename)


def export_database(path):
    # Connect to the SQLite database
    dbq = DBQueue(path)
    dbq.connect()
    with dbq as db:
        # Export the database, including schema and data, to JSON and YAML
        _export_database(db, path, False, True, False)
    dbq.disconnect()


def maybe_export_database(db, path):
    _export_database(
        db,
        path,
        raw=USER_SETTINGS["exportDbRawOnSave"],
        readable=USER_SETTINGS["exportDbReadableOnSave"],
        all_variants_readable=USER_SETTINGS["exportDbAllVariantsReadableOnSave"],
    )
