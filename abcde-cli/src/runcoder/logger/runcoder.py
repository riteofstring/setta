from ..backend.login import login


class RuncoderLoginError(Exception):
    pass


class Runcoder:
    def __init__(self, username, password):
        failed, token = login(username, password)
        self.token = token
        if failed:
            raise RuncoderLoginError
