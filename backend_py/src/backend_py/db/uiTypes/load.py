from pprint import pprint

from ...schema import db


def load_base_uitypes():
    return load_uitypes_by_preset_type("BASE")


def load_uitypes_by_preset_type(preset_type):
    query = """
        SELECT * FROM UIType
        WHERE presetType = :presetType
    """

    db.execute(query, {"presetType": preset_type})
    results = {row["id"]: dict(row) for row in db.fetchall()}
    pprint(results)
    output = {}
    return output


# def process_uitype(uitype):
