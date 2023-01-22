import requests

from ..backend.login import login
from ..backend.post import post


class RuncoderLoginError(Exception):
    pass


class Runcoder:
    token = None

    def __init__(self, username=None, password=None, pathname=None):
        if username and password:
            failed, token = login(username, password)
            self.token = token
            if failed:
                raise RuncoderLoginError
        self.pathname = pathname

    def log(self, group, key, value):
        x = {
            "type": "LOG",
            "data": {"group": group, "key": key, "value": value},
            "pathname": self.pathname,
        }
        post(requests, "logging", cookies=self.token, json=x)
