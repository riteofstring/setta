import random
import string

from setta.code_gen.create_runnable_scripts import generate_final_code_for_sections
from setta.code_gen.export_selected import export_selected, get_gen_code_template_var
from setta.code_gen.find_placeholders import tp
from setta.code_gen.python.check_scope import are_positions_in_scope_with_variable
from setta.database.utils import create_new_id
from setta.project_state.code_preview import CodePreview
from setta.utils.constants import C
from setta.utils.utils import multireplace


class SectionPerspectiveCodeGenerator:
    def __init__(self, sectionId, lsp_writers, websocket_msg_handler, temp_folder):
        self.sectionId = sectionId
        self.lsp_writers = lsp_writers
        self.websocket_msg_handler = websocket_msg_handler
        self.temp_folder = temp_folder
        self.project_state = None
        self.ev_ref_regex = None
        self.full_name_to_info = {}
        self.info_to_full_name = {}
        self.code_previews = {}
        self.text_field_cache = {}

    def update(self, project_state, ev_ref_regex, full_name_to_info, info_to_full_name):
        self.project_state = project_state
        self.ev_ref_regex = ev_ref_regex
        self.full_name_to_info = full_name_to_info
        self.info_to_full_name = info_to_full_name
        self.text_field_cache.clear()

    async def text_field_initialize(self, paramInfoId):
        print("*************text_field_initialize\n\n\n", flush=True)
        exporter_obj = export_selected(
            self.project_state,
            always_export_args_objs=True,
            force_include_template_var=True,
        )
        var_name = exporter_obj.var_name_mapping[(self.sectionId, paramInfoId, False)]
        projectConfigName = self.project_state["projectConfig"]["name"]
        project_temp_folder = self.temp_folder / projectConfigName
        code_dict = await generate_final_code_for_sections(
            self.project_state,
            exporter_obj,
            lsp_writers=self.lsp_writers,
            folder_path=project_temp_folder,
            push_var_name=var_name,
        )
        self.code_previews = {
            k: v for k, v in self.code_previews.items() if k in code_dict
        }
        for k, v in code_dict.items():
            if k not in self.code_previews:
                self.code_previews[k] = CodePreview(
                    k, self.lsp_writers, self.websocket_msg_handler, project_temp_folder
                )
            await self.code_previews[k].update(self.project_state, v)

        gen_code_section_details = exporter_obj.code_gen_template_var_section_details[
            "section"
        ]
        gen_code_dict = code_dict[gen_code_section_details["id"]]
        var_name_to_decl_position = gen_code_dict["var_name_to_decl_rel_position_dict"][
            tp(C.SETTA_GENERATED_PYTHON)
        ]
        pushed_var_name_position = var_name_to_decl_position[var_name]
        generated_var_names = list(var_name_to_decl_position.keys())
        referencable_var_names = [
            self.info_to_full_name[exporter_obj.var_name_reverse_mapping[v]]
            for v, (startPos, _, _) in var_name_to_decl_position.items()
            if startPos < pushed_var_name_position[0]
        ]

        self.text_field_cache[paramInfoId] = TextFieldCache(
            gen_code_dict=gen_code_dict,
            var_name=var_name,
            referencable_var_names=referencable_var_names,
            generated_var_names=generated_var_names,
            exporter_obj=exporter_obj,
        )

    async def text_field_autocomplete(self, messageId, paramInfoId, fullText, position):
        print("*************text_field_autocomplete\n\n\n", flush=True)
        if paramInfoId not in self.text_field_cache:
            await self.text_field_initialize(paramInfoId)
            ev_ref_finder
        await self.get_code_and_cursor_position(paramInfoId, fullText)
        

    def delete_temp_files(self):
        for v in self.code_previews.values():
            v.delete_temp_file()


class TextFieldCache:
    def __init__(
        self,
        gen_code_dict,
        var_name,
        referencable_var_names,
        generated_var_names,
        exporter_obj,
    ):
        self.gen_code_dict = gen_code_dict
        self.var_name = var_name
        self.referencable_var_names = referencable_var_names
        self.generated_var_names = generated_var_names
        self.exporter_obj = exporter_obj
        self.ev_ref_finder = 


