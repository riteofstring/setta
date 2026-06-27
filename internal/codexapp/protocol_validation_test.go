package codexapp

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDecodeThreadSettingsUpdateParamsRequiresThreadID(t *testing.T) {
	_, err := DecodeThreadSettingsUpdateParams(json.RawMessage(`{"model":"gpt-test"}`))
	if err == nil {
		t.Fatal("decode succeeded, want missing required field error")
	}
	if !strings.Contains(err.Error(), "ThreadSettingsUpdateParams.threadId is required") {
		t.Fatalf("error = %q, want required threadId message", err.Error())
	}
}

func TestDecodeThreadSettingsUpdateParamsAcceptsValidPayload(t *testing.T) {
	params, err := DecodeThreadSettingsUpdateParams(json.RawMessage(`{"threadId":"thread_api","model":"gpt-test"}`))
	if err != nil {
		t.Fatalf("decode valid payload: %v", err)
	}
	if params.ThreadID != "thread_api" {
		t.Fatalf("threadId = %q, want thread_api", params.ThreadID)
	}
	if params.Model == nil || *params.Model != "gpt-test" {
		t.Fatalf("model = %v, want gpt-test", params.Model)
	}
}

func TestThreadSettingsUpdateParamsCanMarshalExplicitNullServiceTier(t *testing.T) {
	encoded, err := json.Marshal(ThreadSettingsUpdateParams{
		ServiceTier: CodexNullString(),
		ThreadID:    "thread_api",
	})
	if err != nil {
		t.Fatalf("marshal explicit null service tier: %v", err)
	}
	if !strings.Contains(string(encoded), `"serviceTier":null`) {
		t.Fatalf("encoded = %s, want explicit null serviceTier", encoded)
	}

	omitted, err := json.Marshal(ThreadSettingsUpdateParams{ThreadID: "thread_api"})
	if err != nil {
		t.Fatalf("marshal omitted service tier: %v", err)
	}
	if strings.Contains(string(omitted), "serviceTier") {
		t.Fatalf("encoded = %s, want omitted serviceTier", omitted)
	}
}
