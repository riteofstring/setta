import requests
from requests.adapters import HTTPAdapter, Retry

from runcoder.utils.constants import C


def post(post_obj, address, **kwargs):
    return post_obj.post(f"{C.backend}/{address}", **kwargs)


def get_retry_session(total=5, backoff_factor=0.1, status_forcelist=(404,)):
    s = requests.Session()
    retries = Retry(
        total=total,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        method_whitelist=frozenset(["GET", "POST"]),
    )
    s.mount("http://", HTTPAdapter(max_retries=retries))
    return s
