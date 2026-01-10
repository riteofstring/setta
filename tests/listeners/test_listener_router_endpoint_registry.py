import unittest

from setta.listeners.listener_router_endpoint_registry import (
    get_listener_router_endpoint_specs,
)


class ListenerRouterEndpointRegistryTests(unittest.TestCase):
    def test_allowlist_filters_disallowed_modules(self) -> None:
        get_listener_router_endpoint_specs.cache_clear()
        specs = get_listener_router_endpoint_specs()
        self.assertIn("route_type_check", specs)
        self.assertNotIn("route_get_notifications", specs)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
