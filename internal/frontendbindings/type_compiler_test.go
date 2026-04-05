package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/pythonsdkcontracts"
	"setta/internal/realtime"
)

func TestCanonicalFrontendBindingTypeUsesRealtimeMirrorForPythonSDKTypes(t *testing.T) {
	t.Parallel()

	got := canonicalFrontendBindingType(reflect.TypeOf(pythonsdkcontracts.ListenerRealtimeDelta{}))
	want := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got != want {
		t.Fatalf("canonicalFrontendBindingType(ListenerRealtimeDelta) = %v, want %v", got, want)
	}
}

func TestCanonicalFrontendBindingTypeLeavesOwnerTypesUnchanged(t *testing.T) {
	t.Parallel()

	typ := reflect.TypeOf(realtime.ListenerRealtimeDelta{})
	if got := canonicalFrontendBindingType(typ); got != typ {
		t.Fatalf("canonicalFrontendBindingType(%v) = %v, want unchanged", typ, got)
	}
}
