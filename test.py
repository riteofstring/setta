import json

from setta.database.db.jsonSource.save import save_json_source_data
from setta.types.project_state import ProjectStateSingleConfig

with open("setta_files/setta-settings-project.json", "r") as f:
    p = ProjectStateSingleConfig.model_validate(json.load(f))

save_json_source_data(p)


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
#         )

# pprint(unpinned_dict)
