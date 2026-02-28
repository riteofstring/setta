import os

from tests.utils.integration_env import (
    load_repo_dot_env_keys,
    seed_env_from_repo_dot_env,
)


def test_load_repo_dot_env_keys_reads_requested_values(tmp_path) -> None:
    dot_env_path = tmp_path / ".env"
    dot_env_path.write_text(
        "OPENAI_API_KEY=openai-secret\n"
        'ANTHROPIC_API_KEY="anthropic-secret"\n'
        "UNRELATED_TOKEN=ignore-me\n",
        encoding="utf-8",
    )

    loaded = load_repo_dot_env_keys(
        ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"),
        dot_env_path=dot_env_path,
    )

    assert loaded == {
        "OPENAI_API_KEY": "openai-secret",
        "ANTHROPIC_API_KEY": "anthropic-secret",
    }


def test_load_repo_dot_env_keys_ignores_missing_and_blank_values(tmp_path) -> None:
    dot_env_path = tmp_path / ".env"
    dot_env_path.write_text(
        "OPENAI_API_KEY=   \n"
        "ANTHROPIC_API_KEY=\n",
        encoding="utf-8",
    )

    loaded = load_repo_dot_env_keys(
        ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"),
        dot_env_path=dot_env_path,
    )

    assert loaded == {}


def test_seed_env_from_repo_dot_env_preserves_existing_env(
    tmp_path,
    monkeypatch,
) -> None:
    dot_env_path = tmp_path / ".env"
    dot_env_path.write_text(
        "OPENAI_API_KEY=file-openai\n"
        "ANTHROPIC_API_KEY=file-anthropic\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("OPENAI_API_KEY", "existing-openai")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    seed_env_from_repo_dot_env(
        ("OPENAI_API_KEY", "ANTHROPIC_API_KEY"),
        dot_env_path=dot_env_path,
    )

    assert os.environ["OPENAI_API_KEY"] == "existing-openai"
    assert os.environ["ANTHROPIC_API_KEY"] == "file-anthropic"
