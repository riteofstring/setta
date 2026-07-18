package sprites

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLiveMeasurementManifestRefusesBlankAuthorization(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	manifest, err := newLiveMeasurementManifest("unit-run", now, "phase1c", 3)
	if err != nil {
		t.Fatalf("newLiveMeasurementManifest: %v", err)
	}
	if err := manifest.validateAuthorization(now); err == nil || !strings.Contains(err.Error(), "owner authorization is incomplete") || !strings.Contains(err.Error(), "owner_approval") {
		t.Fatalf("blank authorization error = %v", err)
	}

	fillLiveMeasurementAuthorization(manifest, now)
	if err := manifest.validateAuthorization(now); err != nil {
		t.Fatalf("filled authorization: %v", err)
	}
	manifest.Authorization.StartDeadline = now.Add(-time.Second)
	if err := manifest.validateAuthorization(now); err == nil || !strings.Contains(err.Error(), "deadline has passed") {
		t.Fatalf("expired authorization error = %v", err)
	}
}

func TestLiveMeasurementEvidenceAppendAndReplay(t *testing.T) {
	directory := t.TempDir()
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	store, err := newLiveMeasurementStore(directory, func() time.Time { return now })
	if err != nil {
		t.Fatalf("newLiveMeasurementStore: %v", err)
	}
	record := liveMeasurementEvidence{
		ID: "prepare:1", Type: evidencePhase, Phase: "prepare", Note: "authorization accepted",
	}
	if err := store.appendEvidence(record); err != nil {
		t.Fatalf("append evidence: %v", err)
	}
	if err := store.appendEvidence(record); err != nil {
		t.Fatalf("idempotent append: %v", err)
	}
	changed := record
	changed.Note = "changed"
	if err := store.appendEvidence(changed); err == nil || !strings.Contains(err.Error(), "conflicting") {
		t.Fatalf("conflicting append error = %v", err)
	}
	contents, err := os.ReadFile(filepath.Join(directory, liveMeasurementEvidenceName))
	if err != nil {
		t.Fatal(err)
	}
	journal, replayed, err := replayLiveMeasurementEvidence(bytes.NewReader(contents))
	if err != nil {
		t.Fatalf("replay evidence: %v", err)
	}
	if journal.lastSequence != 1 || len(replayed) != 1 || replayed[0].ID != record.ID {
		t.Fatalf("replayed = %#v, journal = %#v", replayed, journal)
	}

	conflicting := replayed[0]
	conflicting.Note = "changed"
	encoded, err := json.Marshal(conflicting)
	if err != nil {
		t.Fatal(err)
	}
	stream := append(append([]byte{}, contents...), encoded...)
	stream = append(stream, '\n')
	if _, _, err := replayLiveMeasurementEvidence(bytes.NewReader(stream)); err == nil || !strings.Contains(err.Error(), "conflicting") {
		t.Fatalf("conflicting replay error = %v", err)
	}

	gap := replayed[0]
	gap.ID = "gap"
	gap.Sequence = 3
	encoded, err = json.Marshal(gap)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := replayLiveMeasurementEvidence(bytes.NewReader(append(encoded, '\n'))); err == nil || !strings.Contains(err.Error(), "does not follow") {
		t.Fatalf("sequence gap error = %v", err)
	}
}

func TestLiveMeasurementCohortsRunInOrderAndIsolation(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	manifest, err := newLiveMeasurementManifest("schedule", now, "phase1c", 2)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := manifest.startCohort("attached-idle", now); err == nil || !strings.Contains(err.Error(), "retained-filesystem") {
		t.Fatalf("out-of-order start error = %v", err)
	}
	first, err := manifest.startCohort("retained-filesystem", now)
	if err != nil {
		t.Fatal(err)
	}
	if resumed, err := manifest.startCohort("retained-filesystem", now.Add(time.Second)); err != nil || resumed != first {
		t.Fatalf("restart resume = %#v, %v", resumed, err)
	}
	if _, err := manifest.startCohort("attached-idle", now); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("isolation error = %v", err)
	}
	first.State = "cleaned"
	first.MeasuredAt = now.Add(time.Minute)
	first.CleanupVerifiedAt = now.Add(2 * time.Minute)
	if _, err := manifest.startCohort("attached-idle", now.Add(3*time.Minute)); err != nil {
		t.Fatalf("next cohort start: %v", err)
	}
}

