package controlplane

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
	"time"
)

func TestAlertingObserverEmitsImmediateContentFreeOperationalAlerts(t *testing.T) {
	var output bytes.Buffer
	sink, err := NewJSONLinesObserver(&output)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := NewAlertingObserver(sink, sink, sink)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 7, 25, 14, 0, 0, 0, time.UTC)
	observations := []RuntimeAuditObservation{
		{
			CompletedAt: now, ErrorCode: "provider_create",
			Kind: RuntimeProgressEnsureRuntime, Retryable: true,
			State: RuntimeProgressRetrying,
		},
		{
			CompletedAt: now.Add(time.Second), ErrorCode: "provider_identity_mismatch",
			Kind: RuntimeProgressEnsureRuntime, State: RuntimeProgressFailed,
		},
		{
			CompletedAt: now.Add(2 * time.Second), ErrorCode: "wake_deadline_exceeded",
			Kind: RuntimeProgressWakeRuntime, State: RuntimeProgressFailed,
		},
		{
			CompletedAt: now.Add(3 * time.Second), ErrorCode: "cutoff_deadline_exceeded",
			Kind: RuntimeProgressBudgetCutoff, State: RuntimeProgressFailed,
		},
	}
	for _, observation := range observations {
		observer.ObserveRuntimeAudit(observation)
	}
	if err := sink.Err(); err != nil {
		t.Fatal(err)
	}
	requireOperationalAlertStream(t, output.Bytes(), []OperationalAlertMeasurement{
		{
			ErrorCode: "provider_create", Event: "operational_alert",
			OccurredAt: now, Severity: OperationalAlertWarning,
			Signal: OperationalAlertProviderError,
		},
		{
			ErrorCode: "provider_identity_mismatch", Event: "operational_alert",
			OccurredAt: now.Add(time.Second), Severity: OperationalAlertCritical,
			Signal: OperationalAlertProviderError,
		},
		{
			ErrorCode: "provider_identity_mismatch", Event: "operational_alert",
			OccurredAt: now.Add(time.Second), Severity: OperationalAlertCritical,
			Signal: OperationalAlertProvisioningFailed,
		},
		{
			ErrorCode: "wake_deadline_exceeded", Event: "operational_alert",
			OccurredAt: now.Add(2 * time.Second), Severity: OperationalAlertCritical,
			Signal: OperationalAlertWakeFailed,
		},
		{
			ErrorCode: "cutoff_deadline_exceeded", Event: "operational_alert",
			OccurredAt: now.Add(3 * time.Second), Severity: OperationalAlertCritical,
			Signal: OperationalAlertBudgetCutoffFailed,
		},
	})
}

func requireOperationalAlertStream(
	t *testing.T,
	payload []byte,
	want []OperationalAlertMeasurement,
) {
	t.Helper()
	text := string(payload)
	for _, forbidden := range []string{"runtime-name", "user-id", "operation-id", "credential"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("operational alert exposed %q: %s", forbidden, text)
		}
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	var alerts []OperationalAlertMeasurement
	for {
		var raw json.RawMessage
		err := decoder.Decode(&raw)
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		var envelope struct {
			Event string `json:"event"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			t.Fatal(err)
		}
		if envelope.Event != "operational_alert" {
			continue
		}
		var alert OperationalAlertMeasurement
		if err := json.Unmarshal(raw, &alert); err != nil {
			t.Fatal(err)
		}
		alerts = append(alerts, alert)
	}
	if len(alerts) != len(want) {
		t.Fatalf("operational alerts = %+v, want %+v", alerts, want)
	}
	for index := range want {
		if alerts[index] != want[index] {
			t.Fatalf("operational alert %d = %+v, want %+v", index, alerts[index], want[index])
		}
	}
}
