from dataclasses import dataclass

from setta.routers.status import route_get_server_mode


@dataclass(slots=True)
class _StateStub:
    share_mode: bool = False
    app_mode: bool = False
    launcher_mode: bool = False


def test_route_get_server_mode_returns_ide() -> None:
    response = route_get_server_mode(_StateStub())
    assert response.mode == "ide"


def test_route_get_server_mode_returns_share() -> None:
    response = route_get_server_mode(_StateStub(share_mode=True, app_mode=False))
    assert response.mode == "share"


def test_route_get_server_mode_returns_app() -> None:
    response = route_get_server_mode(_StateStub(share_mode=True, app_mode=True))
    assert response.mode == "app"


def test_route_get_server_mode_returns_launcher() -> None:
    response = route_get_server_mode(_StateStub(launcher_mode=True))
    assert response.mode == "launcher"
