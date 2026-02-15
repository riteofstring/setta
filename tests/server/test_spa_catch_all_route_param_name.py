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

