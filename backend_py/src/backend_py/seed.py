import json

from .db.user.save import create_user
from .schema import create_tables, db
from .utils.utils import get_absolute_path


def seed_users():
    with open(get_absolute_path(__file__, "seedData/Users.json"), "r") as f:
        data = json.load(f)
    for v in data.values():
        create_user(v)


if __name__ == "__main__":
    db.delete()
    create_tables()
    db.connect()
    seed_users()
