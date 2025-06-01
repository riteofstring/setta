import os

from ..db_objs import DBE
from .export_raw import export_raw
from .export_readable import export_readable


def _export_database(
    db, filename, raw=True, readable=True, readable_with_variants=True
):
    if not raw and not readable and not readable_with_variants:
        return
    filename = os.path.splitext(os.path.basename(filename))[0]
    if raw:
        export_raw(db, filename)
    if readable:
        export_readable(db, filename, with_variants=False)
    if readable_with_variants:
        export_readable(db, filename, with_variants=True)


def export_database(path, raw, readable, readable_with_variants):
    # Connect to the SQLite database
    dbe = DBE(path)
    with dbe.session as db:
        # Export the database, including schema and data, to JSON and YAML
        _export_database(db, path, raw, readable, readable_with_variants)


def maybe_export_database(
    db, path, raw: bool, readable: bool, readable_with_variants: bool
):
    _export_database(
        db,
        path,
        raw=raw,
        readable=readable,
        readable_with_variants=readable_with_variants,
    )
