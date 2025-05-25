from setta.utils.utils import get_absolute_path


def create_tables(db):
    with open(get_absolute_path(__file__, "db_init.sql"), "r") as sql_file:
        sql_script = sql_file.read()
        db.executescript(sql_script)


def seed_data_exist(db, tablenames):
    for table in tablenames:
        db.execute(f"SELECT COUNT(*) FROM {table}")
        if db.fetchone()[0] == 0:
            return False
    return True


def maybe_create_tables_and_seed(dbq, with_examples=False):
    dbq.connect()
    with dbq as db:
        create_tables(db)
        # do_seed_examples = with_examples and not seed_data_exist(db, ["ProjectConfig"])
        # seed(
        #     db,
        #     with_examples=do_seed_examples,
        # )
    dbq.disconnect()
