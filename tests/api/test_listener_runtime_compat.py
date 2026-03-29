import pytest
from setta.api.listener import SettaListener
from setta.api.runtime_compat import RuntimeCompatibilityError
from setta.types.id import ID


@pytest.mark.asyncio
async def test_run_forever_surfaces_runtime_compatibility_errors(
    monkeypatch,
) -> None:
    listener = SettaListener(project_config_id=ID("proj-1"))

    async def ensure_runtime_compatibility() -> None:
        raise RuntimeCompatibilityError("mismatch")

    monkeypatch.setattr(
        listener, "_ensure_runtime_compatibility", ensure_runtime_compatibility
    )

    with pytest.raises(RuntimeCompatibilityError, match="mismatch"):
        await listener.run_forever()
