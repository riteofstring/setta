import shlex
from pathlib import Path

from setta.project_state.utils import convert_path_to_module_path
from setta.utils.utils import normalize_path


def build_python_module_run_command(path: Path) -> str:
    normalized = normalize_path(path)
    module_path = convert_path_to_module_path(normalized)
    return f"python -m {module_path}"


def build_python_file_run_command(path: Path) -> str:
    resolved = shlex.quote(str(path.resolve()))
    return f"python {resolved}"


def build_bash_run_command(
    path: Path,
    *,
    use_absolute: bool = False,
    quote: bool = False,
) -> str:
    resolved = path.resolve() if use_absolute else normalize_path(path)
    rendered = str(resolved)
    if quote:
        rendered = shlex.quote(rendered)
    return f"bash {rendered}"
