package projectstate

import (
	"errors"
	"testing"
)

// Base impl metadata should stay writable through the config owner so scoped
// follow-on edits like Quick Info descriptions do not need a separate path.
func TestProjectUpdateParamImplConfigUpdatesDescription(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.UpdateParamImplConfig("dict-a", "shared-child", map[string]any{"description": "Updated description"}); err != nil {
		t.Fatalf("update param description: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve param after description update: %v", err)
	}
	if got := payloadRawStringField(payload, "description"); got != "Updated description" {
		t.Fatalf("expected updated description, got %q", got)
	}
}

// Numeric config changes should reuse the same value conversion path used by
// impl switching so persisted slider values clamp into the new range.
func TestProjectUpdateParamImplConfigClampsSliderValue(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("dict-a", "shared-child", "SliderParam"); err != nil {
		t.Fatalf("change param impl to slider: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("dict-a", "shared-child", "75"); err != nil {
		t.Fatalf("seed slider value: %v", err)
	}
	if err := project.UpdateParamImplConfig("dict-a", "shared-child", map[string]any{"max": 10}); err != nil {
		t.Fatalf("update slider config: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("dict-a", "shared-child")
	if err != nil {
		t.Fatalf("resolve slider after config update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "10" {
		t.Fatalf("expected clamped slider value 10, got %q", got)
	}
}

// Dropzone config writes must normalize persisted state when the mode switches
// to stateless so follow-on runtime behavior stays consistent.
func TestProjectUpdateParamImplConfigClearsStatelessDropzoneValue(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "DropzoneParam"); err != nil {
		t.Fatalf("change meta control impl to dropzone: %v", err)
	}
	if err := project.SetSectionCodeObjectValue("meta-section", "meta-param", `{"version":1,"attachments":[{"kind":"text","id":"text:first","name":"Dropped text","text":"first"}]}`); err != nil {
		t.Fatalf("seed dropzone value: %v", err)
	}
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{"mode": "STATELESS"}); err != nil {
		t.Fatalf("update dropzone config: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve dropzone after config update: %v", err)
	}
	if got := payloadRawStringField(payload, "value"); got != "" {
		t.Fatalf("expected stateless dropzone value to clear, got %q", got)
	}
}

// Date params should stay internally coherent when include-time is enabled,
// even if the incoming config also asks for multiple selection.
func TestProjectUpdateParamImplConfigForcesSingleDateSelectionWhenIncludingTime(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("meta-section", "meta-param", "DateParam"); err != nil {
		t.Fatalf("change meta control impl to date: %v", err)
	}
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{
		"dateSelectionMode": "multiple",
		"dateIncludesTime":  true,
	}); err != nil {
		t.Fatalf("update date config: %v", err)
	}

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve date param after config update: %v", err)
	}
	if got := payloadStringField(payload, "dateSelectionMode"); got != "single" {
		t.Fatalf("expected dateSelectionMode single, got %q", got)
	}
	if !payloadBoolField(payload, "dateIncludesTime") {
		t.Fatalf("expected dateIncludesTime true, got %#v", payload)
	}
}

// Unknown fields should fail loudly instead of being silently persisted into
// arbitrary impl payloads.
func TestProjectUpdateParamImplConfigRejectsUnsupportedField(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	err := project.UpdateParamImplConfig("dict-a", "shared-child", map[string]any{"mode": "STATELESS"})
	if !errors.Is(err, ErrUpdateParamImplConfigFieldUnsupported) {
		t.Fatalf("expected ErrUpdateParamImplConfigFieldUnsupported, got %v", err)
	}
}

// Invalid combined numeric config should fail before the project state is
// mutated so MCP callers cannot persist unusable slider ranges.
func TestProjectUpdateParamImplConfigRejectsInvalidSliderRange(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)
	if err := project.ChangeParamImpl("dict-a", "shared-child", "SliderParam"); err != nil {
		t.Fatalf("change param impl to slider: %v", err)
	}

	err := project.UpdateParamImplConfig("dict-a", "shared-child", map[string]any{"min": 10, "max": 5})
	if !errors.Is(err, ErrUpdateParamImplConfigFieldInvalid) {
		t.Fatalf("expected ErrUpdateParamImplConfigFieldInvalid, got %v", err)
	}
}
