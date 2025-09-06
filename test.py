# import json

# import yaml
# from setta.types.helpers import get_variant_base_and_effective_section_impl
# from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
# from setta.types.project_state import ProjectStateSingleConfig
# from setta.types.section_impls import BaseDictSectionImpl

# with open("setta_files/setta-settings-project.json", "r") as f:
#     p = ProjectStateSingleConfig.model_validate(json.load(f))

# unpinned_dict = {}

# for s in p.sections.values():
#     for v in s.variants:
#         _, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
#         if not isinstance(impl, BaseDictSectionImpl):
#             continue
#         hierarchy = traverse_hierarchy(
#             p.codeObjs,
#             p.codeObjImpls,
#             p.codeObjVariants,
#             impl.codeObjVariantMap,
#             impl.topLevelParamIds,
#             TraversalOptions(
#                 build_name_paths=True,
#                 build_nested_dict=True,
#                 nested_dict_keys_prefix=impl.jsonSourceKeys,
#             ),
#         )
#         print(yaml.dump(hierarchy.nested_dict))

# # pprint(unpinned_dict)


from pathlib import Path


def list_directory_contents_pathlib(folder_path):
    """
    Lists all files and subfolders using pathlib.

    Args:
        folder_path (str): Path to the folder to list contents of

    Returns:
        list: A list of dictionaries with 'name' and 'type' keys
    """
    path = Path(folder_path)

    # Check if path exists and is a directory
    if not path.exists():
        raise FileNotFoundError(f"Path does not exist: {folder_path}")
    if not path.is_dir():
        raise NotADirectoryError(f"Path is not a directory: {folder_path}")

    contents = []

    for item in path.iterdir():
        contents.append(
            {"name": item.name, "type": "folder" if item.is_dir() else "file"}
        )

    return contents


print(list_directory_contents_pathlib("/Users/kevin/Downloads"))
