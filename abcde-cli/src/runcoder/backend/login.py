import requests

from ..backend.post import post


def login(username, password):
    r = post(requests, "auth/login", json={"username": username, "password": password})
    failed = r.status_code != 200
    token = r.cookies.get_dict()["connect.sid"] if not failed else None
    return failed, token
