from setta.agentic.chat_titles import maybe_set_external_chat_title
from setta.agentic.external_adapters.codex_app_server import _extract_codex_thread_preview
from setta.agentic.external_adapters.opencode_sdk import _extract_opencode_session_title
from setta.agentic.store import create_agent_run, load_agent_run, save_agent_run
from setta.database.db_objs import DBE
from setta.types.agentic import AgentRunStatus
from setta.types.id import ID


def test_maybe_set_external_chat_title_does_not_override_llm_title() -> None:
    outputs: dict[str, object] = {"name": "LLM title", "nameSource": "llm"}
    applied = maybe_set_external_chat_title(outputs, title="External title")
    assert not applied
    assert outputs["name"] == "LLM title"
    assert outputs["nameSource"] == "llm"


def test_maybe_set_external_chat_title_overrides_deterministic_title() -> None:
    outputs: dict[str, object] = {"name": "Old title", "nameSource": "deterministic"}
    applied = maybe_set_external_chat_title(outputs, title="External title.")
    assert applied
    assert outputs["name"] == "External title"
    assert outputs["nameSource"] == "external"


def test_extract_opencode_session_title() -> None:
    payload = {
        "type": "session.updated",
        "properties": {
            "info": {
                "title": "OpenCode Session Title",
            }
        },
    }
    assert _extract_opencode_session_title(payload) == "OpenCode Session Title"


def test_extract_codex_thread_preview() -> None:
    payload = {
        "result": {
            "threads": [
                {"id": "thread-1", "preview": "Codex thread preview"},
            ]
        }
    }
    assert _extract_codex_thread_preview(payload, "thread-1") == "Codex thread preview"


def test_external_title_persists_in_agent_run(tmp_path) -> None:
    dbe = DBE(tmp_path / "setta_files")
    run_id = ID("run-external-title")
    run = create_agent_run(
        profile_id=None,
        inputs={"runType": "external_agent", "chatId": "chat-1"},
        run_id=run_id,
    )
    run.status = AgentRunStatus.completed
    run.outputs = {"name": "Old title", "nameSource": "deterministic"}
    save_agent_run(dbe, run)

    loaded = load_agent_run(dbe, run_id)
    assert loaded is not None
    assert loaded.outputs is not None

    outputs = loaded.outputs
    assert isinstance(outputs, dict)
    applied = maybe_set_external_chat_title(outputs, title="External title")
    assert applied
    loaded.outputs = outputs
    save_agent_run(dbe, loaded)

    reloaded = load_agent_run(dbe, run_id)
    assert reloaded is not None
    assert reloaded.outputs is not None
    assert reloaded.outputs.get("name") == "External title"
    assert reloaded.outputs.get("nameSource") == "external"
