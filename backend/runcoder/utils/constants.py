import builtins

from .utils import is_dev_mode

CODE_FOLDER = "runcoder_code"
BUILT_INS = set(dir(builtins))


class Constants:
    @property
    def FRONTEND_ORIGINS(self):
        if is_dev_mode():
            output = [f"http://{self.HOST}:{self.DEV_MODE_FRONTEND_PORT}"]
        else:
            output = [self.BACKEND]
        if self.HOST == "127.0.0.1":
            output.append(output[0].replace("127.0.0.1", "localhost"))
        return output

    @property
    def BACKEND(self):
        return f"http://{self.HOST}:{self.PORT}"

    @property
    def WEBSOCKET(self):
        return f"ws://{self.HOST}:{self.PORT}"


C = Constants()


def set_constants(**kwargs):
    for k, v in kwargs.items():
        setattr(C, k.upper(), v)


def is_section_ui_type(x):
    return x not in [C.TEXT, C.SLIDER, C.SWITCH]
