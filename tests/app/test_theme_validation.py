from setta.app.definition_diagnostics import collect_app_theme_validation_issues


def test_collect_app_theme_validation_issues_accepts_motion_tokens() -> None:
    errors, warnings = collect_app_theme_validation_issues(
        {
            "motion": {
                "durationMs": 480,
                "delayMs": 12,
                "staggerMs": 90,
                "easing": "linear",
            }
        }
    )

    assert errors == []
    assert warnings == []


def test_collect_app_theme_validation_issues_accepts_typography_tokens() -> None:
    errors, warnings = collect_app_theme_validation_issues(
        {
            "typography": {
                "bodySize": 15,
                "bodyLineHeight": 1.6,
                "headingLineHeight": 1.15,
                "headingSizes": {"h2": 40, "h3": "1.25rem"},
            }
        }
    )

    assert errors == []
    assert warnings == []


def test_collect_app_theme_validation_issues_reports_invalid_mode() -> None:
    errors, warnings = collect_app_theme_validation_issues({"mode": "nope"})

    assert warnings == []
    assert errors
    assert any("theme.mode" in issue.message for issue in errors)


def test_collect_app_theme_validation_issues_warns_on_unknown_keys() -> None:
    errors, warnings = collect_app_theme_validation_issues({"unknownKey": "value"})

    assert errors == []
    assert warnings
    assert any("unknown keys" in issue.message.lower() for issue in warnings)
