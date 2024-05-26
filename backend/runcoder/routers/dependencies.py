from fastapi import Request


def get_dbs(request: Request):
    return request.app.state.dbs
