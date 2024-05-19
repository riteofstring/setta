import builtins

CODE_FOLDER = "runcoder_code"
PARAMETER = "parameter"
COLLECTION = "collection"
CALLABLE = "callable"
BUILT_INS = set(dir(builtins))


class Constants:
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
