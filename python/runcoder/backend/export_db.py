import json
import os
import sqlite3

import yaml


def fetch_column_defaults(cursor, table_name):
    """Fetch the default values for all columns in a table."""
    cursor.execute(f"PRAGMA table_info('{table_name}')")
    return {row[1]: row[4] for row in cursor.fetchall() if row[4] is not None}


def fetch_schema(cursor):
    """Fetch the schema of all tables in the database."""
    cursor.execute("SELECT type, name, sql FROM sqlite_master WHERE sql NOT NULL;")
    schema = {}
    for type, name, sql in cursor.fetchall():
        if name not in schema:
            schema[name] = {"type": type, "sql": sql}
    return schema


def fetch_table_data_with_defaults(cursor, table_name):
    """Fetch data from a table, omitting columns with default values."""
    column_defaults = fetch_column_defaults(cursor, table_name)
    cursor.execute(f"SELECT * FROM {table_name}")
    columns = [description[0] for description in cursor.description]
    rows = cursor.fetchall()

    # Filter out columns with their default value
    filtered_rows = []
    for row in rows:
        filtered_row = {}
        for col, value in zip(columns, row):
            default_value = column_defaults.get(col)
            # Convert SQL default value to Python type for comparison
            if default_value is not None:
                try:
                    # Attempt to evaluate the default value if it's not 'NULL'
                    default_value = (
                        eval(default_value) if default_value.lower() != "null" else None
                    )
                except NameError:
                    # Handle unquoted strings (e.g., CURRENT_TIMESTAMP)
                    pass
            if value == default_value:
                continue  # Skip this column
            filtered_row[col] = value
        filtered_rows.append(filtered_row)
    return filtered_rows


def fetch_all_data(cursor):
    """Fetch all data from the database."""
    data = {}
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    for (table_name,) in cursor.fetchall():
        data[table_name] = fetch_table_data_with_defaults(cursor, table_name)
    return data


def _export_database(cursor, filename):
    """Export the entire database to JSON and YAML, including schema."""
    schema = fetch_schema(cursor)
    data = fetch_all_data(cursor)

    # Combined schema and data for JSON export
    database_export = {"schema": schema, "data": data}
    # with open(f"{filename}_export.json", 'w') as file:
    #     json.dump(database_export, file, indent=4)

    # Customize the YAML dump to use literal style for SQL
    def literal_presenter(dumper, data):
        if "\n" in data:
            return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
        return dumper.represent_scalar("tag:yaml.org,2002:str", data)

    yaml.add_representer(str, literal_presenter)

    # For YAML export, PyYAML is used; ensure it's installed
    with open(f"{filename}_export.yaml", "w") as file:
        yaml.dump(database_export, file, allow_unicode=True)


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
