from typing import Literal


def normalize_setta_files_location_for_launch(
    *,
    setta_files_location: Literal["auto", "local", "global"] | None,
    setta_files_location_provided: bool,
    setta_files_root: str | None,
    profile: str | None,
) -> Literal["auto", "local", "global"] | None:
    if setta_files_location is not None:
        if setta_files_root is not None and setta_files_location == "auto":
            return None
        return setta_files_location
    if not setta_files_location_provided:
        if setta_files_root is not None or profile is not None:
            return None
        return "auto"
    if setta_files_root is not None or profile is not None:
        return None
    return "auto"
