import os
from datetime import datetime
from pathlib import Path

from setta.code_gen.export_selected import (
    export_selected,
    get_gen_code_template_var,
    get_section_type,
    get_selected_section_variant,
)
from setta.code_gen.find_placeholders import template_prefix
from setta.code_gen.python.generate_code import (
    convert_var_names_to_readable_form,
    generate_code,
)
from setta.code_gen.utils import process_refs
from setta.utils.constants import (
    CODE_FOLDER,
    CODE_FOLDER_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
)
from setta.utils.utils import prune_dict


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    exporter_obj = export_selected(
        p, always_export_args_objs=False, force_include_template_var=True
    )
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code_dict = generate_final_code_for_sections(
        p,
        exporter_obj,
        folder_path,
        do_prepend_with_setup_code=True,
        do_convert_var_names_to_readable_form=True,
    )

    print("runCodeBlocks", p["runCodeBlocks"], flush=True)
    section_dependencies = {k: v["section_dependencies"] for k, v in code_dict.items()}
    section_dependencies = prune_dict(section_dependencies, p["runCodeBlocks"])

    to_write = topological_sort(section_dependencies)
    id_to_relpath = {}
    for sid in to_write:
        curr_code = code_dict[sid]
        rel_path = write_code_to_file(
            folder_path, curr_code["name"], curr_code["code"], curr_code["codeLanguage"]
        )
        id_to_relpath[sid] = rel_path

    # Only run code that isn't referenced by other code
    run_order = [
        x for x in to_write if all(x not in y for y in section_dependencies.values())
    ]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        rel_path = create_wrapper_bash_script(folder_path, run_order, code_dict)
        command = codeCallStr(rel_path, "bash")
    else:
        sid = run_order[0]
        command = codeCallStr(id_to_relpath[sid], code_dict[sid]["codeLanguage"])

    if terminal_write_fn:
        terminal_write_fn(f"\x15{command}\n")
    elif command_callback:
        command_callback(command)


def generate_final_code_for_sections(
    p,
    exporter_obj,
    folder_path,
    do_prepend_with_setup_code=False,
    do_convert_var_names_to_readable_form=False,
    push_var_name=None,
):
    code_sections = {
        k: v for k, v in p["sections"].items() if get_section_type(p, k) == C.CODE
    }

    code_gen_template_var_section_details = (
        exporter_obj.code_gen_template_var_section_details
    )

    if (
        exporter_obj.force_include_template_var
        and code_gen_template_var_section_details["section"]["id"] is None
    ):
        code_sections[None] = code_gen_template_var_section_details["section"]

    code_dict = {}
    for s in code_sections.values():
        if s["id"] is None:
            section_variant = code_gen_template_var_section_details["sectionVariant"]
        else:
            section_variant = get_selected_section_variant(p, s["id"])

        print("section_variant", section_variant, flush=True)

        (
            curr_code,
            curr_section_dependencies,
            curr_var_name_to_position_dict,
            curr_ref_template_var_positions,
            curr_keyword_to_replacement_value,
        ) = generate_final_code_for_section(
            code=section_variant["code"],
            codeLanguage=s["codeLanguage"],
            evRefs=section_variant["evRefs"],
            templateVars=section_variant["templateVars"],
            exporter_obj=exporter_obj,
            folder_path=folder_path,
            projectConfigName=p["projectConfig"]["name"],
            do_prepend_with_setup_code=do_prepend_with_setup_code,
            do_convert_var_names_to_readable_form=do_convert_var_names_to_readable_form,
            push_var_name=push_var_name,
        )

        is_gen_code = bool(get_gen_code_template_var(section_variant["templateVars"]))
        code_dict[s["id"]] = {
            "name": s["name"],
            "code": curr_code,
            "codeLanguage": s["codeLanguage"],
            "var_name_to_position_dict": curr_var_name_to_position_dict,
            "ref_template_var_positions": curr_ref_template_var_positions,
            "keyword_to_replacement_value": curr_keyword_to_replacement_value,
            "section_dependencies": curr_section_dependencies,
            "is_gen_code": is_gen_code,
        }

    return code_dict


