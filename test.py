import json

import yaml
from setta.types.helpers import get_variant_base_and_effective_section_impl
from setta.types.hierarchy_traversal import TraversalOptions, traverse_hierarchy
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.section_impls import BaseDictSectionImpl

with open("setta_files/setta-settings-project.json", "r") as f:
    p = ProjectStateSingleConfig.model_validate(json.load(f))

unpinned_dict = {}

for s in p.sections.values():
    for v in s.variants:
        _, _, impl = get_variant_base_and_effective_section_impl(p, s, v)
        if not isinstance(impl, BaseDictSectionImpl):
            continue
        hierarchy = traverse_hierarchy(
            p.codeObjs,
            p.codeObjImpls,
            p.codeObjVariants,
            impl.codeObjVariantMap,
            impl.topLevelParamIds,
            TraversalOptions(
                build_name_paths=True,
                build_nested_dict=True,
                nested_dict_keys_prefix=impl.jsonSourceKeys,
            ),
        )
        print(yaml.dump(hierarchy.nested_dict))

# pprint(unpinned_dict)
