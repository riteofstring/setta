import copy
import json
import logging
from typing import TypeGuard

from pydantic import BaseModel, Field

from setta.database.db.jsonSource.save import build_ancestor_paths
from setta.types.code_obj_impls import (
    BaseCodeObjImpl,
    CodeObjType,
    NestedParamCodeObjImpl,
)
from setta.types.generated.cores import NestedParamCodeObjCore, create_code_obj_core
from setta.types.generated.effective_impls import (
    get_effective_impl,
    set_effective_impl_value,
)
from setta.types.generated.impl_creation_fns import (
    create_code_obj_impl,
    create_section_impl,
)
from setta.types.generated.layerings import (
    NestedParamCodeObjLayering,
    TextParamCodeObjLayering,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.unions import (
    BaseChildlessCodeObjCoreUnion,
    BaseChildlessCodeObjImplUnion,
    BaseChildlessCodeObjLayeringUnion,
    BaseCodeObjCoreUnion,
    BaseCodeObjImplUnion,
    BaseCodeObjLayeringUnion,
    BaseDictSectionCoreUnion,
    BaseDictSectionImplUnion,
    BaseDictSectionLayeringUnion,
    BaseSectionCoreUnion,
    BaseSectionImplUnion,
    BaseSectionLayeringUnion,
)
from setta.types.project_state import (
    ProjectStateBackend,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    BaseDictSectionImpl,
    SectionType,
)

logger = logging.getLogger(__name__)


class ProcessedJSONObject(BaseModel):
    sectionImpl: BaseDictSectionImpl
    codeObjs: dict[str, BaseCodeObjCoreUnion] = Field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImplUnion] = Field(default_factory=dict)
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion] = Field(
        default_factory=dict
    )


class LoadJSONSourceObject(BaseModel, extra="forbid"):
    sections: dict[str, BaseSectionCoreUnion]
    sectionImpls: dict[str, BaseSectionImplUnion]
    sectionImplLayerings: dict[str, BaseSectionLayeringUnion]
    codeObjs: dict[str, BaseCodeObjCoreUnion]
    codeObjImpls: dict[str, BaseCodeObjImplUnion]
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion]


def load_json_sources_into_data_structures(
    settings: SettingsState,
    p: ProjectStateBackend | ProjectStateSingleConfig | LoadJSONSourceObject,
    section_impl_layering_ids: list[str] | None = None,
):
    processed = set()
    for section in p.sections.values():
        for layering_id in section.implLayerings:
            if layering_id in processed:
                continue
            processed.add(layering_id)
            layering = p.sectionImplLayerings[layering_id]
            base_impl = p.sectionImpls[layering.impl]
            impl = get_effective_impl(p.sectionImpls[layering.impl], section, layering)
            if (
                not isinstance(base_impl, BaseDictSectionImplUnion)
                or not isinstance(impl, BaseDictSectionImplUnion)
                or not isinstance(layering, BaseDictSectionLayeringUnion)
                or not isinstance(section, BaseDictSectionCoreUnion)
                or not impl.isJsonSource
                or (
                    section_impl_layering_ids
                    and layering_id not in section_impl_layering_ids
                )
            ):
                continue
            new_data, isMissing = load_json_source(
                settings, layering.name, impl.jsonSourceKeys
            )
            impl = set_effective_impl_value(
                base_impl, section, layering, {"jsonSourceMissing": isMissing}
            )
            if isMissing:
                continue
            merge_into_existing(
                layering.name,
                new_data,
                section,
                base_impl,
                impl,
                layering,
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjImplLayerings,
            )


