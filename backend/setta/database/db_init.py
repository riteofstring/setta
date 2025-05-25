from setta.utils.utils import get_absolute_path


def create_tables(db):
    with open(get_absolute_path(__file__, "db_init.sql"), "r") as sql_file:
        sql_script = sql_file.read()
        db.executescript(sql_script)


def maybe_create_tables_and_seed(dbq):
    dbq.connect()
    with dbq as db:
        create_tables(db)
    dbq.disconnect()
