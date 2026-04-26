"""
Callback builder used by tests/manual_listener_smoke.py when exercising listener
hot reload support. Edit the VERSION label or callback body while the manual
script is running to watch the listener reload in place without dropping the
websocket connection.
"""

from typing import Any

from setta.api.listener import SettaListener

VERSION = "v1"


def build_callbacks(listener: SettaListener) -> None:
    """Register a sample callback that reports the current VERSION label."""

    @listener.listen(
        deps=("hiding_river__x",),
        run_on_refresh=True,
    )
    def on_groups_change(state: Any, ctx: Any) -> None:
        groups_value = state.hiding_river__x
        print(f"[listener] version={VERSION}")
        print(f"[listener] groups -> {groups_value}")
        print(f"[listener] delta  -> {ctx.changed}")
