from uuid import uuid4


def create_new_id():
    return uuid4()


def maybe_new_id(x):
    return x if x else create_new_id()
