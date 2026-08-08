from pathlib import Path

from setta.types.artifact import DrawAreaLayer, DrawAreaLayerItem
from setta.types.core import Core, Variant
from setta.types.generated.effective_impls import set_effective_impl_value
from setta.types.generated.impl_args_as_typed_dicts import (
    CodeSectionImplArgsWithCallable,
    DrawSectionImplArgsWithCallable,
)
from setta.types.section_impls import (
    CodeFileAccessMode,
    CodeFileBinding,
    CodeSectionImpl,
    DrawSectionImpl,
)


def test_set_effective_impl_coerces_code_file_binding_into_model():
    core = Core()
    impl = CodeSectionImpl()
    variant = Variant(impl=impl.id, nonPresetImpls=[impl.id])

    binding_payload = CodeFileBinding(
        canonical_path=Path("/tmp/code.py"),
        access_mode=CodeFileAccessMode.read_only,
    )

    updated_impl = set_effective_impl_value(
        impl,
        core,
        variant,
        CodeSectionImplArgsWithCallable(codeFileBinding=binding_payload),
    )

    assert "codeFileBinding" in core.sharedModifier
    stored_binding = core.sharedModifier["codeFileBinding"]
    assert isinstance(stored_binding, CodeFileBinding)
    assert stored_binding.access_mode == CodeFileAccessMode.read_only
    assert stored_binding.canonical_path == Path("/tmp/code.py")
    assert stored_binding.snapshot_dir == Path("/tmp")

    assert impl.codeFileBinding is None
    assert "codeFileBinding" not in variant.modifier

    assert isinstance(updated_impl.codeFileBinding, CodeFileBinding)
    assert updated_impl.codeFileBinding.canonical_path == Path("/tmp/code.py")


def test_set_effective_impl_coerces_variant_modifier_layers():
    core = Core()
    impl = DrawSectionImpl(isPreset=True)
    variant = Variant(impl=impl.id, nonPresetImpls=[])

    layers_payload = [
        DrawAreaLayer(
            name="Layer 1",
            elements=[DrawAreaLayerItem(dataPath="foo", transformId="bar")],
            visible=False,
            layerOpacity=0.5,
        )
    ]

    updated_impl = set_effective_impl_value(
        impl,
        core,
        variant,
        DrawSectionImplArgsWithCallable(layers=layers_payload),
    )

    assert "layers" not in core.sharedModifier

    assert "layers" in variant.modifier
    stored_layers = variant.modifier["layers"]
    assert isinstance(stored_layers, list)
    assert len(stored_layers) == 1
    assert isinstance(stored_layers[0], DrawAreaLayer)
    assert stored_layers[0].name == "Layer 1"
    assert stored_layers[0].visible is False

    assert isinstance(updated_impl.layers, list)
    assert isinstance(updated_impl.layers[0], DrawAreaLayer)
    assert updated_impl.layers[0].layerOpacity == 0.5
