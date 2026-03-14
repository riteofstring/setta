from setta import dev_start


def test_dev_start_main_injects_reload_for_source_workflows(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = list(argv)
        return 0

    monkeypatch.setattr(dev_start, "run_go_dispatch", fake_run_go_dispatch)

    exit_code = dev_start.main(
        [
            "--workspace",
            "/tmp/workspace",
            "--setta-home",
            "/tmp/.setta-development",
            "--no-open",
        ]
    )

    assert exit_code == 0
    assert captured["argv"] == [
        "--reload",
        "--workspace",
        "/tmp/workspace",
        "--setta-home",
        "/tmp/.setta-development",
        "--no-open",
    ]


def test_dev_start_main_preserves_explicit_reload(monkeypatch) -> None:
    captured: dict[str, object] = {}

    def fake_run_go_dispatch(argv: list[str]) -> int:
        captured["argv"] = list(argv)
        return 7

    monkeypatch.setattr(dev_start, "run_go_dispatch", fake_run_go_dispatch)

    exit_code = dev_start.main(
        [
            "--reload",
            "--workspace",
            "/tmp/workspace",
            "--setta-home",
            "/tmp/.setta-development",
        ]
    )

    assert exit_code == 7
    assert captured["argv"] == [
        "--reload",
        "--workspace",
        "/tmp/workspace",
        "--setta-home",
        "/tmp/.setta-development",
    ]
