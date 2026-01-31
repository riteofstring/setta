import json
from collections.abc import Callable
from types import SimpleNamespace
from typing import cast

import pytest
from setta.code_gen.dependency_graph import DependencyGraph, ParamNode, SectionNode
from setta.code_gen.value_codec import PythonValueCodec
from setta.code_gen.value_mode import PythonValueMode
from setta.types.code_obj_impls import CodeObjType, ParameterPassingStyle
from setta.types.dependency_key import create_dep_key
from setta.types.binary_content import BinaryContentRef
from setta.types.dependency_value import (
    BinaryDependencyValue,
    FileReadDependencyValue,
    LiteralDependencyValue,
)
from setta.types.generated.dependency_keys import BaseDependencyKeyUnion
from setta.types.id import ID
from setta.types.project_config import (
    CodeObjValueRepresentationMode,
    SectionRepresentationMode,
)
from setta.types.section_impls import SectionType

class TestPythonValueCodec:
    def _build_codec(
        self,
        mode: PythonValueMode,
        alias: str = "_helpers",
        graph: dict | None = None,
        lookup: Callable[[BaseDependencyKeyUnion], str] | None = None,
    ) -> PythonValueCodec:
        dep_graph = cast(
            "DependencyGraph", SimpleNamespace(graph={} if graph is None else graph)
        )
        var_lookup = lookup or (lambda _: "")
        return PythonValueCodec(
            dep_graph,
            var_lookup,
            mode=mode,
            helper_module_alias=alias,
        )

    def test_live_mode_renders_inline_binary_dict(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        payload = BinaryContentRef(
            contentId="binary-id",
            byteLength=4,
            mimeType="image/png",
        )
        rendered = codec.format_dependency_value(BinaryDependencyValue(payload))
        assert (
            rendered
            == "{'contentId': 'binary-id', 'byteLength': 4, 'mimeType': 'image/png', 'sha256': None}"
        )
        assert codec.required_imports == ()

    def test_packaged_mode_uses_helper_for_binary(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        payload = BinaryContentRef(
            contentId="binary-id",
            byteLength=4,
            mimeType="image/png",
        )
        rendered = codec.format_dependency_value(BinaryDependencyValue(payload))
        assert (
            rendered
            == "_helpers.read_binary_value({'contentId': 'binary-id', 'byteLength': 4, 'mimeType': 'image/png', 'sha256': None})"
        )
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )

    def test_format_callable_section_handles_passing_styles(self) -> None:
        args_key = create_dep_key(sectionId=ID("section"), codeObjId=ID("args"))
        kw_key = create_dep_key(sectionId=ID("section"), codeObjId=ID("color"))
        graph = {
            args_key: ParamNode(
                id=ID("param-args"),
                name="args",
                full_path_name="section.args",
                type=CodeObjType.CodeParam,
                isTopLevel=False,
                deps={},
                value=LiteralDependencyValue("value"),
                passing_style=ParameterPassingStyle.ARGS,
            ),
            kw_key: ParamNode(
                id=ID("param-color"),
                name="color",
                full_path_name="section.color",
                type=CodeObjType.CodeParam,
                isTopLevel=False,
                deps={},
                value=LiteralDependencyValue("blue"),
                passing_style=ParameterPassingStyle.KEYWORD_ONLY,
            ),
        }
        lookup = {
            args_key: "self.section.args",
            kw_key: "self.section.color",
        }
        codec = self._build_codec(
            PythonValueMode.LIVE_RUNTIME,
            graph=graph,
            lookup=lambda dep_key: lookup[dep_key],
        )
        section_node = SectionNode(
            id=ID("section"),
            name="Call",
            full_path_name="call",
            type=SectionType.Callable,
            isTopLevel=True,
            deps={args_key: True, kw_key: True},
            value=LiteralDependencyValue("my_callable"),
        )
        rendered = codec.format_section(section_node)
        assert rendered == "my_callable(*self.section.args, color=self.section.color)"

    def test_text_param_formats_as_string_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-text"),
            name="text",
            full_path_name="section.text",
            type=CodeObjType.TextParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("2+2"),
            passing_style=ParameterPassingStyle.DEFAULT,
        )
        assert codec.format_param_expression(param_node) == "'2+2'"

    def test_code_param_formats_as_raw_expression(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-code"),
            name="code",
            full_path_name="section.code",
            type=CodeObjType.CodeParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("2+2"),
            passing_style=ParameterPassingStyle.DEFAULT,
        )
        assert codec.format_param_expression(param_node) == "2+2"

    def test_slider_param_json_representation_parses_payload(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-code"),
            name="code",
            full_path_name="section.code",
            type=CodeObjType.SliderParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("[1,2,3]"),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.json_parsed,
        )
        assert codec.format_param_expression(param_node) == "[1, 2, 3]"

    def test_code_param_string_representation_quotes_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-code"),
            name="code",
            full_path_name="section.code",
            type=CodeObjType.CodeParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("2+2"),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.string,
        )
        assert codec.format_param_expression(param_node) == "'2+2'"

    def test_json_representation_invalid_payload_falls_back_to_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-text"),
            name="text",
            full_path_name="section.text",
            type=CodeObjType.SliderParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("{invalid"),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.json_parsed,
        )
        assert codec.format_param_expression(param_node) == "'{invalid'"

    def test_format_text_block_without_value_returns_none(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Text",
            full_path_name="text",
            type=SectionType.TextBlock,
            isTopLevel=True,
            deps={},
            value=None,
        )
        assert codec.format_section(section_node) == "None"

    def test_prompt_section_formats_as_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Prompt",
            full_path_name="prompt",
            type=SectionType.Prompt,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("Hello Ada"),
        )
        assert codec.format_section(section_node) == "'Hello Ada'"

    def test_draw_section_uses_dependency_value_helpers(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Draw",
            full_path_name="draw",
            type=SectionType.Draw,
            isTopLevel=True,
            deps={},
            value=FileReadDependencyValue("/tmp/draw.png"),
            representation=SectionRepresentationMode.file_read,
        )
        rendered = codec.format_section(section_node)
        assert rendered == "_helpers.read_file_value('/tmp/draw.png')"
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )

    def test_draw_section_expression_returns_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Draw",
            full_path_name="draw",
            type=SectionType.Draw,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("None"),
            representation=SectionRepresentationMode.expression,
        )
        assert codec.format_section(section_node) == "None"

    def test_image_section_with_literal_path_is_quoted(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Image",
            full_path_name="image",
            type=SectionType.Image,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("artifacts/reversed_image.png"),
            representation=SectionRepresentationMode.file_path,
        )
        assert (
            codec.format_section(section_node)
            == "'artifacts/reversed_image.png'"
        )

    def test_image_section_uses_file_read_value_helpers(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Image",
            full_path_name="image",
            type=SectionType.Image,
            isTopLevel=True,
            deps={},
            value=FileReadDependencyValue("/tmp/image.png"),
            representation=SectionRepresentationMode.file_read,
        )
        rendered = codec.format_section(section_node)
        assert rendered == "_helpers.read_file_value('/tmp/image.png')"
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )

    def test_image_section_expression_returns_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Image",
            full_path_name="image",
            type=SectionType.Image,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("None"),
            representation=SectionRepresentationMode.expression,
        )
        assert codec.format_section(section_node) == "None"

    def test_chat_section_expression_renders_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        payload = "{'messages': [], 'inputText': '', 'waitingForResponse': False, 'toolCallArguments': {}}"
        section_node = SectionNode(
            id=ID("section"),
            name="Chat",
            full_path_name="chat",
            type=SectionType.Chat,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue(payload),
            representation=SectionRepresentationMode.expression,
        )
        assert codec.format_section(section_node) == payload

    def test_chat_section_file_path_quotes_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Chat",
            full_path_name="chat",
            type=SectionType.Chat,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("/tmp/chat.json"),
            representation=SectionRepresentationMode.file_path,
        )
        assert codec.format_section(section_node) == "'/tmp/chat.json'"

    def test_chat_section_file_read_uses_helpers(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Chat",
            full_path_name="chat",
            type=SectionType.Chat,
            isTopLevel=True,
            deps={},
            value=FileReadDependencyValue("/tmp/chat.json"),
            representation=SectionRepresentationMode.file_read,
        )
        rendered = codec.format_section(section_node)
        assert rendered == "_helpers.read_file_value('/tmp/chat.json')"
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )

    def test_draw_section_without_value_raises(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Draw",
            full_path_name="draw",
            type=SectionType.Draw,
            isTopLevel=True,
            deps={},
            value=None,
            representation=SectionRepresentationMode.file_read,
        )
        with pytest.raises(ValueError):
            codec.format_section(section_node)

    def test_packaged_mode_uses_helper_for_file_reads(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        rendered = codec.format_dependency_value(
            FileReadDependencyValue("/tmp/file.txt")
        )
        assert rendered == "_helpers.read_file_value('/tmp/file.txt')"
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )

    def test_meta_control_formatting_uses_code_obj_type(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        section_node = SectionNode(
            id=ID("section"),
            name="Meta",
            full_path_name="meta",
            type=SectionType.MetaControl,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("secret"),
            control_code_obj_type=CodeObjType.TextParam,
        )
        rendered = codec.format_section(section_node)
        assert rendered == "'secret'"

    def test_dropzone_param_empty_value_renders_empty_list(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-dropzone"),
            name="dropzone",
            full_path_name="section.dropzone",
            type=CodeObjType.DropzoneParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue(""),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.file_path,
        )
        assert codec.format_param_expression(param_node) == "[]"

    def test_dropzone_param_payload_renders_as_attachment_list(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        payload = {
            "version": 1,
            "attachments": [
                {
                    "kind": "file",
                    "id": "artifacts/test.txt",
                    "name": "test.txt",
                    "mimeType": "text/plain",
                    "size": 12,
                },
                {
                    "kind": "text",
                    "id": "text:abc",
                    "name": "Dropped text",
                    "text": "hello",
                },
            ],
        }
        param_node = ParamNode(
            id=ID("param-dropzone"),
            name="dropzone",
            full_path_name="section.dropzone",
            type=CodeObjType.DropzoneParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue(json.dumps(payload)),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.file_path,
        )
        expected = repr(["artifacts/test.txt", "hello"])
        assert codec.format_param_expression(param_node) == expected

    def test_dropzone_param_invalid_payload_falls_back_to_literal(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        param_node = ParamNode(
            id=ID("param-dropzone"),
            name="dropzone",
            full_path_name="section.dropzone",
            type=CodeObjType.DropzoneParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue("{invalid"),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.file_path,
        )
        assert codec.format_param_expression(param_node) == "'{invalid'"

    def test_dropzone_param_file_read_uses_helpers(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        payload = {
            "attachments": [
                {
                    "kind": "file",
                    "id": "/tmp/test.txt",
                    "name": "test.txt",
                },
                {
                    "kind": "text",
                    "id": "text:abc",
                    "name": "Dropped text",
                    "text": "hello",
                },
            ],
        }
        param_node = ParamNode(
            id=ID("param-dropzone"),
            name="dropzone",
            full_path_name="section.dropzone",
            type=CodeObjType.DropzoneParam,
            isTopLevel=True,
            deps={},
            value=LiteralDependencyValue(json.dumps(payload)),
            passing_style=ParameterPassingStyle.DEFAULT,
            value_representation=CodeObjValueRepresentationMode.file_read,
        )
        rendered = codec.format_param_expression(param_node)
        assert rendered == "[_helpers.read_file_value('/tmp/test.txt'), 'hello']"
        assert codec.required_imports == (
            "from setta.code_gen.python import value_helpers as _helpers",
        )
