def generate_typescript_fixture(
    project_state: dict[str, object],
    target_options: dict[str, object],
) -> dict[str, object]:
    project_config = project_state.get("projectConfig")
    if not isinstance(project_config, dict):
        raise ValueError("projectConfig missing in project_state payload.")
    project_name = project_config.get("name")
    if not isinstance(project_name, str) or project_name.strip() == "":
        raise ValueError("projectConfig.name missing in project_state payload.")
    class_name = target_options.get("className")
    if not isinstance(class_name, str) or class_name.strip() == "":
        class_name = "SettaState"
    return {
        "files": [
            {
                "relativePath": "setta_gen.ts",
                "content": (
                    f"export class {class_name} " + "{\n"
                    f"  readonly projectName = {project_name!r};\n"
                    "}\n"
                ),
            }
        ]
    }


def register(plugin):
    plugin.register_codegen_target(
        {
            "id": "typescript",
            "name": "TypeScript",
            "language": "typescript",
            "defaultFileName": "setta_gen.ts",
            "generate": generate_typescript_fixture,
        }
    )
