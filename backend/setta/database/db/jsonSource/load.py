import copy
import json
import logging

from pydantic import BaseModel, Field

from setta.database.db.jsonSource.save import build_ancestor_paths
from setta.types.code_obj_impls import (
    BaseChildlessCodeObjImpl,
    BaseCodeObjImpl,
    CodeObjType,
    NestedParamCodeObjImpl,
)
from setta.types.generated.code_obj_core_unions import BaseCodeObjCoreUnion
from setta.types.generated.code_obj_type_unions import (
    BaseCodeObjImplUnion,
)
from setta.types.generated.creation_functions import (
    createDictSectionImpl,
    createNestedParamCodeObjImpl,
    createTextParamCodeObjImpl,
)
from setta.types.generated.impl_modifier_unions import (
    isBaseChildlessCodeObjImplModifier,
)
from setta.types.generated.impl_modifiers import (
    BaseDictSectionImplModifier,
)
from setta.types.generated.section_core_unions import BaseSectionCoreUnion
from setta.types.generated.section_type_unions import (
    BaseSectionImplUnion,
)
from setta.types.generated.settings_state import SettingsState
from setta.types.generated.type_to_core import create_core_for_code_obj_type
from setta.types.generated.type_to_modifier import create_modifier_for_code_obj_type
from setta.types.impl_helpers import apply_modifier, get_effective_impl
from setta.types.impl_layering import ImplLayering
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
    codeObjImplLayerings: dict[str, ImplLayering] = Field(default_factory=dict)


class LoadJSONSourceObject(BaseModel, extra="forbid"):
    sections: dict[str, BaseSectionCoreUnion]
    sectionImpls: dict[str, BaseSectionImplUnion]
    sectionImplLayerings: dict[str, ImplLayering]
    codeObjs: dict[str, BaseCodeObjCoreUnion]
    codeObjImpls: dict[str, BaseCodeObjImplUnion]
    codeObjImplLayerings: dict[str, ImplLayering]


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
            impl = get_effective_impl(layering, section, p.sectionImpls)
            if (
                not isinstance(impl, BaseDictSectionImpl)
                or not impl.isJsonSource
                or (
                    section_impl_layering_ids
                    and layering_id not in section_impl_layering_ids
                )
            ):
                continue

            if layering.modifier["type"] != SectionType.Dict:
                continue
            new_data, isMissing = load_json_source(
                settings, layering.name, impl.jsonSourceKeys
            )
            layering.modifier["jsonSourceMissing"] = isMissing
            impl = apply_modifier(impl, layering.modifier)
            if isMissing:
                continue
            merge_into_existing(
                layering.name,
                new_data,
                impl,
                layering.modifier,
                p.codeObjs,
                p.codeObjImpls,
                p.codeObjImplLayerings,
            )


def merge_into_existing(
    filename: str,
    new_data: ProcessedJSONObject,
    section_impl: BaseDictSectionImpl,
    section_impl_modifier: BaseDictSectionImplModifier,
    codeObjs: dict[str, BaseCodeObjCoreUnion],
    codeObjImpls: dict[str, BaseCodeObjImplUnion],
    codeObjImplLayerings: dict[str, ImplLayering],
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
            if "codeObjImplLayeringMap" not in section_impl_modifier:
                section_impl_modifier["codeObjImplLayeringMap"] = copy.deepcopy(
                    section_impl.codeObjImplLayeringMap
                )
            section_impl_modifier["codeObjImplLayeringMap"][newId] = newLayeringId
            section_impl = apply_modifier(section_impl, section_impl_modifier)
            codeObjImplLayerings[newLayeringId] = newLayering
            codeObjImpls[newImpl.id] = newImpl
            codeObjs[newId] = newCodeObj
        else:
            replacements[newId] = (existingCodeObjId, newImpl)

    for newId, (existingCodeObjId, newImpl) in replacements.items():
        layeringId = section_impl.codeObjImplLayeringMap[existingCodeObjId]
        layering = codeObjImplLayerings[layeringId]
        impl = get_effective_impl(layering, codeObjs[existingCodeObjId], codeObjImpls)
        if (
            isinstance(impl, NestedParamCodeObjImpl)
            and isinstance(newImpl, NestedParamCodeObjImpl)
            and layering.modifier["type"] == CodeObjType.NestedParam
        ):
            layering.modifier["children"] = [
                replacements[c][0] if c in replacements else c for c in newImpl.children
            ]
            impl = apply_modifier(impl, layering.modifier)
        elif (
            isinstance(impl, BaseChildlessCodeObjImpl)
            and isinstance(newImpl, BaseChildlessCodeObjImpl)
            and isBaseChildlessCodeObjImplModifier(layering.modifier)
        ):
            layering.modifier["value"] = newImpl.value
            impl = apply_modifier(impl, layering.modifier)
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

    section_impl_modifier["topLevelParamIds"] = [
        replacements[c][0] if c in replacements else c
        for c in new_data.sectionImpl.topLevelParamIds
    ]


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
        sectionImpl=createDictSectionImpl(
            settings.dictSectionDefault,
            isJsonSource=True,
            jsonSourceKeys=jsonSourceKeys,
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
        codeObjImpl = createNestedParamCodeObjImpl(settings.nestedParamDefault)
    else:
        codeObjImpl = createTextParamCodeObjImpl(
            settings.textParamDefault, value=json.dumps(value)
        )
    codeObjImplLayering = ImplLayering(
        impl=codeObjImpl.id,
        modifier=create_modifier_for_code_obj_type(codeObjImpl.type),
    )
    layeringId = codeObjImplLayering.id
    codeObj = create_core_for_code_obj_type(
        codeObjImpl.type,
        name=key,
        implLayerings=[layeringId],
        defaultImplLayering=layeringId,
    )

    output.sectionImpl.codeObjImplLayeringMap[codeObj.id] = layeringId
    output.codeObjs[codeObj.id] = codeObj
    output.codeObjImpls[codeObjImpl.id] = codeObjImpl
    output.codeObjImplLayerings[layeringId] = codeObjImplLayering
    return codeObj, codeObjImpl


def createMetadataJsonString(filename: str, path: list[str]):
    return json.dumps({"filename": filename, "key": path})
