import copy

from ...schema import db
from ...utils.auth_utils import get_salt_and_hash
from ...utils.utils import maybe_new_id


def create_user(data):
    data = copy.deepcopy(data)
    data["name"] = process_username(data["name"])
    data["id"] = maybe_new_id(data.get("id"))
    x = get_salt_and_hash(data["password"])

    query = """
        INSERT INTO User (id, name, salt, password)
        VALUES (?, ?, ?, ?);
    """
    print(query)
    db.execute(query, (data["id"], data["name"], x["salt"], x["password"]))
    db.commit()


def process_username(name: str) -> str:
    return name.lower()