def ev_ref_does_not_refer_to_self(
    full_name_to_info, keyword, section_id, param_info_id
):
    return not (
        (
            full_name_to_info[keyword]["section_id"] == section_id
            and not full_name_to_info[keyword]["param_info_id"]
        )
        or (
            full_name_to_info[keyword]["section_id"] == section_id
            and full_name_to_info[keyword]["param_info_id"] == param_info_id
        )
    )


def filter_candidates_by_scope(
    candidateEVRefs, fullText, onlyAfterGenCodeTemplateVar, templateVars
):
    if not onlyAfterGenCodeTemplateVar:
        return candidateEVRefs
    matching_template_var = get_gen_code_template_var(templateVars)
    if matching_template_var is None:
        return []

    fullText, the_special_var_name = prepare_code_for_scope_checking(
        fullText, templateVars, matching_template_var
    )

    response = are_positions_in_scope_with_variable(
        fullText, [x[1] for x in candidateEVRefs], the_special_var_name
    )

    return [x for idx, x in enumerate(candidateEVRefs) if response[idx]]


def generate_code_for_reference_finding(
    candidateEVRefs, fullText, onlyAfterGenCodeTemplateVar, templateVars
):
    position_offset = 0

    if onlyAfterGenCodeTemplateVar:
        matching_template_var = get_gen_code_template_var(templateVars)
        if matching_template_var is None:
            return "", position_offset, 0
        # If SETTA_GENERATED_PYTHON is present, we only want to consider
        # code that comes after it.
        startPos = matching_template_var["startPos"]
        keyword = matching_template_var["keyword"]
        endPos = startPos + len(keyword)
        template_str_len = endPos - startPos
        before_text = fullText[:startPos]
        fullText = fullText[endPos:]
        position_offset -= len(before_text) + template_str_len

    output = []
    var_name_mapping = {}
    visited_keywords = set()
    for keyword, _ in candidateEVRefs:
        # candidateEVRefs might contain multiple suggestions to the same keyword
        # like in the case of fn(a=a), it'll suggest "a" in two positions
        # but we only need to write the a=None declaration once
        # so we keep track of keywords we've already visited
        if keyword in visited_keywords:
            continue
        visited_keywords.add(keyword)
        # Replace reference names like
        # list_of_models[0]
        # with a random valid variable name of the same length.
        # If "[" is ever in the keyword,
        # we know it will have a length of at least 4, e.g. x[0] has 4 characters.
        # So we don't have to worry about clashes.
        if "[" in keyword:
            new_keyword = generate_unique_variable(fullText, keyword)
            var_name_mapping[keyword] = new_keyword
            keyword = new_keyword
        output.append(f"{keyword}=None")

    output = "\n".join(output)
    # the plus 1 is for the newline between output and fullText
    position_offset += len(output) + 1
    if len(var_name_mapping) > 0:
        fullText = multireplace(fullText, var_name_mapping)
    return f"{output}\n{fullText}", position_offset, len(visited_keywords)


def generate_unique_variable(code, keyword):
    length = len(keyword)
    chars = string.ascii_lowercase + string.digits + "_"

    while True:
        # Ensure the variable starts with a letter or underscore
        new_var = random.choice(string.ascii_lowercase + "_")
        # Fill the rest with random characters
        new_var += "".join(random.choice(chars) for _ in range(length - 1))

        if new_var.isidentifier() and new_var not in code:
            return new_var


def prepare_code_for_scope_checking(fullText, templateVars, target_template_var):
    the_special_var_name = None
    for t in templateVars:
        startPos = t["startPos"]
        keyword = t["keyword"]
        endPos = startPos + len(keyword)
        if t is target_template_var:
            # need to assign something to the replacement variable so that ast considers it a variable
            decl = "=None"
            # the [:-len(decl)] is to keep the full declaration the same length as the original keyword
            the_special_var_name = generate_unique_variable(fullText, keyword)[
                : -len(decl)
            ]
            replacement = the_special_var_name + decl
        else:
            # variable assignment not necessary for the keywords that we don't care about
            replacement = generate_unique_variable(fullText, keyword)
        fullText = fullText[:startPos] + replacement + fullText[endPos:]

    return fullText, the_special_var_name




# alternate approach:
# S.model.args

import math
from transformers import Trainer

class S:
    def __init__(self):
        x = 5
        self.result = Trainer()


math.sqrt()