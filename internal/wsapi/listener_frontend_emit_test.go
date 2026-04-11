package wsapi

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"

	"setta/internal/projectstate"
)

func TestDecodeListenerChatStateAcceptsJSONString(t *testing.T) {
	t.Parallel()

	raw := quotedJSONRawMessage(`{"messages":[{"role":"user","content":"hello"}],"inputText":"draft","waitingForResponse":true,"toolCallArguments":{"tool":"arg"},"branches":{}}`)
	state, err := decodeListenerChatState("chat-section", raw)
	if err != nil {
		t.Fatalf("decode listener chat state from JSON string: %v", err)
	}
	if state.InputText != "draft" {
		t.Fatalf("expected inputText draft, got %#v", state.InputText)
	}
	if !state.WaitingForResponse {
		t.Fatalf("expected waitingForResponse true, got %#v", state.WaitingForResponse)
	}
	if state.ToolCallArguments["tool"] != "arg" {
		t.Fatalf("expected toolCallArguments[tool]=arg, got %#v", state.ToolCallArguments)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected one message, got %#v", state.Messages)
	}
}

func TestDecodeListenerChatStateRejectsPythonLiteralString(t *testing.T) {
	t.Parallel()

	raw := quotedJSONRawMessage(`{'messages': [{'role': 'user', 'content': 'hello'}], 'inputText': 'draft', 'waitingForResponse': True, 'toolCallArguments': {'tool': 'arg'}, 'branches': {}}`)
	if _, err := decodeListenerChatState("chat-section", raw); err == nil {
		t.Fatalf("expected python literal chat payload rejection")
	} else if !strings.Contains(err.Error(), "must be valid JSON") {
		t.Fatalf("expected valid JSON error, got %v", err)
	}
}

func TestApplyListenerPluginSectionUpdateStructuredJSONString(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, map[string]any{"existing": 1})
	raw := quotedJSONRawMessage(`{"data":{"replaced":true},"merge":false,"kind":"live","schemaVersion":7}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err != nil {
		t.Fatalf("apply structured plugin payload: %v", err)
	}

	payload := listenerEmitSectionPayload(t, project, sectionID)
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin data payload, got %#v", payload["data"])
	}
	if len(data) != 1 || data["replaced"] != true {
		t.Fatalf("expected replaced-only plugin data, got %#v", data)
	}
	if payload["kind"] != "live" {
		t.Fatalf("expected plugin kind live, got %#v", payload["kind"])
	}
	if fmt.Sprint(payload["schemaVersion"]) != "7" {
		t.Fatalf("expected plugin schemaVersion 7, got %#v", payload["schemaVersion"])
	}
}

func TestApplyListenerPluginSectionUpdateTreatsKindKeyAsPlainDataWithoutControlDataField(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, map[string]any{"existing": 1})
	raw := quotedJSONRawMessage(`{"kind":"data-kind","points":[1,2,3]}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err != nil {
		t.Fatalf("apply plain-data plugin payload: %v", err)
	}

	payload := listenerEmitSectionPayload(t, project, sectionID)
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin data payload, got %#v", payload["data"])
	}
	if fmt.Sprint(data["existing"]) != "1" {
		t.Fatalf("expected existing data to remain, got %#v", data)
	}
	if data["kind"] != "data-kind" {
		t.Fatalf("expected kind to remain in data payload, got %#v", data)
	}
}

func TestApplyListenerPluginSectionUpdateTreatsMixedDataPayloadAsPlainPatch(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, map[string]any{
		"existing": 1,
		"keep":     true,
	})
	raw := quotedJSONRawMessage(`{"data":{"inner":true},"points":[1,2,3]}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err != nil {
		t.Fatalf("apply mixed plugin payload: %v", err)
	}

	payload := listenerEmitSectionPayload(t, project, sectionID)
	data, ok := payload["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin data payload, got %#v", payload["data"])
	}
	if fmt.Sprint(data["existing"]) != "1" || data["keep"] != true {
		t.Fatalf("expected existing data to remain, got %#v", data)
	}
	if nested, ok := data["data"].(map[string]any); !ok || nested["inner"] != true {
		t.Fatalf("expected nested data field to remain plain data, got %#v", data["data"])
	}
}

func TestApplyListenerPluginSectionUpdateRejectsInvalidDataField(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, nil)
	raw := quotedJSONRawMessage(`{"data":"invalid"}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err == nil {
		t.Fatalf("expected invalid plugin data field rejection")
	} else if !strings.Contains(err.Error(), "data field must be an object") {
		t.Fatalf("expected data field object error, got %v", err)
	}
}

func TestApplyListenerPluginSectionUpdateRejectsInvalidMergeFlag(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, nil)
	raw := quotedJSONRawMessage(`{"data":{"next":true},"merge":"invalid"}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err == nil {
		t.Fatalf("expected invalid merge flag rejection")
	} else if !strings.Contains(err.Error(), "merge flag must be boolean") {
		t.Fatalf("expected merge flag error, got %v", err)
	}
}

func TestApplyListenerPluginSectionUpdateRejectsPythonLiteralPayload(t *testing.T) {
	t.Parallel()

	project, sectionID := newListenerEmitPluginProject(t, nil)
	raw := quotedJSONRawMessage(`{'data': {'invalid': True}}`)
	if err := applyListenerPluginSectionUpdate(&project, sectionID, raw); err == nil {
		t.Fatalf("expected python literal plugin payload rejection")
	} else if !strings.Contains(err.Error(), "must be valid JSON") {
		t.Fatalf("expected valid JSON error, got %v", err)
	}
}

func newListenerEmitPluginProject(t *testing.T, initialData map[string]any) (projectstate.Project, string) {
	t.Helper()

	runtime := newRouteProjectRuntime(t, "project-a")
	sectionID := createRouteTopLevelSection(t, runtime, "project-a", "Plugin", "plugin")
	snapshot := runtime.Snapshot()
	project, err := snapshot.Document.ProjectByID("project-a")
	if err != nil {
		t.Fatalf("project for plugin listener test: %v", err)
	}
	if initialData == nil {
		return project, sectionID
	}
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		t.Fatalf("resolve plugin section: %v", err)
	}
	if err := project.SetSectionFieldForVariant(section.ID, variant.ID, "data", initialData); err != nil {
		t.Fatalf("set initial plugin data: %v", err)
	}
	return project, sectionID
}

func listenerEmitSectionPayload(t *testing.T, project projectstate.Project, sectionID string) map[string]any {
	t.Helper()

	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		t.Fatalf("resolve section for payload: %v", err)
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		t.Fatalf("effective section payload: %v", err)
	}
	return payload
}

func quotedJSONRawMessage(value string) json.RawMessage {
	return json.RawMessage(strconv.Quote(value))
}
