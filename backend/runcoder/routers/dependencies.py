from fastapi import Request


def get_dbs(request: Request):
    return request.app.state.dbs


def get_tasks_and_cache(request: Request):
    return [request.app.state.tasks_obj, request.app.state.cache]
