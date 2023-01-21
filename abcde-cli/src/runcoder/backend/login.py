import requests

from ..utils.constants import BACKEND


def login(username, password):
    return requests.post(
        f"{BACKEND}auth/login",
        json={"username": username, "password": password},
    )