def generate_final_code_for_section(
    code,
    codeLanguage,
    evRefs,
    templateVars,
    exporter_obj,
    folder_path,
    projectConfigName=None,
    do_prepend_with_setup_code=False,
    do_convert_var_names_to_readable_form=False,
    cursor_position=None,
    template_var_replacement_values=None,
    push_var_name=None,
):
    section_dependencies = []
    var_name_to_position_dict = {}
    setup_code = ""
    if template_var_replacement_values is None:
        template_var_replacement_values = {}

    (code, ref_template_var_positions, keyword_to_replacement_value) = process_refs(
        code,
        evRefs,
        exporter_obj.get_ref_var_name,
        cursor_position=cursor_position,
        templateVars=templateVars,
        get_template_var_replacement_value=get_template_var_replacement_value_fn(
            exporter_obj,
            folder_path,
            section_dependencies,
            var_name_to_position_dict,
            template_var_replacement_values,
            push_var_name,
        ),
    )

    if do_prepend_with_setup_code:
        code, setup_code = prepend_with_setup_code(
            code,
            codeLanguage,
            folder_path,
            projectConfigName,
        )

    if do_convert_var_names_to_readable_form:
        code = convert_var_names_to_readable_form(
            code,
            var_name_to_position_dict.get(
                template_prefix(C.SETTA_GENERATED_PYTHON), {}
            ),
            exporter_obj,
            ref_template_var_positions["refs"],
            setup_code,
        )

    return (
        code,
        section_dependencies,
        var_name_to_position_dict,
        ref_template_var_positions,
        keyword_to_replacement_value,
    )


def get_template_var_replacement_value_fn(
    exporter_obj,
    folder_path,
    section_dependencies,
    var_name_to_position_dict,
    template_var_replacement_values,
    push_var_name,
):
    def get_template_var_replacement_value(code, template_var):
        print("get_template_var_replacement_value", template_var, flush=True)
        keyword = template_var["keyword"]
        if keyword in template_var_replacement_values:
            return template_var_replacement_values[keyword]
        elif keyword == template_prefix(C.SETTA_GENERATED_PYTHON):
            code_before_template_var = code[: template_var["startPos"]]
            code, var_name_to_position = generate_code(
                exporter_obj.output,
                code_before_template_var,
                push_var_name,
            )
            var_name_to_position_dict[keyword] = {
                k: (v[0] + len(code_before_template_var), v[1])
                for k, v in var_name_to_position.items()
            }
            return code
        else:
            section_dependencies.append(template_var["sectionId"])
            module_path = convert_folder_path_to_module_path(folder_path)
            keyword = keyword.lstrip(C.TEMPLATE_PREFIX)
            return f"{module_path}.{keyword}"

    return get_template_var_replacement_value


def convert_folder_path_to_module_path(folder_path):
    return str(os.path.relpath(folder_path)).replace("/", ".").replace("\\", ".")


def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(x):
    return {"python": "python", "bash": "bash"}[x]


def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = folder_path / f"{filename}{extension}"
    return os.path.relpath(output).replace(os.sep, "/")


def codeCallStr(filepath, codeLanguage):
    return f"{languageToCall(codeLanguage)} {filepath}"


def create_wrapper_bash_script(folder_path, run_order, code_dict):
    bash_script = ""
    for sid in run_order:
        curr_code = code_dict[sid]
        codePath = codePathStr(
            folder_path, curr_code["name"], curr_code["codeLanguage"]
        )
        bash_script += f'{codeCallStr(codePath, curr_code["codeLanguage"])}\n'
    return write_code_to_file(folder_path, "SETTA_ENTRY", bash_script, "bash")


def topological_sort(objects):
    graph = {id: refs for id, refs in objects.items()}
    visiting, visited = set(), set()
    order = []

    def dfs(node):
        if node in visiting:
            raise ValueError("Circular reference detected")
        if node not in visited:
            visiting.add(node)
            for neighbour in graph[node]:
                dfs(neighbour)
            visiting.remove(node)
            visited.add(node)
            order.append(node)

    for id in objects.keys():
        if id not in visited:
            dfs(id)

    return order[::-1]


def create_timestamped_folder(base_dir, prefix=""):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"_{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = Path(base_dir) / folder_name

    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
        except FileExistsError:
            pass

    return folder_path


def write_code_to_file(folder_path, filename, code, codeLanguage):
    extension = languageToExtension(codeLanguage)
    filepath = write_string_to_file(folder_path, f"{filename}{extension}", code)
    return os.path.relpath(filepath).replace(os.sep, "/")


def write_string_to_file(folder, filename, content):
    # Full path to the file
    file_path = os.path.join(folder, filename)
    # Write the content to the file
    with open(file_path, "w") as file:
        file.write(content)
    return file_path


def prepend_with_setup_code(code, codeLanguage, folder_path, project_config_name):
    setup_code = ""
    if codeLanguage == "python":
        location = f"/{project_config_name}"
        setup_code = (
            "import sys\n"
            "import os\n"
            "from pathlib import Path\n"
            "sys.path.append(str(Path(__file__).parent.parent.parent))\n"
            f"os.environ['{SEND_ARTIFACT_TO_ENV_VARIABLE}'] = '{location}'\n"
            f"os.environ['{CODE_FOLDER_ENV_VARIABLE}'] = '{folder_path}'\n"
        )
        code = setup_code + code
    return code, setup_code
