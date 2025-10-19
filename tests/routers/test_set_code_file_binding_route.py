import unittest
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient
from setta.project_state.project_manager_types import SetCodeFileBindingRequest
from setta.routers.project_manager import router as project_manager_router
from setta.types.routes import Route


class _StubManager:
    def __init__(self):
        self.calls = []

    async def set_code_file_binding(self, request):
        self.calls.append(request)


class _StubSwitcher:
    def __init__(self, manager: _StubManager):
        self.manager = manager
        self.requested_ids: list[str] = []

    def get(self, project_identifier: str):
        self.requested_ids.append(project_identifier)
        return self.manager


class RouteSetCodeFileBindingTests(unittest.TestCase):
    def setUp(self):
        self.manager = _StubManager()
        self.switcher = _StubSwitcher(self.manager)
        self.app = FastAPI()
        self.app.include_router(project_manager_router, prefix=Route.PREFIX.value)
        self.app.state.setta = SimpleNamespace(
            project_manager_switcher=self.switcher,
        )
        self.client = TestClient(self.app)

    def test_route_invokes_manager(self):
        payload = {
            "projectConfigId": "config-123",
            "sectionId": "section-456",
            "canonicalPath": "/tmp/custom/path.py",
            "accessMode": "read_write",
        }
        response = self.client.post(
            f"{Route.PREFIX.value}{Route.SET_CODE_FILE_BINDING.value}", json=payload
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.switcher.requested_ids, ["config-123"])
        self.assertEqual(len(self.manager.calls), 1)
        request = self.manager.calls[0]
        self.assertIsInstance(request, SetCodeFileBindingRequest)
        self.assertEqual(request.projectConfigId, payload["projectConfigId"])
        self.assertEqual(request.sectionId, payload["sectionId"])
        self.assertEqual(str(request.canonicalPath), payload["canonicalPath"])
        self.assertEqual(request.accessMode.value, payload["accessMode"])
