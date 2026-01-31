from setta.types.id import ID
from setta.types.project_config import ProjectConfig, TopLevelSectionLayout, Viewport


def test_viewport_initialized_defaults_false_when_viewport_is_none():
    config = ProjectConfig(viewport=None)

    assert config.viewportInitialized is False


def test_viewport_initialized_defaults_false_for_default_viewport_with_sections():
    config = ProjectConfig(
        viewport=Viewport(),
        topLevelSections={ID("section"): TopLevelSectionLayout(x=0, y=0)},
    )

    assert config.viewportInitialized is False


def test_viewport_initialized_defaults_true_for_default_viewport_without_sections():
    config = ProjectConfig(viewport=Viewport())

    assert config.viewportInitialized is True


def test_viewport_initialized_defaults_true_for_non_default_viewport():
    config = ProjectConfig(viewport=Viewport(x=12, y=-5, zoom=1.25))

    assert config.viewportInitialized is True


def test_viewport_initialized_respects_explicit_value():
    config = ProjectConfig(
        viewport=Viewport(),
        viewportInitialized=True,
        topLevelSections={ID("section"): TopLevelSectionLayout(x=0, y=0)},
    )

    assert config.viewportInitialized is True
