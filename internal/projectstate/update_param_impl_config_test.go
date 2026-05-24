package projectstate

import (
	"errors"
	"strings"
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

// Text/date/time param families should keep their documented default and
// accepted control settings on the live param-config mutation surface.
func TestProjectUpdateParamImplConfigSupportsTextDateAndTimeControlFamilies(t *testing.T) {
	t.Parallel()

	project := codeObjectNameTestProject(t)

	if err := project.ChangeParamImpl("meta-section", "meta-param", "TextParam"); err != nil {
		t.Fatalf("change meta control impl to text: %v", err)
	}
	assertTextParamControlDefaults(t, project)

	if err := project.ChangeParamImpl("meta-section", "meta-param", "DateParam"); err != nil {
		t.Fatalf("change meta control impl to date: %v", err)
	}
	assertDateParamControlDefaults(t, project)
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{
		"dateControlMode":       "calendar",
		"dateSelectionMode":     "multiple",
		"dateCalendarWeekStart": "monday",
	}); err != nil {
		t.Fatalf("update date control config: %v", err)
	}
	assertUpdatedDateParamControlConfig(t, project)

	if err := project.ChangeParamImpl("meta-section", "meta-param", "TimeParam"); err != nil {
		t.Fatalf("change meta control impl to time: %v", err)
	}
	if err := project.UpdateParamImplConfig("meta-section", "meta-param", map[string]any{
		"timeControlMode": "display",
	}); err != nil {
		t.Fatalf("update time control config: %v", err)
	}
	assertTimeParamControlConfig(t, project)
}

func assertTextParamControlDefaults(t *testing.T, project Project) {
	t.Helper()

	textPayload := resolveMetaParamPayload(t, project, "text param")
	if got := payloadStringField(textPayload, "uiType"); got != "plain" {
		t.Fatalf("expected text uiType plain, got %q", got)
	}
	if _, ok := textPayload["dateControlMode"]; ok {
		t.Fatalf("expected text param to omit dateControlMode, got %#v", textPayload)
	}
	if _, ok := textPayload["timeControlMode"]; ok {
		t.Fatalf("expected text param to omit timeControlMode, got %#v", textPayload)
	}
}

func assertDateParamControlDefaults(t *testing.T, project Project) {
	t.Helper()

	datePayload := resolveMetaParamPayload(t, project, "default date param")
	if got := payloadStringField(datePayload, "dateControlMode"); got != "input" {
		t.Fatalf("expected default dateControlMode input, got %q", got)
	}
	if got := payloadStringField(datePayload, "dateSelectionMode"); got != "single" {
		t.Fatalf("expected default dateSelectionMode single, got %q", got)
	}
	if got := payloadStringField(datePayload, "dateCalendarWeekStart"); got != "sunday" {
		t.Fatalf("expected default dateCalendarWeekStart sunday, got %q", got)
	}
	if payloadBoolField(datePayload, "dateIncludesTime") {
		t.Fatalf("expected default dateIncludesTime false, got %#v", datePayload)
	}
}

func assertUpdatedDateParamControlConfig(t *testing.T, project Project) {
	t.Helper()

	datePayload := resolveMetaParamPayload(t, project, "updated date param")
	if got := payloadStringField(datePayload, "dateControlMode"); got != "calendar" {
		t.Fatalf("expected updated dateControlMode calendar, got %q", got)
	}
	if got := payloadStringField(datePayload, "dateSelectionMode"); got != "multiple" {
		t.Fatalf("expected updated dateSelectionMode multiple, got %q", got)
	}
	if got := payloadStringField(datePayload, "dateCalendarWeekStart"); got != "monday" {
		t.Fatalf("expected updated dateCalendarWeekStart monday, got %q", got)
	}
}

func assertTimeParamControlConfig(t *testing.T, project Project) {
	t.Helper()

	timePayload := resolveMetaParamPayload(t, project, "time param")
	if got := payloadStringField(timePayload, "timeControlMode"); got != "display" {
		t.Fatalf("expected updated timeControlMode display, got %q", got)
	}
}

func resolveMetaParamPayload(t *testing.T, project Project, contextLabel string) map[string]any {
	t.Helper()

	payload, _, _, _, err := project.ResolveSectionCodeObject("meta-section", "meta-param")
	if err != nil {
		t.Fatalf("resolve %s: %v", contextLabel, err)
	}
	return payload
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

func TestNormalizeParamImplConfigPatchSupportsDescriptionOnlyTypes(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeParamImplConfigPatch(codeParamType, nil, map[string]any{"description": "Updated description"})
	if err != nil {
		t.Fatalf("normalize description-only config: %v", err)
	}
	if got := normalized["description"]; got != "Updated description" {
		t.Fatalf("expected normalized description, got %#v", got)
	}
}

func TestNormalizeParamImplConfigPatchRejectsUnsupportedType(t *testing.T) {
	t.Parallel()

	_, err := normalizeParamImplConfigPatch("UnsupportedParam", nil, map[string]any{"description": "ignored"})
	if !errors.Is(err, ErrUpdateParamImplConfigUnsupported) {
		t.Fatalf("expected ErrUpdateParamImplConfigUnsupported, got %v", err)
	}
}

func TestReadColorChoicesConfigValueNormalizesEntries(t *testing.T) {
	t.Parallel()

	choices, err := readColorChoicesConfigValue([]any{
		map[string]any{"color": "#112233", "description": "Primary"},
		map[string]any{"color": "#445566", "description": nil},
	})
	if err != nil {
		t.Fatalf("read color choices: %v", err)
	}
	if len(choices) != 2 {
		t.Fatalf("expected 2 color choices, got %d", len(choices))
	}
	if got := choices[0]["color"]; got != "#112233" {
		t.Fatalf("expected first color to stay normalized, got %#v", got)
	}
	if got := choices[0]["description"]; got != "Primary" {
		t.Fatalf("expected first description to stay normalized, got %#v", got)
	}
	if got := choices[1]["description"]; got != "" {
		t.Fatalf("expected nil description to normalize to empty string, got %#v", got)
	}
}

func TestReadColorChoicesConfigValueRejectsInvalidEntries(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		rawValue    any
		messagePart string
	}{
		{
			name:        "non array",
			rawValue:    "invalid",
			messagePart: "must be an array of color choice objects",
		},
		{
			name: "missing color",
			rawValue: []any{
				map[string]any{"description": "missing"},
			},
			messagePart: "each color choice must include color",
		},
		{
			name: "invalid hex",
			rawValue: []any{
				map[string]any{"color": "red"},
			},
			messagePart: "must be a hex color",
		},
		{
			name: "invalid description",
			rawValue: []any{
				map[string]any{"color": "#112233", "description": 1},
			},
			messagePart: "color choice description must be a string",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			_, err := readColorChoicesConfigValue(tc.rawValue)
			if err == nil {
				t.Fatal("expected color choice validation error")
			}
			if !strings.Contains(err.Error(), tc.messagePart) {
				t.Fatalf("expected error containing %q, got %v", tc.messagePart, err)
			}
		})
	}
}
