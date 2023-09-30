import json
from pathlib import Path

from .db.user.save import create_user


def seed_users():
    with open((Path(__file__).parent / "seedData/Users.json").resolve(), "r") as f:
        data = json.load(f)
    for v in data.values():
        create_user(v)


if __name__ == "__main__":
    seed_users()
