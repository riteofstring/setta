from setta.utils.launcher_origin_handoff import (
    append_launcher_origin_handoff_to_bootstrap_url,
    mint_launcher_origin_handoff_proof,
    normalize_launcher_origin,
    validate_launcher_origin_handoff_proof,
)


def test_normalize_launcher_origin_accepts_http_https_origins() -> None:
    assert (
        normalize_launcher_origin("http://127.0.0.1:8000/path")
        == "http://127.0.0.1:8000"
    )
    assert normalize_launcher_origin("https://example.com") == "https://example.com"


def test_normalize_launcher_origin_rejects_invalid_values() -> None:
    assert normalize_launcher_origin("javascript:alert(1)") is None
    assert normalize_launcher_origin("  ") is None
    assert normalize_launcher_origin(None) is None


def test_launcher_origin_handoff_proof_roundtrip() -> None:
    secret = b"super-secret"
    session_id = "abc123"
    launcher_origin = "http://127.0.0.1:8000"
    proof = mint_launcher_origin_handoff_proof(
        session_id=session_id,
        launcher_origin=launcher_origin,
        secret=secret,
    )

    assert validate_launcher_origin_handoff_proof(
        session_id=session_id,
        launcher_origin=launcher_origin,
        proof=proof,
        secret=secret,
    )
    assert not validate_launcher_origin_handoff_proof(
        session_id=session_id,
        launcher_origin="http://127.0.0.1:9000",
        proof=proof,
        secret=secret,
    )


def test_append_launcher_origin_handoff_to_bootstrap_url() -> None:
    bootstrap_url = "http://127.0.0.1:61234/__setta__/bootstrap#token=tok"
    updated = append_launcher_origin_handoff_to_bootstrap_url(
        bootstrap_url_fragment=bootstrap_url,
        launcher_origin="http://127.0.0.1:8000",
        proof="signed-proof",
    )

    assert "token=tok" in updated
    assert "lo=http%3A%2F%2F127.0.0.1%3A8000" in updated
    assert "lop=signed-proof" in updated