def merge_into_existing(
    filename: str,
    new_data: ProcessedJSONObject,
    section: BaseDictSectionCoreUnion,
    base_section_impl: BaseDictSectionImplUnion,
    section_impl: BaseDictSectionImplUnion,
    section_impl_layering: BaseDictSectionLayeringUnion,
    codeObjs: dict[str, BaseCodeObjCoreUnion],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjImplLayerings: dict[str, BaseCodeObjLayeringUnion],
):
    ancestor_paths = build_ancestor_paths(
        codeObjs,
        codeObjImpls,
        codeObjImplLayerings,
        section_impl.codeObjImplLayeringMap,
        section_impl.topLevelParamIds,
    )
    jsonSourceMetadata_to_id: dict[str, str] = {}
    for id in ancestor_paths:
        jsonSourceMetadata_to_id[
            createMetadataJsonString(filename, ancestor_paths[id])
        ] = id

    new_ancestor_paths = build_ancestor_paths(
        new_data.codeObjs,
        new_data.codeObjImpls,
        new_data.codeObjImplLayerings,
        new_data.sectionImpl.codeObjImplLayeringMap,
        new_data.sectionImpl.topLevelParamIds,
    )
    new_jsonSourceMetadata_to_id: dict[str, str] = {}
    for id in new_ancestor_paths:
        new_jsonSourceMetadata_to_id[
            createMetadataJsonString(filename, new_ancestor_paths[id])
        ] = id

    replacements: dict[str, tuple[str, BaseCodeObjImpl]] = {}
    for newId, newCodeObj in new_data.codeObjs.items():
        existingCodeObjId = jsonSourceMetadata_to_id.get(
            createMetadataJsonString(filename, new_ancestor_paths[newId])
        )
        newLayeringId = new_data.sectionImpl.codeObjImplLayeringMap[newId]
        newLayering = new_data.codeObjImplLayerings[newLayeringId]
        newImpl = new_data.codeObjImpls[newLayering.impl]
        if not existingCodeObjId:
            section_impl = set_effective_impl_value(
                base_section_impl,
                section,
                section_impl_layering,
                {
                    "codeObjImplLayeringMap": {
                        **copy.deepcopy(section_impl.codeObjImplLayeringMap),
                        newId: newLayeringId,
                    }
                },
            )
            codeObjImplLayerings[newLayeringId] = newLayering
            codeObjImpls[newImpl.id] = newImpl
            codeObjs[newId] = newCodeObj
        else:
            replacements[newId] = (existingCodeObjId, newImpl)

    for newId, (existingCodeObjId, newImpl) in replacements.items():
        layeringId = section_impl.codeObjImplLayeringMap[existingCodeObjId]
        layering = codeObjImplLayerings[layeringId]
        codeObjCore = codeObjs[existingCodeObjId]
        baseCodeObjImpl = codeObjImpls[layering.impl]
        impl = get_effective_impl(baseCodeObjImpl, codeObjCore, layering)
        if (
            isinstance(baseCodeObjImpl, NestedParamCodeObjImpl)
            and isinstance(impl, NestedParamCodeObjImpl)
            and isinstance(newImpl, NestedParamCodeObjImpl)
            and isinstance(codeObjCore, NestedParamCodeObjCore)
            and isinstance(layering, NestedParamCodeObjLayering)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl,
                codeObjCore,
                layering,
                {
                    "children": [
                        replacements[c][0] if c in replacements else c
                        for c in newImpl.children
                    ]
                },
            )
        elif (
            isinstance(baseCodeObjImpl, BaseChildlessCodeObjImplUnion)
            and isinstance(impl, BaseChildlessCodeObjImplUnion)
            and isinstance(newImpl, BaseChildlessCodeObjImplUnion)
            and isinstance(codeObjCore, BaseChildlessCodeObjCoreUnion)
            and isinstance(layering, BaseChildlessCodeObjLayeringUnion)
        ):
            impl = set_effective_impl_value(
                baseCodeObjImpl, codeObjCore, layering, {"value": newImpl.value}
            )
        else:
            raise TypeError

    for metadataString, id in jsonSourceMetadata_to_id.items():
        newId = new_jsonSourceMetadata_to_id.get(metadataString)
        if not newId:
            layeringId = section_impl.codeObjImplLayeringMap[id]
            layering = codeObjImplLayerings[layeringId]
            impl = codeObjImpls[layering.impl]
            del section_impl.codeObjImplLayeringMap[id]
            del codeObjs[id]
            del codeObjImpls[impl.id]
            del codeObjImplLayerings[layeringId]

    set_effective_impl_value(
        base_section_impl,
        section,
        section_impl_layering,
        {
            "topLevelParamIds": [
                replacements[c][0] if c in replacements else c
                for c in new_data.sectionImpl.topLevelParamIds
            ]
        },
    )


