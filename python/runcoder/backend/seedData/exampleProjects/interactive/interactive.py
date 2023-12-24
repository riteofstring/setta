PROJECT = "interactive"

def fn(message):
    message = message["message"]
    print(message, flush=True)
    return {"output": None, "name": PROJECT, "cache": None}


RUNCODER = {"fn": fn, "project": PROJECT}
