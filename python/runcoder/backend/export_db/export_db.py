import os
import sqlite3
from .export_raw import export_raw
from .export_readable import export_readable


def fetch_schema(cursor):
    """Fetch the schema of all tables in the database."""
    cursor.execute("SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL;")
    schema = {}
    for type, name, sql in cursor.fetchall():
        if name not in schema:
            schema[name] = {"type": type, "sql": sql}
    return schema


def fetch_all_data(cursor):
    """Fetch all data from the database."""
    data = {}
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    for (table_name,) in cursor.fetchall():
        cursor.execute(f"SELECT * FROM {table_name}")
        columns = [description[0] for description in cursor.description]
        data[table_name] = [dict(zip(columns, row)) for row in cursor.fetchall()]
    return data


def _export_database(cursor, filename):
    """Export the entire database to JSON and YAML, including schema."""
    schema = fetch_schema(cursor)
    data = fetch_all_data(cursor)
    # export_raw(filename, data, schema)
    export_readable(filename, data)


def export_database(path):
    if os.path.exists(path):
        # Connect to the SQLite database
        conn = sqlite3.connect(path)
        cursor = conn.cursor()

        # Export the database, including schema and data, to JSON and YAML
        _export_database(cursor, os.path.splitext(os.path.basename(path))[0])

        # Close the database connection
        conn.close()
    else:
        raise FileNotFoundError
