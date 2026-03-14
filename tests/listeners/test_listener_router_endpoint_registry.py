from setta.listeners.listener_router_endpoint_registry import (
    get_listener_router_endpoint_specs,
)


class TestListenerRouterEndpointRegistry:
    def test_allowlist_filters_disallowed_modules(self) -> None:
        get_listener_router_endpoint_specs.cache_clear()
        specs = get_listener_router_endpoint_specs()
        assert "route_get_chat_section_chat_id" in specs
        assert "route_get_notifications" not in specs
