from setta.types.generated.go_shared_types import ProjectConfig, Viewport


def test_viewport_initialized_defaults_false_when_unset():
    config = ProjectConfig()

    assert config.viewportInitialized is False


def test_viewport_initialized_defaults_false_with_explicit_viewport():
    config = ProjectConfig(viewport=Viewport(x=12, y=-5, zoom=1.25))

    assert config.viewportInitialized is False


def test_viewport_initialized_respects_explicit_value():
    config = ProjectConfig(viewport=Viewport(), viewportInitialized=True)

    assert config.viewportInitialized is True
