import os
from pathlib import Path
from datetime import datetime

from setta.code_gen.export_selected import (
    export_selected,
    get_section_code,
    get_section_type,
    get_selected_section_variant,
)
from setta.code_gen.find_placeholders import (
    needs_generated_python,
    needs_yaml,
    template_prefix,
)
from setta.code_gen.python.generate_code import (
    convert_var_names_to_readable_form,
    generate_code,
    replace_keywords,
)
from setta.code_gen.utils import process_refs
from setta.utils.constants import (
    CODE_FOLDER,
    CODE_FOLDER_ENV_VARIABLE,
    SEND_ARTIFACT_TO_ENV_VARIABLE,
    C,
)


def runCode(message, terminal_write_fn=None, command_callback=None):
    p = message["content"]
    exporter_obj = export_selected(p, always_export_args_objs=False)
    folder_path = create_timestamped_folder(CODE_FOLDER)

    code_sections = {
        k: v for k, v in p["sections"].items() if get_section_type(p, k) == C.CODE
    }
    section_dependencies = {}
    for s in code_sections.values():
        section_variant = get_selected_section_variant(p, s["id"])
        (
            section_variant["code"],
            curr_section_dependencies,
        ) = generate_final_code_for_section(
            section_variant["code"],
            s["codeLanguage"],
            section_variant["evRefs"],
            code_sections,
            exporter_obj,
            folder_path=folder_path,
            do_prepend_with_setup_code=True,
            projectConfigName=p["projectConfig"]["name"],
        )
        section_dependencies[s["id"]] = curr_section_dependencies

    to_write = topological_sort(section_dependencies)
    id_to_filepath = {}
    for sid in to_write:
        curr_section = code_sections[sid]
        codeLanguage = curr_section["codeLanguage"]
        extension = languageToExtension(codeLanguage)
        code = get_section_code(p, sid)
        filepath = write_string_to_file(
            folder_path, f"{curr_section['name']}{extension}", code
        )
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        id_to_filepath[sid] = filepath

    # allow calling as a module and having relative imports
    add_python_init_file(folder_path)

    # Only run code that isn't referenced by other code
    run_order = [
        x for x in to_write if all(x not in y for y in section_dependencies.values())
    ]

    # create a wrapper script if there are multiple files to run
    if len(run_order) > 1:
        bash_script = ""
        for sid in run_order:
            curr_section = code_sections[sid]
            bash_script += codeCallStr(folder_path, curr_section)
        filepath = write_string_to_file(folder_path, "SETTA_ENTRY.sh", bash_script)
        filepath = os.path.relpath(filepath).replace(os.sep, "/")
        command = f"bash {filepath}"
    else:
        sid = run_order[0]
        filepath = id_to_filepath[sid]
        command = languageToCall(code_sections[sid]["codeLanguage"], filepath)

    if terminal_write_fn:
        terminal_write_fn(f"\x15{command}\n")
    elif command_callback:
        command_callback(command)


def generate_final_code_for_section(
    code,
    codeLanguage,
    evRefs,
    code_sections,
    exporter_obj,
    folder_path=None,
    do_prepend_with_setup_code=False,
    projectConfigName=None,
):
    section_dependencies = []
    replacements = {}
    generated_python_code = None
    generated_python_var_name_to_line_num = None
    generated_python_code_area_ref_var_name_positions = None
    for other_s in code_sections.values():
        # insert filepath if the reference is to another code section of a different language
        if (
            folder_path
            and codeLanguage != other_s["codeLanguage"]
            and template_prefix(other_s["name"]) in code
        ):
            replacements[other_s["name"]] = codePathStr(
                folder_path, other_s["name"], other_s["codeLanguage"]
            )
            section_dependencies.append(other_s["id"])
    if folder_path and needs_yaml(code):
        replacements["SETTA_YAML_FILE"] = codePathStr(folder_path, "SETTA_YAML", "yaml")
    if needs_generated_python(code):
        (
            code,
            _,
            generated_python_code_area_ref_var_name_positions,
        ) = process_refs(
            code,
            evRefs,
            exporter_obj.get_ref_var_name,
        )
        (
            generated_python_code,
            generated_python_var_name_to_line_num,
        ) = generate_code(
            exporter_obj.output,
            code,
            replace_templated_code=False,
            make_copy_of_selected=False,
        )
        replacements[C.SETTA_GENERATED_PYTHON] = generated_python_code

    code = replace_keywords(
        code, replacements, generated_python_code_area_ref_var_name_positions
    )

    setup_code = ""
    if do_prepend_with_setup_code:
        code, setup_code = prepend_with_setup_code(
            code,
            codeLanguage,
            folder_path,
            projectConfigName,
        )

    if generated_python_code:
        code = convert_var_names_to_readable_form(
            code,
            generated_python_var_name_to_line_num,
            exporter_obj,
            generated_python_code_area_ref_var_name_positions,
            setup_code,
        )

    return code, section_dependencies


def languageToExtension(x):
    return {"python": ".py", "bash": ".sh", "yaml": ".yaml"}[x]


def languageToCall(language, filepath):
    if language == "python":
        module_path = python_script_filepath_to_module_path(filepath)
        return f"python -m {module_path}\n"
    elif language == "bash":
        return f"bash {filepath}\n"



def codePathStr(folder_path, filename, codeLanguage):
    extension = languageToExtension(codeLanguage)
    output = f"{folder_path}/{filename}{extension}"
    return os.path.relpath(output).replace(os.sep, "/")


def codeCallStr(folder_path, section):
    codePath = codePathStr(folder_path, section["name"], section["codeLanguage"])
    return languageToCall(section['codeLanguage'], codePath)


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


def create_timestamped_folder(base_dir, prefix="_"):
    # Format the current timestamp with subsecond precision
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    # Create folder name with optional prefix and subsecond precision
    folder_name = f"{prefix}{timestamp}"
    # Full path for the new folder
    folder_path = os.path.join(base_dir, folder_name)

    if not os.path.exists(folder_path):
        try:
            os.makedirs(folder_path)
        except FileExistsError:
            pass

    return folder_path


def write_string_to_file(folder, filename, content):
    # Full path to the file
    file_path = os.path.join(folder, filename)
    # Write the content to the file
    with open(file_path, "w") as file:
        file.write(content)
    return file_path


def add_python_init_file(folder):
    filepath = Path(folder) / "__init__.py"
    Path(filepath).touch()

def python_script_filepath_to_module_path(file_path):
    # Convert path to parts, removing file extension
    parts = file_path.replace('\\', '/').split('/')
    module_path = '.'.join(parts)[:-3]  # remove .py
    return module_path


def prepend_with_setup_code(code, codeLanguage, folder_path, project_config_name):
    setup_code = ""
    if codeLanguage == "python":
        location = f"/{project_config_name}"
        setup_code = (
            "import os\n"
            f"os.environ['{SEND_ARTIFACT_TO_ENV_VARIABLE}'] = '{location}'\n"
            f"os.environ['{CODE_FOLDER_ENV_VARIABLE}'] = '{folder_path}'\n"
        )
        code = setup_code + code
    return code, setup_code