func TestLiveMeasurementRawEvidenceTypesValidate(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	base := liveMeasurementEvidence{
		Version: 1, Sequence: 1, ID: "evidence", RecordedAt: now,
		MonotonicOriginUTC: now, MonotonicNanos: 1, Phase: "measure-retained-filesystem",
	}
	tests := []liveMeasurementEvidence{
		withEvidence(base, evidenceProviderExposure, func(e *liveMeasurementEvidence) {
			e.Interval = &liveMeasurementInterval{Action: "start", IntervalID: "exposure", At: now}
		}),
		withEvidence(base, evidenceAttachment, func(e *liveMeasurementEvidence) {
			e.Interval = &liveMeasurementInterval{Action: "open", IntervalID: "gateway", At: now}
		}),
		withEvidence(base, evidenceLease, func(e *liveMeasurementEvidence) {
			e.Interval = &liveMeasurementInterval{Action: "renewed", IntervalID: "lease", At: now, Confirmation: "expires_at retained"}
		}),
		withEvidence(base, evidenceCPU, func(e *liveMeasurementEvidence) {
			e.ResourceDelta = testLiveMeasurementResourceDelta()
		}),
		withEvidence(base, evidenceMemory, func(e *liveMeasurementEvidence) {
			e.ResourceDelta = testLiveMeasurementResourceDelta()
		}),
		withEvidence(base, evidenceStorage, func(e *liveMeasurementEvidence) {
			e.Storage = &liveMeasurementStorage{Boundary: "after-trim", TrimAttempted: true}
		}),
		withEvidence(base, evidenceCheckpoint, func(e *liveMeasurementEvidence) {
			e.Checkpoint = &liveMeasurementCheckpoint{Action: "created", Scenario: "small-delta", CheckpointID: "cp-1", CreatedAt: now, LatencyNanos: 1}
		}),
		withEvidence(base, evidenceNetwork, func(e *liveMeasurementEvidence) {
			e.Network = &liveMeasurementNetwork{Boundary: "gateway", Source: "Setta counters"}
		}),
		withEvidence(base, evidenceLatency, func(e *liveMeasurementEvidence) {
			e.Latency = &liveMeasurementLatency{Operation: "warm_wake", DurationNanos: 1}
		}),
		withEvidence(base, evidenceBilling, func(e *liveMeasurementEvidence) {
			e.Billing = &liveMeasurementBilling{Stage: "before", Source: "Cost Explorer", ObservedAt: now, Artifact: "/evidence/before.json"}
		}),
	}
	for index, evidence := range tests {
		evidence.ID = evidence.ID + "-" + evidence.Type.String()
		evidence.Sequence = uint64(index + 1)
		if err := evidence.validate(); err != nil {
			t.Errorf("%s evidence: %v", evidence.Type, err)
		}
	}
}

func (kind liveMeasurementEvidenceType) String() string {
	return string(kind)
}

func withEvidence(base liveMeasurementEvidence, kind liveMeasurementEvidenceType, configure func(*liveMeasurementEvidence)) liveMeasurementEvidence {
	base.Type = kind
	configure(&base)
	return base
}

