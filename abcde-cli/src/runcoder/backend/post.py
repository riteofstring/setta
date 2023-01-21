from ..utils.constants import BACKEND


def post(post_obj, address, cookies=None, **kwargs):
    if cookies:
        cookies = {"connect.sid": cookies}
    return post_obj.post(f"{BACKEND}{address}", cookies=cookies, **kwargs)
