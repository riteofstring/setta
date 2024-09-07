from fastapi import APIRouter
from pydantic import BaseModel

from setta.database.db.sections.copy import (
    copy_relative_positions,
    copy_sections_and_other_info,
)
from setta.code_gen.export_selected import export_section_to_dict
from setta.utils.constants import C

router = APIRouter()


class SectionsMakeCopyRequest(BaseModel):
    sectionsAndOtherInfo: dict

class SectionToDictRequest(BaseModel):
    project: dict
    sectionId: str


@router.post(C.ROUTE_SECTIONS)
def route_sections():
    pass


@router.post(C.ROUTE_COPY_SECTIONS)
def route_sections_make_copy(x: SectionsMakeCopyRequest):
    output = copy_sections_and_other_info(x.sectionsAndOtherInfo)
    relativePositions = copy_relative_positions(
        x.sectionsAndOtherInfo["relativePositions"], output["section_id_map"]
    )
    output.pop("section_id_map")
    return {**output, "relativePositions": relativePositions}


@router.post(C.ROUTE_SECTION_TO_DICT)
def route_section_to_yaml(x: SectionToDictRequest):
    e = export_section_to_dict(x.project, x.sectionId)
    return e.output


