from .mypy import killMyPyDaemon, startMyPyDaemon


def startDaemons():
    startMyPyDaemon()


def killDaemons():
    killMyPyDaemon()