def load_json_source(settings: SettingsState, filename: str, jsonSourceKeys: list[str]):
    jsonSourceData = {}
    isMissing = False

    try:
        logger.debug(f"Attempting to read {filename} with keys {jsonSourceKeys}")
        with open(filename, "r") as f:
            jsonSourceData = json.load(f)
    except json.JSONDecodeError:
        pass
    except FileNotFoundError:
        logger.debug(f"couldn't find: {filename}")
        isMissing = True

    new_data = process_json_object(settings, jsonSourceData, jsonSourceKeys)

    return new_data, isMissing


def process_json_object(
    settings: SettingsState,
    jsonSourceData: dict,
    jsonSourceKeys: list[str],
):
    new_data = ProcessedJSONObject(
        sectionImpl=create_section_impl(
            SectionType.Dict,
            settings.dictSectionDefault,
            {"isJsonSource": True, "jsonSourceKeys": jsonSourceKeys},
        )
    )

    try:
        for k in jsonSourceKeys:
            jsonSourceData = jsonSourceData[k]
    except:
        # TODO print warning or something
        pass

    topLevelParamIds = process_json_object_helper(settings, new_data, jsonSourceData)
    new_data.sectionImpl.topLevelParamIds = topLevelParamIds

    return new_data


def process_json_object_helper(
    settings: SettingsState, output: ProcessedJSONObject, obj: dict
):
    children_keys: list[str] = []
    for k, v in obj.items():
        codeObj, codeObjImpl = add_to_processed_json_object(settings, k, v, output)
        children_keys.append(codeObj.id)
        if isinstance(codeObjImpl, NestedParamCodeObjImpl):
            codeObjImpl.children = process_json_object_helper(settings, output, v)

    return children_keys


def add_to_processed_json_object(
    settings: SettingsState, key: str, value, output: ProcessedJSONObject
):
    is_dict = isinstance(value, dict)
    if is_dict:
        codeObjImpl = create_code_obj_impl(
            CodeObjType.NestedParam, settings.nestedParamCodeObjDefault
        )
        codeObjImplLayering = NestedParamCodeObjLayering(
            impl=codeObjImpl.id, nonPresetImpls=[codeObjImpl.id]
        )
    else:
        codeObjImpl = create_code_obj_impl(
            CodeObjType.TextParam,
            settings.textParamCodeObjDefault,
            {"value": json.dumps(value)},
        )
        codeObjImplLayering = TextParamCodeObjLayering(
            impl=codeObjImpl.id, nonPresetImpls=[codeObjImpl.id]
        )
    layeringId = codeObjImplLayering.id
    codeObj = create_code_obj_core(
        codeObjImpl.type,
        {"name": key, "implLayerings": [layeringId], "defaultImplLayering": layeringId},
    )

    output.sectionImpl.codeObjImplLayeringMap[codeObj.id] = layeringId
    output.codeObjs[codeObj.id] = codeObj
    output.codeObjImpls[codeObjImpl.id] = codeObjImpl
    output.codeObjImplLayerings[layeringId] = codeObjImplLayering
    return codeObj, codeObjImpl


def createMetadataJsonString(filename: str, path: list[str]):
    return json.dumps({"filename": filename, "key": path})


def are_dict_sections(
    objs: tuple[object, object, object, object],
) -> TypeGuard[
    tuple[
        BaseDictSectionImplUnion,
        BaseDictSectionImplUnion,
        BaseDictSectionLayeringUnion,
        BaseDictSectionCoreUnion,
    ]
]:
    return (
        isinstance(objs[0], BaseDictSectionImplUnion)
        and isinstance(objs[1], BaseDictSectionImplUnion)
        and isinstance(objs[2], BaseDictSectionLayeringUnion)
        and isinstance(objs[3], BaseDictSectionCoreUnion)
    )
