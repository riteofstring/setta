import ast
from pathlib import Path


def test_spa_catch_all_route_param_matches_handler_arg() -> None:
    server_path = (
        Path(__file__).resolve().parents[2] / "backend" / "setta" / "server.py"
    )
    tree = ast.parse(server_path.read_text(encoding="utf-8"))

    lifespan_node = next(
        node
        for node in tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "lifespan"
    )

    read_root_node: ast.AsyncFunctionDef | None = None
    route_path: str | None = None
    for node in ast.walk(lifespan_node):
        if not isinstance(node, ast.AsyncFunctionDef):
            continue
        if node.name != "read_root":
            continue
        read_root_node = node
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            if not (
                isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "app"
                and decorator.func.attr == "get"
            ):
                continue
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                route_path = decorator.args[0].value
        break

    assert read_root_node is not None, "Expected lifespan() to define read_root()"
    assert route_path is not None, "Expected read_root() to have an @app.get decorator"
    assert isinstance(route_path, str), "Expected @app.get path to be a string literal"
    assert route_path.startswith("/{") and ":path}" in route_path

    # Example: "/{_full_path:path}" -> "_full_path"
    raw_param = route_path.split("/{", 1)[1].split(":path}", 1)[0]
    assert raw_param, "Expected a path param name in @app.get path"

    arg_names = [arg.arg for arg in read_root_node.args.args]
    assert len(arg_names) == 1
    assert raw_param == arg_names[0]


def test_mcp_catch_all_constant_matches_spa_route() -> None:
    server_path = (
        Path(__file__).resolve().parents[2] / "backend" / "setta" / "server.py"
    )
    mcp_server_path = (
        Path(__file__).resolve().parents[2]
        / "backend"
        / "setta"
        / "mcp"
        / "server.py"
    )

    server_tree = ast.parse(server_path.read_text(encoding="utf-8"))
    mcp_server_tree = ast.parse(mcp_server_path.read_text(encoding="utf-8"))

    lifespan_node = next(
        node
        for node in server_tree.body
        if isinstance(node, ast.AsyncFunctionDef) and node.name == "lifespan"
    )

    spa_route_path: str | None = None
    for node in ast.walk(lifespan_node):
        if not isinstance(node, ast.AsyncFunctionDef) or node.name != "read_root":
            continue
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            if not (
                isinstance(decorator.func, ast.Attribute)
                and isinstance(decorator.func.value, ast.Name)
                and decorator.func.value.id == "app"
                and decorator.func.attr == "get"
            ):
                continue
            if decorator.args and isinstance(decorator.args[0], ast.Constant):
                spa_route_path = decorator.args[0].value
        break

    mcp_catch_all_constant: str | None = None
    for node in mcp_server_tree.body:
        if not isinstance(node, ast.Assign):
            continue
        for target in node.targets:
            if isinstance(target, ast.Name) and target.id == "_CATCH_ALL_PATH":
                if isinstance(node.value, ast.Constant):
                    mcp_catch_all_constant = node.value.value
                break

    # This guards route precedence: MCP reorders the SPA catch-all by exact path.
    assert isinstance(spa_route_path, str)
    assert isinstance(mcp_catch_all_constant, str)
    assert mcp_catch_all_constant == spa_route_path
