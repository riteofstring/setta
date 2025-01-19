import copy

from setta.code_gen.export_selected import get_specific_template_var
from setta.code_gen.find_placeholders import tp
from setta.utils.constants import C


async def maybe_validate_imports_and_update_code(
    code, ref_template_var_positions, lsp_writers
):
    templateVars = ref_template_var_positions["templateVars"]
    generated_imports_info, idx = get_specific_template_var(
        templateVars, tp(C.SETTA_GENERATED_PYTHON_IMPORTS), return_index=True
    )
    if not generated_imports_info:
        return code, ref_template_var_positions
    old_value = generated_imports_info["value"]
    new_value, did_change = await validate_imports(old_value, lsp_writers)
    if not did_change:
        return code, ref_template_var_positions

    # this shouldn't happen
    if len(new_value) != len(old_value):
        print("new imports have different length from old imports", flush=True)
        return code, ref_template_var_positions

    ref_template_var_positions = copy.deepcopy(ref_template_var_positions)
    generated_imports_info = ref_template_var_positions[idx]
    generated_imports_info["value"] = new_value
    startPos = generated_imports_info["startPos"]
    endPos = generated_imports_info["startPos"] + len(new_value)
    code = code[:startPos] + new_value + code[endPos:]
    return code, ref_template_var_positions


async def validate_imports(generated_imports, lsp_writers):
    if not generated_imports:
        return generated_imports, False

    # await lsp_writers["full"].send_document_open_request(
    #     code_id=code_id,
    #     code=code,
    #     codeJson=exporter_obj.output if exporter_obj else None,
    #     is_gen_code=is_gen_code,
    # )

    return generated_imports, False
