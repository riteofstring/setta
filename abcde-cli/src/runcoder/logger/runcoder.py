import requests

from ..backend.login import login
from ..backend.post import post


class RuncoderLoginError(Exception):
    pass


class Runcoder:
    def __init__(self, username, password):
        failed, token = login(username, password)
        self.token = token
        if failed:
            raise RuncoderLoginError

    def log(self, group, key, value):
        x = {"type": "LOG", "data": {"group": group, "key": key, "value": value}}
        post(requests, "logging", cookies=self.token, json=x)
