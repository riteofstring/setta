from setta.secrets.password_store import get_password_secret
from setta.types.code_obj_impls import PasswordParamCodeObjImpl
from setta.types.project_state import ProjectStateCore


def strip_password_values(project_state: ProjectStateCore) -> None:
    for impl_id, impl in project_state.codeObjImpls.items():
        if not isinstance(impl, PasswordParamCodeObjImpl):
            continue
        has_secret = get_password_secret(str(impl.id)) != ""
        if impl.value == "" and impl.defaultVal == "" and impl.hasSecret == has_secret:
            continue
        project_state.codeObjImpls[impl_id] = impl.model_copy(
            update={"value": "", "defaultVal": "", "hasSecret": has_secret}
        )
