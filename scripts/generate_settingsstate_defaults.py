import json
from pathlib import Path

from setta.types.generated.settings_state import SettingsState


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    output_path = repo_root / "internal" / "settingsstate" / "defaults.json"
    payload = SettingsState().model_dump(mode="json")
    output_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {output_path}")


if __name__ == "__main__":
    main()
