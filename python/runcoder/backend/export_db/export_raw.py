import yaml


def export_raw(filename, data, schema):
    # Combined schema and data for JSON export
    database_export = {"schema": schema, "data": data}

    # with open(f"{filename}_export.json", 'w') as file:
    #     json.dump(database_export, file, indent=4)

    # Customize the YAML dump to use literal style for SQL
    def literal_presenter(dumper, data):
        if "\n" in data:
            return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
        return dumper.represent_scalar("tag:yaml.org,2002:str", data)

    yaml.add_representer(str, literal_presenter)

    # For YAML export, PyYAML is used; ensure it's installed
    with open(f"{filename}_export.yaml", "w") as file:
        yaml.dump(database_export, file, allow_unicode=True)