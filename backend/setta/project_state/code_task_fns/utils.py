import asyncio
import re

from setta.utils.utils import multireplace


def send_document_open_request_with_diagnostics_with_code_dict(
    lsp_writer,
    code_dict,
    exporter_obj,
    projectConfigName,
):
    for codeSectionId, details in code_dict.items():
        if details["codeLanguage"] != "python":
            continue
        asyncio.create_task(
            send_document_open_request_with_diagnostics(
                lsp_writer,
                details["code"],
                exporter_obj,
                details["ref_template_var_positions"],
                projectConfigName,
                details["sanitized_full_name"],
                codeSectionId,
            )
        )


async def send_document_open_request_with_diagnostics(
    lsp_writer,
    code,
    exporter_obj,
    ref_template_var_positions,
    projectConfigName,
    sectionName,
    codeSectionId,
):
    code_id = lsp_writer.construct_code_id(
        projectConfigName,
        sectionName,
    )
    await lsp_writer.send_document_open_request(
        code_id=code_id,
        code=code,
        codeJson=exporter_obj.output if exporter_obj else None,
        ref_template_var_positions=ref_template_var_positions,
        needsDiagnostics=True,
        projectConfigId=exporter_obj.p["projectConfig"]["id"],
        codeSectionId=codeSectionId,
    )

    return code_id


# generate valid variable names because for example $SETTA_GENERATED_PYTHON is not valid
def replace_template_vars_with_random_names(candidateTemplateVars, fullText):
    var_name_mapping = {}
    reverse_var_name_mapping = {}
    keyword_to_pos = {}
    for keyword, pos in candidateTemplateVars:
        new_keyword = generate_unique_variable(fullText, keyword)
        var_name_mapping[keyword] = new_keyword
        reverse_var_name_mapping[new_keyword] = keyword
        # we only need 1 position of the keyword, even if there are multiple positions
        keyword_to_pos[keyword] = pos

    code = multireplace(fullText, var_name_mapping)
    return code, list(keyword_to_pos.values()), reverse_var_name_mapping


def find_candidate_template_vars(template_var_regex_state, section_id, value):
    output = []
    template_vars_regex = template_var_regex_state["pattern"]
    full_name_to_section_id = template_var_regex_state["full_name_to_section_id"]

    match = template_vars_regex.search(value)
    while match:
        # don't allow self-references
        if full_name_to_section_id[match.group(0)] != section_id:
            output.append([match.group(0), match.start()])

        match = template_vars_regex.search(value, match.start() + 1)

    return output


def escape_reg_exp(string):
    return re.sub(r"[.*+?^${}()|[\]\\]", r"\\\g<0>", string)
