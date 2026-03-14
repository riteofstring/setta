package realtime

import (
	"encoding/json"
	"testing"
)

func TestBinaryFrameRoundTrip(t *testing.T) {
	t.Parallel()

	frame, err := EncodeBinaryFrame(map[string]any{
		"messageType": "RealtimeDependencyEvent",
		"content": map[string]any{
			"projectConfigId": "project-a",
		},
	}, []byte("payload-bytes"))
	if err != nil {
		t.Fatalf("encode binary frame: %v", err)
	}

	header, payload, err := DecodeBinaryFrame(frame)
	if err != nil {
		t.Fatalf("decode binary frame: %v", err)
	}

	var envelope map[string]any
	if err := json.Unmarshal(header, &envelope); err != nil {
		t.Fatalf("decode binary frame header: %v", err)
	}
	if envelope["messageType"] != "RealtimeDependencyEvent" {
		t.Fatalf("expected message type RealtimeDependencyEvent, got %#v", envelope["messageType"])
	}
	if string(payload) != "payload-bytes" {
		t.Fatalf("expected payload-bytes, got %q", string(payload))
	}
}
