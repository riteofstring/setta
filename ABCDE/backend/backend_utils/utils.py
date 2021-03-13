def query_string_parser(query_string, key):
    query_string = query_string.decode().split("&")
    value = None
    for s in query_string:
        if s.startswith(f"{key}="):
            value = s.replace(f"{key}=", "", 1)
            break
    return value
