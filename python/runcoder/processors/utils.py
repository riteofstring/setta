import subprocess
import os
import functools

def startMyPyDaemon():
    subprocess.run(
        [
            "dmypy",
            "start",
            "--",
            "--show-error-end",
            "--no-error-summary",
            "--no-pretty",
            "--no-color-output",
        ]
    )


def killMyPyDaemon():
    subprocess.run(["dmypy", "stop"])


def get_pid(func):
    @functools.wraps(func)
    def wrapper(p_dict, id, *args, **kwargs):
        pid = os.getpid()
        p_dict[id] = pid
        return func(*args, **kwargs)
    return wrapper
