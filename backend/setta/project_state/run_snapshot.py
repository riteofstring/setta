from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from setta.database.db_objs import DBE
from setta.project_state.utils import create_timestamped_folder
from setta.types.id import ID
from setta.types.section_impls import CodeFileBinding

RunCommandBuilder = Callable[[Path], str]


@dataclass(frozen=True)
class SnapshotCodeSection:
    code: str
    binding: CodeFileBinding
    run_command_builder: RunCommandBuilder


def write_snapshot_file(
    dbe: DBE,
    target_folder: Path,
    binding: CodeFileBinding,
    code: str,
) -> Path:
    target_folder.mkdir(parents=True, exist_ok=True)
    target_path = target_folder / binding.canonical_path.name
    dbe.write(target_path, code)
    return target_path


def create_snapshot_run_command(
    *,
    dbe: DBE,
    snapshot_root: Path,
    entry_section_id: ID | None,
    gen_code: str,
    gen_binding: CodeFileBinding,
    code_sections: dict[ID, SnapshotCodeSection],
    gen_command_builder: RunCommandBuilder,
) -> str:
    target_folder = create_timestamped_folder(snapshot_root)
    gen_code_path = write_snapshot_file(dbe, target_folder, gen_binding, gen_code)
    code_paths: dict[ID, Path] = {}
    for section_id, section in code_sections.items():
        code_paths[section_id] = write_snapshot_file(
            dbe,
            target_folder,
            section.binding,
            section.code,
        )
    if entry_section_id:
        if entry_section_id not in code_paths:
            raise KeyError(f"Missing code section for run: {entry_section_id}")
        section = code_sections[entry_section_id]
        return section.run_command_builder(code_paths[entry_section_id])
    return gen_command_builder(gen_code_path)
