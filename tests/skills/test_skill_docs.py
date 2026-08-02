import re
from pathlib import Path

import yaml


SKILLS_ROOT = Path(__file__).resolve().parents[2] / "docs" / "skill-catalog"
FRONT_MATTER_DELIMITER = "---"
REFERENCE_PATTERN = re.compile(r"(references/[A-Za-z0-9._/\\-]+)")


def _parse_front_matter(text: str) -> tuple[dict, str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != FRONT_MATTER_DELIMITER:
        raise ValueError("Missing front matter delimiter.")
    end_index = None
    for idx, line in enumerate(lines[1:], start=1):
        if line.strip() == FRONT_MATTER_DELIMITER:
            end_index = idx
            break
    if end_index is None:
        raise ValueError("Unterminated front matter.")
    front_text = "\n".join(lines[1:end_index])
    body_text = "\n".join(lines[end_index + 1 :])
    data = yaml.safe_load(front_text) or {}
    if not isinstance(data, dict):
        raise ValueError("Front matter is not a mapping.")
    return data, body_text


class TestSkillDocs:
    def test_skills_exist(self) -> None:
        skills = list(SKILLS_ROOT.rglob("SKILL.md"))
        assert skills, "No SKILL.md files found under docs/skill-catalog/"

    def test_skill_front_matter_contract(self) -> None:
        for skill_path in SKILLS_ROOT.rglob("SKILL.md"):
            text = skill_path.read_text(encoding="utf-8")
            front_matter, _ = _parse_front_matter(text)

            for key in ("name", "description", "compatibility", "metadata"):
                assert key in front_matter, f"{skill_path} missing {key}"

            metadata = front_matter.get("metadata")
            assert isinstance(metadata, dict), f"{skill_path} metadata not a dict"
            assert "version" in metadata, (
                f"{skill_path} missing metadata.version"
            )
            assert isinstance(metadata.get("version"), str), (
                f"{skill_path} metadata.version not a string"
            )

    def test_skill_reference_files_exist(self) -> None:
        for skill_path in SKILLS_ROOT.rglob("SKILL.md"):
            text = skill_path.read_text(encoding="utf-8")
            _, body = _parse_front_matter(text)
            references = set(REFERENCE_PATTERN.findall(body))
            skill_dir = skill_path.parent
            for ref in references:
                ref_path = (skill_dir / ref).resolve()
                assert ref_path.exists(), (
                    f"{skill_path} references missing file: {ref}"
                )
