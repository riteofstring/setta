from types import SimpleNamespace
from unittest import TestCase

from setta.code_gen.value_codec import PythonValueCodec
from setta.code_gen.value_mode import PythonValueMode
from setta.types.dependency_value import (
    Base64DependencyValue,
    FileReadDependencyValue,
)


class PythonValueCodecTest(TestCase):
    def _build_codec(
        self,
        mode: PythonValueMode,
        alias: str | None = "_helpers",
    ) -> PythonValueCodec:
        dep_graph = SimpleNamespace(graph={})
        return PythonValueCodec(
            dep_graph,
            lambda _: "",
            mode=mode,
            helper_module_alias=alias,
        )

    def test_live_mode_renders_inline_base64_dict(self) -> None:
        codec = self._build_codec(PythonValueMode.LIVE_RUNTIME)
        rendered = codec.format_dependency_value(Base64DependencyValue("c29tZQ=="))
        self.assertEqual(
            rendered,
            "'c29tZQ=='",
        )
        self.assertEqual(codec.required_imports, ())

    def test_packaged_mode_uses_helper_for_base64(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        rendered = codec.format_dependency_value(Base64DependencyValue("c29tZQ=="))
        self.assertEqual(
            rendered,
            "_helpers.decode_base64_value('c29tZQ==')",
        )
        self.assertEqual(
            codec.required_imports,
            ("from setta.code_gen.python import value_helpers as _helpers",),
        )

    def test_packaged_mode_uses_helper_for_file_reads(self) -> None:
        codec = self._build_codec(PythonValueMode.PACKAGED_RUNTIME)
        rendered = codec.format_dependency_value(
            FileReadDependencyValue("/tmp/file.txt")
        )
        self.assertEqual(
            rendered,
            "_helpers.read_file_value('/tmp/file.txt')",
        )
        self.assertEqual(
            codec.required_imports,
            ("from setta.code_gen.python import value_helpers as _helpers",),
        )
