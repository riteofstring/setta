from pathlib import Path

from setta.code_gen.utils import sanitize_name

GEN_CODE_FILENAME = "setta_gen.py"


def build_project_sections_dir(code_root: Path, project_name: str) -> Path:
    project_slug = sanitize_name(project_name)
    return code_root / "sections" / project_slug


def build_gen_code_path(code_root: Path, project_name: str) -> Path:
    return build_project_sections_dir(code_root, project_name) / GEN_CODE_FILENAME
