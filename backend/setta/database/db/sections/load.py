import json
import logging
from dataclasses import dataclass, field

from pydantic import BaseModel

from setta.database.db.sections.jsonSource import build_ancestor_paths
from setta.database.utils import create_new_id
from setta.project_state.project_state import (
    CodeInfo,
    CodeInfoCol,
    EVEntry,
    Section,
    SectionVariant,
)

logger = logging.getLogger(__name__)


@dataclass
class ProcessedJSONObject:
    codeInfo: dict[str, CodeInfo] = field(default_factory=dict)
    codeInfoColChildren: dict[str | None, list[str]] = field(default_factory=dict)
    variantValues: dict[str, EVEntry] = field(default_factory=dict)


class LoadJSONSourceObject(BaseModel, extra="forbid"):
    sections: dict[str, Section]
    variants: dict[str, SectionVariant]
    codeInfo: dict[str, CodeInfo]
    codeInfoCols: dict[str, CodeInfoCol]


def load_json_sources_into_data_structures(
    projectState: LoadJSONSourceObject, variant_ids: list[str] | None = None
):
    for variant_id, variant in projectState.variants.items():
        if variant_ids and variant_id not in variant_ids:
            continue
        if not variant.isJsonSource:
            continue
        new_data, isMissing = load_json_source(variant.name, variant.jsonSourceKeys)
        variant.jsonSourceMissing = isMissing
        if isMissing:
            continue
        if not variant.codeInfoColId:
            variant.codeInfoColId = create_new_id()
            projectState.codeInfoCols[variant.codeInfoColId] = CodeInfoCol()
        codeInfoCol = projectState.codeInfoCols[variant.codeInfoColId]
        merge_into_existing(new_data, variant, projectState.codeInfo, codeInfoCol)


def merge_into_existing(
    data: ProcessedJSONObject,
    variant: SectionVariant,
    codeInfo: dict[str, CodeInfo],
    codeInfoCol: CodeInfoCol,
):
    filename = variant.name
    jsonSourceMetadata_to_id: dict[str, str] = {}
    ancestor_paths = build_ancestor_paths(codeInfo, codeInfoCol.children)
    for id in ancestor_paths:
        jsonSourceMetadata_to_id[
            createMetadataJsonString(filename, ancestor_paths[id])
        ] = id

    replacements: dict[str, str] = {}
    new_ancestor_paths = build_ancestor_paths(data.codeInfo, data.codeInfoColChildren)
    for newId, newInfo in data.codeInfo.items():
        existingId = jsonSourceMetadata_to_id.get(
            createMetadataJsonString(filename, new_ancestor_paths[newId])
        )
        if existingId:
            replacements[newId] = existingId
        else:
            codeInfo[newId] = newInfo

    for newId, existingId in replacements.items():
        del data.codeInfo[newId]
        data.codeInfoColChildren[existingId] = [
            replacements.get(x, x) for x in data.codeInfoColChildren[newId]
        ]
        data.codeInfoColChildren[None] = [
            replacements.get(x, x) for x in data.codeInfoColChildren[None]
        ]
        del data.codeInfoColChildren[newId]
        data.variantValues[existingId] = data.variantValues[newId]
        del data.variantValues[newId]

    variant.values = data.variantValues
    codeInfoCol.children = data.codeInfoColChildren


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

    new_data = process_json_object(jsonSourceData, filename, jsonSourceKeys)

    return new_data, isMissing


def process_json_object(jsonSourceData, filename: str, jsonSourceKeys: list[str]):
    new_data = ProcessedJSONObject()

    try:
        for k in jsonSourceKeys:
            jsonSourceData = jsonSourceData[k]
    except:
        # TODO print warning or something
        pass

    metadataToId = {}

    highest_key = process_json_object_helper(
        new_data, jsonSourceData, filename, jsonSourceKeys, metadataToId
    )

    if len(jsonSourceKeys) > 0:
        # point directly from None (the root) to the children
        codeInfoChildren = new_data.codeInfoColChildren
        codeInfoChildren[None] = codeInfoChildren[highest_key]
        del codeInfoChildren[highest_key]

    return new_data


def process_json_object_helper(
    output: ProcessedJSONObject,
    obj,
    filename: str,
    current_path: list[str],
    metadataToId: dict[str, str],
):
    if not isinstance(obj, dict):
        return

    children_keys = []
    for k, v in obj.items():
        path = current_path + [k]
        paramInfoId, is_dict = create_json_code_info(k, v, output)
        metadataToId[createMetadataJsonString(filename, path)] = paramInfoId
        children_keys.append(paramInfoId)
        if is_dict:
            process_json_object_helper(output, v, filename, path, metadataToId)

    parent_id = None
    if len(current_path) > 0:
        metadata = createMetadataJsonString(filename, current_path)
        parent_id = metadataToId.get(metadata)
        if not parent_id:
            parent_id = create_new_id()
            metadataToId[metadata] = parent_id

    output.codeInfoColChildren[parent_id] = children_keys
    return parent_id


def create_json_code_info(key: str, value, output: ProcessedJSONObject):
    paramInfoId = create_new_id()
    # Create code info entry
    output.codeInfo[paramInfoId] = CodeInfo(
        id=paramInfoId,
        name=key,
        editable=True,
    )
    output.codeInfoColChildren[paramInfoId] = []

    is_dict = isinstance(value, dict)
    # Create variant value entry
    if is_dict:
        # For objects, store empty value and process children
        output.variantValues[paramInfoId] = EVEntry()
    else:
        # For non-objects, store the value directly
        output.variantValues[paramInfoId] = EVEntry(value=json.dumps(value))

    return paramInfoId, is_dict


def createMetadataJsonString(filename: str, path: list[str]):
    return json.dumps({"filename": filename, "key": path})
