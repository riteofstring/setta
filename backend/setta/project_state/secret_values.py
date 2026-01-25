from setta.types.code_obj_impls import PasswordParamCodeObjImpl
from setta.types.project_state import ProjectStateCore


def strip_password_values(project_state: ProjectStateCore) -> None:
    for impl_id, impl in project_state.codeObjImpls.items():
        if not isinstance(impl, PasswordParamCodeObjImpl):
            continue
        if impl.value == "" and impl.defaultVal == "":
            continue
        project_state.codeObjImpls[impl_id] = impl.model_copy(
            update={"value": "", "defaultVal": ""}
        )
