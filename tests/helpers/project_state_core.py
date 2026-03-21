from setta.types.code_obj_impls import BaseCodeObjImpl
from setta.types.id import ID
from setta.types.section_impls import BaseSectionImpl, SectionType
from setta.utils.generate_memorable_string import generate_memorable_string


def compute_initial_nonPresetImpls(impl: BaseCodeObjImpl | BaseSectionImpl) -> list[ID]:
    return [] if impl.isPreset else [impl.id]


def get_default_section_core_name(implType: SectionType) -> str:
    match implType:
        case SectionType.GlobalVariables:
            return "Global Variables"
        case SectionType.GenPythonCode:
            return "Generated Python Code"
        case SectionType.GenPythonMetadata:
            return "Generated Python Metadata"
        case SectionType.StateMachineStart:
            return "State Machine Start"
        case SectionType.StateMachineGate:
            return "State Machine Gate"
        case SectionType.StateMachineEnd:
            return "State Machine End"
    return generate_memorable_string()
