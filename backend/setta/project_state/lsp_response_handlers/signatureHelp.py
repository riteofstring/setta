import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Callable

import docstring_parser
from lsprotocol import types as LSPTypes

from setta.types.code_obj_impls import (
    CodeObjType,
    ParameterPassingStyle,
)
from setta.types.core import Core
from setta.types.generated.impl_creation_fns import create_code_obj_impl
from setta.types.generated.settings_state import SettingsState

if TYPE_CHECKING:
    from setta.types.generated.unions import BaseParamCodeObjImplUnion
    from setta.types.id import ID

logger = logging.getLogger(__name__)


@dataclass
class ProcessedVarDocstring:
    default: str | None
    description: str | None


ProcessedVarDocstringDict = dict[str, ProcessedVarDocstring]


@dataclass
class ParamProposal:
    name: str
    default: str | None
    description: str | None
    typeAnnotation: str | None = None


class SignatureHelpStatus(str, Enum):
    MATCHED = "matched"
    NO_MATCH = "no_match"
    SKIPPED = "skipped"


def process_signature_help_response(
    settings: SettingsState,
    response: LSPTypes.TextDocumentSignatureHelpResponse,
):
    result = response.result
    if not result or not result.signatures:
        logger.debug(
            "signature_help.process_signature_help_response empty signatures result=%s",
            result is not None,
        )
        return None
    return parse_signature(settings, result.signatures[0])


def parse_signature(settings: SettingsState, signature: LSPTypes.SignatureInformation):
    documentation = lsp_documentation_to_str(signature.documentation)
    param_labels = []
    if signature.parameters:
        param_labels = [param.label for param in signature.parameters]
    logger.debug(
        "signature_help.parse_signature label=%s param_count=%s param_labels=%s doc_len=%s",
        signature.label,
        len(signature.parameters or []),
        param_labels,
        len(documentation),
    )
    var_docstrings = process_docstring(documentation)
    codeObjs, codeObjImplMap = wrapper_parse_signature(
        settings, signature, var_docstrings, get_pyright_param_proposals
    )
    if len(codeObjs) == 0:
        codeObjs, codeObjImplMap = wrapper_parse_signature(
            settings, signature, var_docstrings, get_docstring_parser_param_proposals
        )
    return documentation, codeObjs, codeObjImplMap


def process_docstring(documentation: str):
    output: ProcessedVarDocstringDict = {}
    if documentation:
        parsed = docstring_parser.parse(documentation)
        for v in parsed.params:
            var_name = extract_variable_name(v.arg_name)
            if var_name:
                output[var_name] = ProcessedVarDocstring(
                    default=v.default, description=v.description
                )
        return output
    return output


def wrapper_parse_signature(
    settings: SettingsState,
    signature: LSPTypes.SignatureInformation,
    docstring: ProcessedVarDocstringDict,
    get_proposed_params: Callable[
        [LSPTypes.SignatureInformation, ProcessedVarDocstringDict],
        list[ParamProposal],
    ],
):
    params = get_proposed_params(signature, docstring)
    logger.debug(
        "signature_help.wrapper_parse_signature parser=%s proposals=%s",
        getattr(get_proposed_params, "__name__", "unknown"),
        [(proposal.name, proposal.default) for proposal in params],
    )
    codeObjs: list[Core] = []
    codeObjImplMap: dict["ID", "BaseParamCodeObjImplUnion"] = {}
    positional_only_indicator_idx = -1
    keyword_only_indicator_idx = -1

    for idx, paramProposal in enumerate(params):
        name = paramProposal.name
        if name == "/":
            positional_only_indicator_idx = idx
        if name == "*":
            keyword_only_indicator_idx = idx

    for idx, paramProposal in enumerate(params):
        name = paramProposal.name
        default = paramProposal.default
        description = paramProposal.description
        type_annotation = paramProposal.typeAnnotation
        if paramProposal.name in [None, "/", "*", "", "..."]:
            continue

        passingStyle = get_passing_style(
            idx,
            positional_only_indicator_idx,
            keyword_only_indicator_idx,
            paramProposal.name,
        )

        if not default:
            default = ""

        if not description:
            var_docstring = docstring.get(name)
            description = var_docstring.description if var_docstring else ""
            if not description:
                description = ""

        # Append parsed information to list
        codeObjImpl = create_code_obj_impl(
            CodeObjType.CodeParam,
            settings.codeParamCodeObjDefault,
            {
                "defaultVal": default,
                "description": description,
                "passingStyle": passingStyle,
                "typeAnnotation": type_annotation or "",
            },
        )
        codeObj = Core(name=name.lstrip("*"))
        codeObjs.append(codeObj)
        codeObjImplMap[codeObj.id] = codeObjImpl

    return codeObjs, codeObjImplMap


def get_docstring_parser_param_proposals(_, docstring: ProcessedVarDocstringDict):
    return [
        ParamProposal(name=k, default=v.default, description=v.description)
        for k, v in docstring.items()
    ]


def get_pyright_param_proposals(signature: LSPTypes.SignatureInformation, _):
    proposals: list[ParamProposal] = []
    parameters = signature.parameters
    if not parameters:
        return proposals
    params = []
    for p in parameters:
        params.append((p.label, lsp_documentation_to_str(p.documentation)))

    for label, documentation in params:
        name, type_annotation, default = parse_param_name(label)
        if not name:
            continue
        proposals.append(
            ParamProposal(
                name=name,
                default=default,
                description=documentation,
                typeAnnotation=type_annotation,
            )
        )

    return proposals


def parse_param_name(param_string: str):
    # Special cases for / and *
    if param_string in ["/", "*"]:
        return param_string, None, None

    # Extract default value if present
    default_value = None
    if "=" in param_string:
        param_string, default_part = param_string.split("=", 1)
        default_value = default_part.strip()

    # Extract type annotation if present
    type_annotation = None
    if ":" in param_string:
        param_string, type_part = param_string.split(":", 1)
        type_annotation = type_part.strip()

    # Variable name is what remains, trimmed of whitespace
    name = extract_variable_name(param_string)

    return name, type_annotation, default_value


def extract_variable_name(code_string: str) -> str | None:
    # Find potential variable names including * and ** prefixes
    potential_names = re.findall(r"\*{1,2}?[a-zA-Z_]\w*|\b[a-zA-Z_]\w*\b", code_string)

    # For names with * or **, we don't need to check isidentifier() since they're not standard identifiers
    # Just return the first match
    if potential_names:
        return potential_names[0]
    return None


def lsp_documentation_to_str(documentation: str | LSPTypes.MarkupContent | None):
    if not documentation:
        return ""
    if isinstance(documentation, LSPTypes.MarkupContent):
        documentation = documentation.value
    return documentation


def get_passing_style(
    idx: int,
    positional_only_indicator_idx: int,
    keyword_only_indicator_idx: int,
    name: str,
):
    if name.startswith("**"):  # Check for **kwargs first
        return ParameterPassingStyle.KWARGS
    if name.startswith("*"):  # Check for *args second
        return ParameterPassingStyle.ARGS
    if 0 <= idx < positional_only_indicator_idx:  # Then check position
        return ParameterPassingStyle.POSITIONAL_ONLY
    if keyword_only_indicator_idx > -1 and idx > keyword_only_indicator_idx:
        return ParameterPassingStyle.KEYWORD_ONLY
    return ParameterPassingStyle.DEFAULT
