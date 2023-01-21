import requests

from ..utils.constants import BACKEND


def login(username, password):
    r = requests.post(
        f"{BACKEND}auth/login",
        json={"username": username, "password": password},
    )
    failed = r.status_code != 200
    token = r.cookies.get_dict()["connect.sid"] if not failed else None
    return failed, token
