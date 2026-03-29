from setta.secrets.password_store import read_password_store
from setta.types.code_obj_impls import PasswordParamCodeObjImpl
from setta.types.project_state import ProjectStateCore


def strip_password_values(
    project_state: ProjectStateCore,
    *,
    force_has_secret: bool | None = None,
) -> None:
    password_secrets: dict[str, str] | None = None
    if force_has_secret is None:
        password_secrets = read_password_store()
    for impl_id, impl in project_state.codeObjImpls.items():
        if not isinstance(impl, PasswordParamCodeObjImpl):
            continue
        if force_has_secret is None:
            if password_secrets is None:
                raise KeyError("Missing password secrets for strip_password_values")
            secret_key = str(impl.id)
            has_secret = False
            if secret_key in password_secrets:
                has_secret = password_secrets[secret_key] != ""
        else:
            has_secret = force_has_secret
        if impl.value == "" and impl.defaultVal == "" and impl.hasSecret == has_secret:
            continue
        project_state.codeObjImpls[impl_id] = impl.model_copy(
            update={"value": "", "defaultVal": "", "hasSecret": has_secret}
        )
