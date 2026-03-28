from setta.code_gen.utils import GEN_CODE_CLASS_NAME, GEN_CODE_INSTANCE_NAME
from setta.types.generated.go_shared_types import (
    ProjectConfig,
    ProjectCodegenLanguage,
)


def test_project_config_defaults_python_codegen_target() -> None:
    config = ProjectConfig()

    assert len(config.codegenTargets) == 1
    target = config.codegenTargets[0]
    assert target.language == ProjectCodegenLanguage.python
    assert target.genCodePrefix == ""
    assert target.genCodeSuffix == f"{GEN_CODE_INSTANCE_NAME} = {GEN_CODE_CLASS_NAME}()"
    assert target.generateMetadata is False
    assert target.sectionPolicy.allowlist is not None
    assert target.codeObjValuePolicy.typePolicies
