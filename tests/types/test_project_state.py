from setta.types import project_state


def test_project_state_does_not_expose_logger() -> None:
    assert not hasattr(project_state, "logger")
