import json
import logging

from pydantic import BaseModel, Field

from setta.database.db.jsonSource.save import build_ancestor_paths
from setta.types.code_objs import (
    BaseChildlessCodeObjImpl,
    BaseCodeObjImpl,
    CodeObjCore,
    CodeObjImplLayering,
    NestedParamCodeObjImpl,
    TextParamCodeObjImpl,
)
from setta.types.impl_helpers import get_effective_impl
from setta.types.impl_layering import SectionImplLayering
from setta.types.project_state import (
    ProjectStateSingleConfig,
)
from setta.types.sections import (
    BaseSectionImpl,
    DictSectionImpl,
    SectionCore,
)

logger = logging.getLogger(__name__)


class ProcessedJSONObject(BaseModel):
    sectionImpl: DictSectionImpl
    codeObjs: dict[str, CodeObjCore] = Field(default_factory=dict)
    codeObjImpls: dict[str, BaseCodeObjImpl] = Field(default_factory=dict)
    codeObjImplLayerings: dict[str, CodeObjImplLayering] = Field(default_factory=dict)


class LoadJSONSourceObject(BaseModel, extra="forbid"):
    sections: dict[str, SectionCore]
    sectionImpls: dict[str, BaseSectionImpl]
    sectionImplLayerings: dict[str, SectionImplLayering]
    codeObjs: dict[str, CodeObjCore]
    codeObjImpls: dict[str, BaseCodeObjImpl]
    codeObjImplLayerings: dict[str, CodeObjImplLayering]


def load_json_sources_into_data_structures(
    p: ProjectStateSingleConfig | LoadJSONSourceObject,
    section_impl_layering_ids: list[str] | None = None,
):
    for layering_id, layering in p.sectionImplLayerings.items():
        impl = get_effective_impl(layering, p.sectionImpls)
        if (
            not isinstance(impl, DictSectionImpl)
            or not impl.isJsonSource
            or (
                section_impl_layering_ids
                and layering_id not in section_impl_layering_ids
            )
        ):
            continue
        new_data, isMissing = load_json_source(impl.name, impl.jsonSourceKeys)
        layering.modifier["jsonSourceMissing"] = isMissing
        if isMissing:
            continue
        merge_into_existing(
            new_data, impl, layering, p.codeObjs, p.codeObjImpls, p.codeObjImplLayerings
        )


def merge_into_existing(
    new_data: ProcessedJSONObject,
    section_impl: DictSectionImpl,
    section_layering: SectionImplLayering,
    codeObjs: dict[str, CodeObjCore],
    codeObjImpls: dict[str, BaseCodeObjImpl],
    codeObjImplLayerings: dict[str, CodeObjImplLayering],
):
    filename = section_impl.name
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
            section_impl.codeObjImplLayeringMap[newId] = newLayeringId
            codeObjImplLayerings[newLayeringId] = newLayering
            codeObjImpls[newImpl.id] = newImpl
            codeObjs[newId] = newCodeObj
        else:
            replacements[newId] = (existingCodeObjId, newImpl)

    for newId, (existingCodeObjId, newImpl) in replacements.items():
        layeringId = section_impl.codeObjImplLayeringMap[existingCodeObjId]
        layering = codeObjImplLayerings[layeringId]
        impl = get_effective_impl(layering, codeObjImpls)
        if isinstance(impl, NestedParamCodeObjImpl):
            if isinstance(newImpl, NestedParamCodeObjImpl):
                layering.modifier["children"] = [
                    replacements[c][0] if c in replacements else c
                    for c in newImpl.children
                ]
            else:
                raise TypeError
        elif isinstance(impl, BaseChildlessCodeObjImpl):
            if isinstance(newImpl, BaseChildlessCodeObjImpl):
                layering.modifier["value"] = newImpl.value
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

    section_layering.modifier["topLevelParamIds"] = [
        replacements[c][0] if c in replacements else c
        for c in new_data.sectionImpl.topLevelParamIds
    ]


def load_json_source(filename: str, jsonSourceKeys: list[str]):
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

    new_data = process_json_object(jsonSourceData, jsonSourceKeys)

    return new_data, isMissing


def process_json_object(jsonSourceData: dict, jsonSourceKeys: list[str]):
    new_data = ProcessedJSONObject(
        sectionImpl=DictSectionImpl(isJsonSource=True, jsonSourceKeys=jsonSourceKeys)
    )

    try:
        for k in jsonSourceKeys:
            jsonSourceData = jsonSourceData[k]
    except:
        # TODO print warning or something
        pass

    topLevelParamIds = process_json_object_helper(new_data, jsonSourceData)
    new_data.sectionImpl.topLevelParamIds = topLevelParamIds

    return new_data


def process_json_object_helper(output: ProcessedJSONObject, obj: dict):
    children_keys: list[str] = []
    for k, v in obj.items():
        codeObj, codeObjImpl = add_to_processed_json_object(k, v, output)
        children_keys.append(codeObj.id)
        if isinstance(codeObjImpl, NestedParamCodeObjImpl):
            codeObjImpl.children = process_json_object_helper(output, v)

    return children_keys


def add_to_processed_json_object(key: str, value, output: ProcessedJSONObject):
    is_dict = isinstance(value, dict)
    if is_dict:
        codeObjImpl = NestedParamCodeObjImpl()
    else:
        codeObjImpl = TextParamCodeObjImpl(value=json.dumps(value))

    codeObjImplLayering = CodeObjImplLayering(impl=codeObjImpl.id)
    layeringId = codeObjImplLayering.id
    codeObj = CodeObjCore(
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
