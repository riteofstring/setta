package httpapi

import (
	"reflect"
	"testing"

	"github.com/setta/python-canvas/backend/internal/contracts"
)

func TestProjectClipboardPayloadV1MapsOnlyAuthoredAggregateState(t *testing.T) {
	payload := projectClipboardPayloadForHTTPTest()
	aggregatePayload, err := projectClipboardPayloadFromV1(payload)
	if err != nil {
		t.Fatalf("projectClipboardPayloadFromV1() error = %v", err)
	}
	state, err := aggregatePayload.State()
	if err != nil {
		t.Fatalf("clipboard State() error = %v", err)
	}
	if state.Project.ID == "project:fixture" || state.PythonTarget.Suffix == "" {
		t.Fatalf("clipboard aggregate retained project runtime state %#v", state.Project)
	}
	mapped, err := projectClipboardPayloadV1(aggregatePayload)
	if err != nil {
		t.Fatalf("projectClipboardPayloadV1() error = %v", err)
	}
	if !reflect.DeepEqual(mapped, payload) {
		t.Fatalf("mapped payload = %#v, want %#v", mapped, payload)
	}
}

func TestProjectClipboardPayloadV1MappingRejectsUnsupportedVersion(t *testing.T) {
	payload := projectClipboardPayloadForHTTPTest()
	payload.Version = contracts.ProjectClipboardPayloadVersionV1 + 1
	if _, err := projectClipboardPayloadFromV1(payload); err == nil {
		t.Fatal("projectClipboardPayloadFromV1() accepted an unsupported version")
	}
}
