from setta.logging.context_sources import build_background_task_context


class TestLoggingContextSources:
    def test_build_background_task_context_merges_values(self) -> None:
        context = build_background_task_context(
            label="autosave",
            project_config_id="alpha",
            request_id="req-zeta",
            websocket_id="ws-2",
            extra_values={"section_id": "sec-9"},
        )
        assert context == {
            "task": "autosave",
            "project_config_id": "alpha",
            "request_id": "req-zeta",
            "websocket_id": "ws-2",
            "section_id": "sec-9",
        }
