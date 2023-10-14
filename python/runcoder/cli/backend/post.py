from ..utils.constants import BACKEND


def post(post_obj, address, **kwargs):
    return post_obj.post(f"{BACKEND}/{address}", **kwargs)
