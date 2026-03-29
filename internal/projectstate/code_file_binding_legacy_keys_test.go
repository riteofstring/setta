package projectstate

import "testing"

func TestEffectiveCodeFileBindingIgnoresLegacyPayloadKeys(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"codeFileBinding": map[string]any{
			"path":       "pkg/legacy.py",
			"accessMode": "read_only",
		},
	}

	if binding := effectiveCodeFileBinding(payload, nil); binding != nil {
		t.Fatalf("expected legacy payload keys to be ignored, got %#v", binding)
	}
}

func TestEffectiveCodeSectionBindingAccessModeIgnoresLegacyPayloadKey(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"codeFileBinding": map[string]any{
			"accessMode": "read_only",
		},
	}

	if got := effectiveCodeSectionBindingAccessMode(payload, nil); got != CodeFileAccessModeReadWrite {
		t.Fatalf("expected default read_write access mode, got %q", got)
	}
}

func TestReadableCodeFilePathIgnoresLegacyPayloadPath(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"codeFileBinding": map[string]any{
			"path": "pkg/legacy.py",
		},
	}

	if got := readableCodeFilePath(payload, SectionImpl{}); got != "" {
		t.Fatalf("expected legacy payload path to be ignored, got %q", got)
	}
}
