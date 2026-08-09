import setta.utils.generate_memorable_string as memorable_mod
from setta.types.generated import go_shared_constants


def test_generate_memorable_string_uses_go_owned_word_lists(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        go_shared_constants,
        "MEMORABLE_NAME_ADJECTIVES",
        ("go-adjective",),
    )
    monkeypatch.setattr(
        go_shared_constants,
        "MEMORABLE_NAME_NOUNS",
        ("go-noun",),
    )
    monkeypatch.setattr(
        go_shared_constants,
        "MEMORABLE_NAME_VERBS",
        ("go-verb",),
    )

    choices = iter(
        [
            ("go-adjective",),
            "go-adjective",
            ("go-adjective",),
            "go-adjective",
            ("go-noun",),
            "go-noun",
        ]
    )
    monkeypatch.setattr(memorable_mod.random, "choice", lambda _seq: next(choices))

    assert memorable_mod.generate_memorable_string() == "go-adjective_go-noun"