func testLiveMeasurementResourceDelta() *liveMeasurementResourceDelta {
	return &liveMeasurementResourceDelta{
		WholePath: "/sys/fs/cgroup", ChildPath: "/sys/fs/cgroup/workload",
		WholeBefore: map[string]int64{"usage_usec": 1}, WholeAfter: map[string]int64{"usage_usec": 2},
		WholeDelta: map[string]int64{"usage_usec": 1}, ChildBefore: map[string]int64{"usage_usec": 1},
		ChildAfter: map[string]int64{"usage_usec": 2}, ChildDelta: map[string]int64{"usage_usec": 1},
		EnforcedMax: "100000 100000",
	}
}

func TestLiveMeasurementCleanupIsIdempotent(t *testing.T) {
	now := time.Date(2026, 7, 17, 12, 0, 0, 0, time.UTC)
	manifest, err := newLiveMeasurementManifest("cleanup", now, "phase1c", 2)
	if err != nil {
		t.Fatal(err)
	}
	backend := &fakeLiveMeasurementCleanupBackend{present: make(map[string]bool)}
	for _, cohort := range manifest.Cohorts[:2] {
		for _, name := range cohort.RuntimeNames {
			backend.present[name] = true
		}
	}
	if err := cleanupLiveMeasurementManifest(manifest, backend, now); err != nil {
		t.Fatalf("first cleanup: %v", err)
	}
	firstDestroyCalls := backend.destroyCalls
	if err := cleanupLiveMeasurementManifest(manifest, backend, now.Add(time.Minute)); err != nil {
		t.Fatalf("second cleanup: %v", err)
	}
	if backend.destroyCalls != firstDestroyCalls || manifest.CleanupComplete.IsZero() {
		t.Fatalf("cleanup calls = %d then %d; manifest = %#v", firstDestroyCalls, backend.destroyCalls, manifest)
	}
}

func fillLiveMeasurementAuthorization(manifest *liveMeasurementManifest, now time.Time) {
	a := &manifest.Authorization
	a.OwnerApproval = "owner approved disposable organization and USD 5 maximum"
	a.OwnerApprovedAt = now.Add(-time.Hour)
	a.MaximumSpendUSDMicros = 5_000_000
	a.Organization = "disposable-phase1c"
	a.IntendedGeography = "yyz"
	a.StartDeadline = now.Add(time.Hour)
	a.CleanupDeadline = now.Add(8 * time.Hour)
	a.ProviderAPI = "v1"
	a.ProviderServer = "server-build"
	a.ProviderCLI = "sprite-cli-build"
	a.ProviderSDK = "sprites-go-build"
	a.SettaCommit = "0123456789abcdef"
	a.RuntimeBuild = "runtime-build"
	a.RunningLimit = 4
	a.WarmLimit = 4
	a.EmptyOrganizationProof = "Cost Explorer and provider listing checked at 2026-07-17T11:00:00Z"
	a.RequestedCPUCoreMillionths = 1_000_000
	a.RequestedMemoryBytes = 1_000_000_000
	a.ReturnedCPUCoreMillionths = 1_000_000
	a.ReturnedMemoryBytes = 1_000_000_000
	a.WholeRuntimeShapeAttestation = "requested and returned cgroup files captured"
	a.BillingSource = "AWS Cost Explorer"
	a.BillingObserver = "owner@example.invalid"
	a.CleanupAuthority = "owner has runtime and checkpoint deletion authority"
	a.ColdSoakIsolationProof = "separate disposable organization; cold soak not active here"
	a.StopConditions = append([]string(nil), liveMeasurementRequiredStopConditions...)
}

type fakeLiveMeasurementCleanupBackend struct {
	present      map[string]bool
	destroyCalls int
}

func (backend *fakeLiveMeasurementCleanupBackend) Destroy(name string, labels []string) error {
	if len(labels) == 0 {
		return errors.New("missing ownership labels")
	}
	if backend.present[name] {
		backend.destroyCalls++
		delete(backend.present, name)
	}
	return nil
}

func (backend *fakeLiveMeasurementCleanupBackend) Exists(name string) (bool, error) {
	return backend.present[name], nil
}
