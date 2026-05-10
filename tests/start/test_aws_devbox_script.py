import importlib.util
from pathlib import Path


def _load_aws_devbox_module():
    module_path = Path(__file__).resolve().parents[2] / "scripts" / "aws_devbox.py"
    spec = importlib.util.spec_from_file_location("setta_aws_devbox_script", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_resolve_repo_checkout_path_prefers_env(monkeypatch) -> None:
    module = _load_aws_devbox_module()
    monkeypatch.setenv("SETTA_AWS_DEVBOX_REPO_CHECKOUT_PATH", "/remote/from-env")

    tf_outputs = module.TerraformOutputs(
        region="us-east-1",
        instance_id="i-123",
        instance_name="setta-devbox",
        repo_checkout_path="/remote/from-terraform",
        discovery_tags={},
        default_ports={},
    )

    assert module.resolve_repo_checkout_path(tf_outputs) == "/remote/from-env"
