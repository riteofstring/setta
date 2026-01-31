from setta.secrets.password_store import read_password_store
from setta.types.code_obj_impls import PasswordParamCodeObjImpl
from setta.types.project_state import ProjectStateCore


def strip_password_values(project_state: ProjectStateCore) -> None:
    password_secrets = read_password_store()
    for impl_id, impl in project_state.codeObjImpls.items():
        if not isinstance(impl, PasswordParamCodeObjImpl):
            continue
        secret_key = str(impl.id)
        has_secret = False
        if secret_key in password_secrets:
            has_secret = password_secrets[secret_key] != ""
        if impl.value == "" and impl.defaultVal == "" and impl.hasSecret == has_secret:
            continue
        project_state.codeObjImpls[impl_id] = impl.model_copy(
            update={"value": "", "defaultVal": "", "hasSecret": has_secret}
        )
