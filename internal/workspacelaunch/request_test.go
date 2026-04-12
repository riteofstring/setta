package workspacelaunch

import (
	"reflect"
	"testing"
)

func TestRequestStoredPayloadKeepsProvidedNullsAndOmitsLaunchIntentToken(t *testing.T) {
	t.Parallel()

	request := decodeLaunchRequest(t, `{
		"launchIntentToken":"nested-token",
		"workspaceRoot":"/tmp/workspace",
		"profile":null,
		"remoteCmd":"python app.py",
		"localPort":null
	}`)

	got := request.StoredPayload()
	want := map[string]any{
		"workspaceRoot": "/tmp/workspace",
		"profile":       nil,
		"remoteCmd":     "python app.py",
		"localPort":     nil,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("unexpected stored payload %#v", got)
	}
	if _, ok := got[launchIntentTokenField]; ok {
		t.Fatalf("launch intent token should not be persisted %#v", got)
	}
}
