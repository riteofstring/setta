from setta.types.routes import Route


def format_host_for_url(host: str) -> str:
    if host == "0.0.0.0":
        return "127.0.0.1"
    if host == "::":
        host = "::1"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def format_host_for_ssh_tunnel(host: str) -> str:
    if host == "0.0.0.0":
        host = "127.0.0.1"
    elif host == "::":
        host = "::1"
    if ":" in host and not host.startswith("["):
        return f"[{host}]"
    return host


def build_bootstrap_urls(host: str, port: int, token: str) -> tuple[str, str]:
    url_host = format_host_for_url(host)
    base = f"http://{url_host}:{port}{Route.BOOTSTRAP_PAGE.value}"
    return f"{base}#token={token}", base
