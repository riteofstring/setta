from starlette.datastructures import Headers


def extract_bearer_token(headers: Headers) -> str | None:
    authorization = headers.get("authorization")
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = value.strip()
    if not token:
        return None
    return token
