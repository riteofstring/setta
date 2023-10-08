from ...schema import db


def load_settings():
    query = """
        SELECT *
        FROM Settings
        WHERE profileName = "default"
    """
    db.execute(query)
    output = dict(db.fetchone())
    output.pop("profileName")
    return output
