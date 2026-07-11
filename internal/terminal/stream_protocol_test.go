package terminal

import (
	"reflect"
	"testing"
)

func TestTerminalStreamContractOwnsMessageKindsAndErrors(t *testing.T) {
	unions := ContractUnions()
	if len(unions) != 2 {
		t.Fatalf("terminal stream unions = %d, want 2", len(unions))
	}
	if unions[0].Type != reflect.TypeFor[TerminalStreamClientMessage]() || len(unions[0].Variants) != 3 {
		t.Fatalf("client message union = %+v", unions[0])
	}
	if unions[1].Type != reflect.TypeFor[TerminalStreamServerMessage]() || len(unions[1].Variants) != 5 {
		t.Fatalf("server message union = %+v", unions[1])
	}

	sets := streamContractValueSets()
	assertTerminalContractValues(t, sets, "TerminalStreamClientMessageKind", []string{
		string(TerminalStreamClientStart),
		string(TerminalStreamClientResume),
		string(TerminalStreamClientInput),
	})
	assertTerminalContractValues(t, sets, "TerminalStreamServerMessageKind", []string{
		string(TerminalStreamServerReady),
		string(TerminalStreamServerInputAck),
		string(TerminalStreamServerEvent),
		string(TerminalStreamServerReplayTruncated),
		string(TerminalStreamServerError),
	})
	assertTerminalContractValues(t, sets, "TerminalStreamErrorCode", []string{
		string(TerminalStreamErrorMalformedFrame),
		string(TerminalStreamErrorUnsupportedMessage),
		string(TerminalStreamErrorNotReady),
		string(TerminalStreamErrorIdentityMismatch),
		string(TerminalStreamErrorSessionNotFound),
		string(TerminalStreamErrorInputSequenceGap),
		string(TerminalStreamErrorInputSequenceConflict),
		string(TerminalStreamErrorInputTooLarge),
		string(TerminalStreamErrorInputBackpressure),
		string(TerminalStreamErrorEventCursorUnavailable),
		string(TerminalStreamErrorInternal),
	})
}

func TestTerminalStreamLimitsAreBounded(t *testing.T) {
	if TerminalStreamTicketTTLSeconds <= 0 || TerminalStreamTicketTTLSeconds > 60 {
		t.Fatalf("ticket TTL = %d, want 1-60 seconds", TerminalStreamTicketTTLSeconds)
	}
	if TerminalStreamMaxInputBytes <= 0 || TerminalStreamMaxInputBytes > MaxInputBytes {
		t.Fatalf("stream input bytes = %d, want positive value capped by terminal input limit", TerminalStreamMaxInputBytes)
	}
	if TerminalStreamQueuedInputBytes < TerminalStreamMaxInputBytes || TerminalStreamQueuedInputBytes > 1024*1024 {
		t.Fatalf("queued input bytes = %d, want bounded capacity including one input frame", TerminalStreamQueuedInputBytes)
	}
	if TerminalStreamProtocolVersion != 1 {
		t.Fatalf("stream protocol version = %d, want 1", TerminalStreamProtocolVersion)
	}
}

func assertTerminalContractValues(t *testing.T, sets []ContractValueSet, name string, want []string) {
	t.Helper()
	for _, set := range sets {
		if set.Name == name {
			if !reflect.DeepEqual(set.Values, want) {
				t.Fatalf("%s values = %#v, want %#v", name, set.Values, want)
			}
			return
		}
	}
	t.Fatalf("contract value set %s is missing", name)
}
