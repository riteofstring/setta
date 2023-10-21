DOMAIN = "127.0.0.1"
BACKEND_PORT = 8000
BACKEND = f"http://{DOMAIN}:{BACKEND_PORT}"
WEBSOCKET = f"ws://{DOMAIN}:{BACKEND_PORT}"
CODE_FOLDER = "runcoder_code"
PARAMETER = "parameter"
COLLECTION = "collection"
CALLABLE = "callable"

TEXT = "TEXT"
SLIDER = "SLIDER"
SWITCH = "SWITCH"
REF = "REF"
SECTION = "SECTION"
LIST_ROOT = "LIST_ROOT"
DICT_ROOT = "DICT_ROOT"
DECK = "DECK"
FN = "FN"


def is_section_ui_type(x):
    return x not in [TEXT, SLIDER, SWITCH, REF]
