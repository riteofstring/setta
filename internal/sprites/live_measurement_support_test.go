package sprites

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"setta/internal/runtimeprovider"
)

const (
	liveMeasurementManifestVersion = 1
	liveMeasurementEvidenceVersion = 1
	liveMeasurementManifestName    = "manifest.json"
	liveMeasurementEvidenceName    = "observations.jsonl"
)

var liveMeasurementCohortNames = []string{
	"retained-filesystem",
	"attached-idle",
	"renewable-workload",
	"terminal-build",
	"terminal-build-preview",
	"storage-checkpoints",
	"hostile-cutoff",
	"beta-concurrency",
}

var liveMeasurementRequiredStopConditions = []string{
	"unexpected spend",
	"provider errors",
	"unrelated resources",
	"missing cleanup authority",
	"evidence corruption",
}

type liveMeasurementAuthorization struct {
	OwnerApproval                string    `json:"owner_approval"`
	OwnerApprovedAt              time.Time `json:"owner_approved_at"`
	MaximumSpendUSDMicros        uint64    `json:"maximum_spend_usd_micros"`
	Organization                 string    `json:"organization"`
	RuntimePrefix                string    `json:"runtime_prefix"`
	IntendedGeography            string    `json:"intended_geography"`
	StartDeadline                time.Time `json:"start_deadline"`
	CleanupDeadline              time.Time `json:"cleanup_deadline"`
	ProviderAPI                  string    `json:"provider_api"`
	ProviderServer               string    `json:"provider_server"`
	ProviderCLI                  string    `json:"provider_cli"`
	ProviderSDK                  string    `json:"provider_sdk"`
	SettaCommit                  string    `json:"setta_commit"`
	RuntimeBuild                 string    `json:"runtime_build"`
	RateCard                     string    `json:"rate_card"`
	RunningLimit                 int       `json:"running_limit"`
	WarmLimit                    int       `json:"warm_limit"`
	EmptyOrganizationProof       string    `json:"empty_organization_proof"`
	RequestedCPUCoreMillionths   uint64    `json:"requested_cpu_core_millionths"`
	RequestedMemoryBytes         uint64    `json:"requested_memory_bytes"`
	ReturnedCPUCoreMillionths    uint64    `json:"returned_cpu_core_millionths"`
	ReturnedMemoryBytes          uint64    `json:"returned_memory_bytes"`
	ReturnedCPUUnlimited         bool      `json:"returned_cpu_unlimited"`
	ReturnedMemoryUnlimited      bool      `json:"returned_memory_unlimited"`
	WholeRuntimeShapeAttestation string    `json:"whole_runtime_shape_attestation"`
	BillingSource                string    `json:"billing_source"`
	BillingObserver              string    `json:"billing_observer"`
	CleanupAuthority             string    `json:"cleanup_authority"`
	ColdSoakIsolationProof       string    `json:"cold_soak_isolation_proof"`
	StopConditions               []string  `json:"stop_conditions"`
}

type liveMeasurementBillingPlaceholder struct {
	Stage      string    `json:"stage"`
	Source     string    `json:"source"`
	ObservedAt time.Time `json:"observed_at"`
	Artifact   string    `json:"artifact"`
	Note       string    `json:"note"`
	Recorded   bool      `json:"recorded"`
}

type liveMeasurementCohort struct {
	Name              string     `json:"name"`
	RuntimeNames      []string   `json:"runtime_names"`
	OwnershipLabels   [][]string `json:"ownership_labels"`
	State             string     `json:"state"`
	StartedAt         time.Time  `json:"started_at,omitempty"`
	MeasuredAt        time.Time  `json:"measured_at,omitempty"`
	CleanupVerifiedAt time.Time  `json:"cleanup_verified_at,omitempty"`
}

type liveMeasurementManifest struct {
	Version         int                                 `json:"version"`
	RunID           string                              `json:"run_id"`
	CreatedAt       time.Time                           `json:"created_at"`
	Authorization   liveMeasurementAuthorization        `json:"authorization"`
	BetaConcurrency int                                 `json:"beta_concurrency"`
	Cohorts         []liveMeasurementCohort             `json:"cohorts"`
	Billing         []liveMeasurementBillingPlaceholder `json:"billing_snapshots"`
	PreparedAt      time.Time                           `json:"prepared_at,omitempty"`
	CleanupAttempts []time.Time                         `json:"cleanup_attempts,omitempty"`
	CleanupComplete time.Time                           `json:"cleanup_complete_at,omitempty"`
}

func newLiveMeasurementManifest(runID string, createdAt time.Time, prefix string, concurrency int) (*liveMeasurementManifest, error) {
	if concurrency < 1 {
		return nil, errors.New("beta concurrency must be positive")
	}
	manifest := &liveMeasurementManifest{
		Version: liveMeasurementManifestVersion, RunID: runID, CreatedAt: createdAt.UTC(),
		BetaConcurrency: concurrency,
		Authorization: liveMeasurementAuthorization{
			RuntimePrefix: prefix,
			RateCard:      "sprites-public-2026-07-14",
		},
		Billing: []liveMeasurementBillingPlaceholder{
			{Stage: "before"}, {Stage: "first-visible"}, {Stage: "final-settled"},
		},
	}
	for _, name := range liveMeasurementCohortNames {
		count := 1
		if name == "beta-concurrency" {
			count = concurrency
		}
		cohort := liveMeasurementCohort{Name: name, State: "pending"}
		for index := range count {
			identity, err := liveMeasurementIdentity(runID, prefix, name, index)
			if err != nil {
				return nil, err
			}
			cohort.RuntimeNames = append(cohort.RuntimeNames, identity.Name)
			cohort.OwnershipLabels = append(cohort.OwnershipLabels, identity.Labels)
		}
		manifest.Cohorts = append(manifest.Cohorts, cohort)
	}
	return manifest, manifest.validateStructure()
}

func liveMeasurementIdentity(runID string, prefix string, cohort string, index int) (runtimeprovider.ManagedIdentity, error) {
	return runtimeprovider.NewManagedIdentity(fmt.Sprintf("phase1c-live:%s:%s:%s:%d", runID, prefix, cohort, index))
}

func (manifest *liveMeasurementManifest) validateStructure() error {
	if manifest.Version != liveMeasurementManifestVersion {
		return fmt.Errorf("unsupported Phase 1c manifest version %d", manifest.Version)
	}
	if strings.TrimSpace(manifest.RunID) == "" || manifest.CreatedAt.IsZero() || manifest.BetaConcurrency < 1 {
		return errors.New("Phase 1c manifest is missing its run identity")
	}
	if err := manifest.validateCohortStructure(); err != nil {
		return err
	}
	return manifest.validateBillingStructure()
}

func (manifest *liveMeasurementManifest) validateCohortStructure() error {
	if len(manifest.Cohorts) != len(liveMeasurementCohortNames) {
		return fmt.Errorf("Phase 1c manifest has %d cohorts, want %d", len(manifest.Cohorts), len(liveMeasurementCohortNames))
	}
	seen := make(map[string]struct{})
	for index, cohort := range manifest.Cohorts {
		if cohort.Name != liveMeasurementCohortNames[index] {
			return fmt.Errorf("Phase 1c cohort %d is %q, want %q", index, cohort.Name, liveMeasurementCohortNames[index])
		}
		count := 1
		if cohort.Name == "beta-concurrency" {
			count = manifest.BetaConcurrency
		}
		if len(cohort.RuntimeNames) != count || len(cohort.OwnershipLabels) != count {
			return fmt.Errorf("Phase 1c cohort %s has conflicting runtime count", cohort.Name)
		}
		for runtimeIndex := range count {
			identity, err := liveMeasurementIdentity(manifest.RunID, manifest.Authorization.RuntimePrefix, cohort.Name, runtimeIndex)
			if err != nil {
				return err
			}
			if cohort.RuntimeNames[runtimeIndex] != identity.Name || !slices.Equal(cohort.OwnershipLabels[runtimeIndex], identity.Labels) {
				return fmt.Errorf("Phase 1c cohort %s has conflicting deterministic ownership", cohort.Name)
			}
			if _, duplicate := seen[identity.Name]; duplicate {
				return fmt.Errorf("duplicate Phase 1c runtime %s", identity.Name)
			}
			seen[identity.Name] = struct{}{}
		}
		switch cohort.State {
		case "pending", "running", "measured", "cleaned", "failed-cleaned":
		default:
			return fmt.Errorf("Phase 1c cohort %s has invalid state %q", cohort.Name, cohort.State)
		}
	}
	return nil
}

func (manifest *liveMeasurementManifest) validateBillingStructure() error {
	if len(manifest.Billing) != 3 {
		return errors.New("Phase 1c manifest must contain three billing snapshot placeholders")
	}
	for index, stage := range []string{"before", "first-visible", "final-settled"} {
		if manifest.Billing[index].Stage != stage {
			return fmt.Errorf("billing placeholder %d is %q, want %q", index, manifest.Billing[index].Stage, stage)
		}
	}
	return nil
}

func (manifest *liveMeasurementManifest) validateAuthorization(now time.Time) error {
	if err := manifest.validateStructure(); err != nil {
		return err
	}
	a := manifest.Authorization
	blank := missingLiveMeasurementAuthorizationFields(a)
	if len(blank) != 0 {
		slices.Sort(blank)
		return fmt.Errorf("owner authorization is incomplete; fill: %s", strings.Join(blank, ", "))
	}
	if !a.OwnerApprovedAt.Before(a.StartDeadline) || !a.StartDeadline.Before(a.CleanupDeadline) {
		return errors.New("authorization deadlines must order owner approval, start, then cleanup")
	}
	if now.After(a.StartDeadline) {
		return errors.New("authorization start deadline has passed")
	}
	if a.RateCard != "sprites-public-2026-07-14" {
		return fmt.Errorf("unsupported Phase 1c rate card %q", a.RateCard)
	}
	if !slices.Equal(a.StopConditions, liveMeasurementRequiredStopConditions) {
		return errors.New("authorization stop_conditions must list every runbook stop condition in template order")
	}
	return nil
}

func missingLiveMeasurementAuthorizationFields(a liveMeasurementAuthorization) []string {
	blank := make([]string, 0)
	stringsRequired := map[string]string{
		"owner_approval": a.OwnerApproval, "organization": a.Organization,
		"runtime_prefix": a.RuntimePrefix, "intended_geography": a.IntendedGeography,
		"provider_api": a.ProviderAPI, "provider_server": a.ProviderServer,
		"provider_cli": a.ProviderCLI, "provider_sdk": a.ProviderSDK,
		"setta_commit": a.SettaCommit, "runtime_build": a.RuntimeBuild, "rate_card": a.RateCard,
		"empty_organization_proof":        a.EmptyOrganizationProof,
		"whole_runtime_shape_attestation": a.WholeRuntimeShapeAttestation,
		"billing_source":                  a.BillingSource, "billing_observer": a.BillingObserver,
		"cleanup_authority": a.CleanupAuthority, "cold_soak_isolation_proof": a.ColdSoakIsolationProof,
	}
	for name, value := range stringsRequired {
		if strings.TrimSpace(value) == "" {
			blank = append(blank, name)
		}
	}
	if a.OwnerApprovedAt.IsZero() {
		blank = append(blank, "owner_approved_at")
	}
	if a.StartDeadline.IsZero() {
		blank = append(blank, "start_deadline")
	}
	if a.CleanupDeadline.IsZero() {
		blank = append(blank, "cleanup_deadline")
	}
	if a.MaximumSpendUSDMicros == 0 {
		blank = append(blank, "maximum_spend_usd_micros")
	}
	if a.RunningLimit < 1 {
		blank = append(blank, "running_limit")
	}
	if a.WarmLimit < 1 {
		blank = append(blank, "warm_limit")
	}
	if a.RequestedCPUCoreMillionths == 0 {
		blank = append(blank, "requested_cpu_core_millionths")
	}
	if a.RequestedMemoryBytes == 0 {
		blank = append(blank, "requested_memory_bytes")
	}
	if a.ReturnedCPUCoreMillionths == 0 && !a.ReturnedCPUUnlimited {
		blank = append(blank, "returned_cpu_core_millionths")
	}
	if a.ReturnedMemoryBytes == 0 && !a.ReturnedMemoryUnlimited {
		blank = append(blank, "returned_memory_bytes")
	}
	if len(a.StopConditions) == 0 {
		blank = append(blank, "stop_conditions")
	}
	return blank
}

func (manifest *liveMeasurementManifest) startCohort(name string, now time.Time) (*liveMeasurementCohort, error) {
	index := slices.Index(liveMeasurementCohortNames, name)
	if index < 0 {
		return nil, fmt.Errorf("unknown Phase 1c cohort %q", name)
	}
	for otherIndex := range manifest.Cohorts {
		other := &manifest.Cohorts[otherIndex]
		if other.State == "running" && other.Name != name {
			return nil, fmt.Errorf("cohort %s is already running in isolation", other.Name)
		}
		if otherIndex < index && other.State != "cleaned" {
			return nil, fmt.Errorf("cohort %s must be measured and cleaned before %s", other.Name, name)
		}
	}
	cohort := &manifest.Cohorts[index]
	switch cohort.State {
	case "pending":
		cohort.State = "running"
		cohort.StartedAt = now.UTC()
	case "running":
		// Restart-safe resumption of the same explicitly selected cohort.
	default:
		return nil, fmt.Errorf("cohort %s is already %s", name, cohort.State)
	}
	return cohort, nil
}

type liveMeasurementEvidenceType string

const (
	evidencePhase              liveMeasurementEvidenceType = "phase"
	evidenceProviderExposure   liveMeasurementEvidenceType = "provider_exposure"
	evidenceProviderStatus     liveMeasurementEvidenceType = "provider_status_supplementary"
	evidenceAttachment         liveMeasurementEvidenceType = "attachment"
	evidenceLease              liveMeasurementEvidenceType = "workload_lease"
	evidenceCPU                liveMeasurementEvidenceType = "cpu_delta"
	evidenceMemory             liveMeasurementEvidenceType = "memory_delta"
	evidenceStorage            liveMeasurementEvidenceType = "storage"
	evidenceCheckpoint         liveMeasurementEvidenceType = "checkpoint"
	evidenceNetwork            liveMeasurementEvidenceType = "network"
	evidenceLatency            liveMeasurementEvidenceType = "latency"
	evidenceBilling            liveMeasurementEvidenceType = "billing_snapshot"
	evidenceRetry              liveMeasurementEvidenceType = "retry"
	evidenceCleanup            liveMeasurementEvidenceType = "cleanup"
	evidenceMissingObservation liveMeasurementEvidenceType = "missing_observation"
)

type liveMeasurementInterval struct {
	Action       string    `json:"action"`
	IntervalID   string    `json:"interval_id"`
	At           time.Time `json:"at"`
	Confirmation string    `json:"confirmation,omitempty"`
}

type liveMeasurementResourceDelta struct {
	WholePath   string           `json:"whole_path"`
	ChildPath   string           `json:"child_path"`
	WholeBefore map[string]int64 `json:"whole_before"`
	WholeAfter  map[string]int64 `json:"whole_after"`
	WholeDelta  map[string]int64 `json:"whole_delta"`
	ChildBefore map[string]int64 `json:"child_before"`
	ChildAfter  map[string]int64 `json:"child_after"`
	ChildDelta  map[string]int64 `json:"child_delta"`
	EnforcedMax string           `json:"enforced_max"`
}

type liveMeasurementStorage struct {
	Boundary       string `json:"boundary"`
	LogicalBytes   uint64 `json:"logical_bytes"`
	AllocatedBytes uint64 `json:"allocated_bytes"`
	TrimAttempted  bool   `json:"trim_attempted"`
	TrimResult     string `json:"trim_result,omitempty"`
}

type liveMeasurementCheckpoint struct {
	Action              string    `json:"action"`
	Scenario            string    `json:"scenario"`
	CheckpointID        string    `json:"checkpoint_id"`
	CreatedAt           time.Time `json:"created_at"`
	LatencyNanos        int64     `json:"latency_nanos"`
	DeltaLogicalBytes   uint64    `json:"delta_logical_bytes"`
	DeltaAllocatedBytes uint64    `json:"delta_allocated_bytes"`
	RetentionNanos      int64     `json:"retention_nanos"`
	DeletedAt           time.Time `json:"deleted_at,omitempty"`
}

type liveMeasurementLatency struct {
	Operation       string `json:"operation"`
	DurationNanos   int64  `json:"duration_nanos"`
	BehavioralProof string `json:"behavioral_proof,omitempty"`
}

type liveMeasurementNetwork struct {
	Boundary     string `json:"boundary"`
	IngressBytes uint64 `json:"ingress_bytes"`
	EgressBytes  uint64 `json:"egress_bytes"`
	Source       string `json:"source"`
}

type liveMeasurementBilling struct {
	Stage      string    `json:"stage"`
	Source     string    `json:"source"`
	ObservedAt time.Time `json:"observed_at"`
	Artifact   string    `json:"artifact"`
	Note       string    `json:"note,omitempty"`
}

type liveMeasurementEvidence struct {
	Version            int                           `json:"version"`
	Sequence           uint64                        `json:"sequence"`
	ID                 string                        `json:"id"`
	RecordedAt         time.Time                     `json:"recorded_at"`
	MonotonicOriginUTC time.Time                     `json:"monotonic_origin_utc"`
	MonotonicNanos     int64                         `json:"monotonic_nanos"`
	Type               liveMeasurementEvidenceType   `json:"type"`
	Phase              string                        `json:"phase"`
	Cohort             string                        `json:"cohort,omitempty"`
	RuntimeName        string                        `json:"runtime_name,omitempty"`
	Interval           *liveMeasurementInterval      `json:"interval,omitempty"`
	ResourceDelta      *liveMeasurementResourceDelta `json:"resource_delta,omitempty"`
	Storage            *liveMeasurementStorage       `json:"storage,omitempty"`
	Checkpoint         *liveMeasurementCheckpoint    `json:"checkpoint,omitempty"`
	Latency            *liveMeasurementLatency       `json:"latency,omitempty"`
	Network            *liveMeasurementNetwork       `json:"network,omitempty"`
	Billing            *liveMeasurementBilling       `json:"billing,omitempty"`
	ProviderStatus     string                        `json:"provider_status,omitempty"`
	Note               string                        `json:"note,omitempty"`
}

func (e liveMeasurementEvidence) validate() error {
	if e.Version != liveMeasurementEvidenceVersion || e.Sequence == 0 || e.ID == "" || e.RecordedAt.IsZero() || e.MonotonicOriginUTC.IsZero() || e.MonotonicNanos < 0 || e.Phase == "" {
		return errors.New("invalid Phase 1c evidence envelope")
	}
	validator, found := liveMeasurementEvidenceValidators[e.Type]
	if !found {
		return fmt.Errorf("unknown Phase 1c evidence type %q", e.Type)
	}
	return validator(e)
}

var liveMeasurementEvidenceValidators = map[liveMeasurementEvidenceType]func(liveMeasurementEvidence) error{
	evidencePhase:              validateLiveMeasurementNote,
	evidenceRetry:              validateLiveMeasurementNote,
	evidenceCleanup:            validateLiveMeasurementNote,
	evidenceMissingObservation: validateLiveMeasurementNote,
	evidenceProviderExposure:   validateLiveMeasurementInterval,
	evidenceAttachment:         validateLiveMeasurementInterval,
	evidenceLease:              validateLiveMeasurementInterval,
	evidenceProviderStatus:     validateLiveMeasurementProviderStatus,
	evidenceCPU:                validateLiveMeasurementResource,
	evidenceMemory:             validateLiveMeasurementResource,
	evidenceStorage:            validateLiveMeasurementStorage,
	evidenceCheckpoint:         validateLiveMeasurementCheckpoint,
	evidenceNetwork:            validateLiveMeasurementNetwork,
	evidenceLatency:            validateLiveMeasurementLatency,
	evidenceBilling:            validateLiveMeasurementBilling,
}

func validateLiveMeasurementNote(e liveMeasurementEvidence) error {
	if strings.TrimSpace(e.Note) == "" {
		return fmt.Errorf("evidence %s requires a note", e.Type)
	}
	return nil
}

func validateLiveMeasurementInterval(e liveMeasurementEvidence) error {
	if e.Interval == nil || e.Interval.Action == "" || e.Interval.IntervalID == "" || e.Interval.At.IsZero() {
		return fmt.Errorf("evidence %s requires an interval event", e.Type)
	}
	return nil
}

func validateLiveMeasurementProviderStatus(e liveMeasurementEvidence) error {
	if e.ProviderStatus == "" {
		return errors.New("provider status evidence requires a status")
	}
	return nil
}

func validateLiveMeasurementResource(e liveMeasurementEvidence) error {
	if e.ResourceDelta == nil || e.ResourceDelta.WholePath == "" || e.ResourceDelta.ChildPath == "" {
		return fmt.Errorf("evidence %s requires separated whole and child deltas", e.Type)
	}
	return nil
}

func validateLiveMeasurementStorage(e liveMeasurementEvidence) error {
	if e.Storage == nil || e.Storage.Boundary == "" {
		return errors.New("storage evidence requires a boundary")
	}
	return nil
}

func validateLiveMeasurementCheckpoint(e liveMeasurementEvidence) error {
	checkpoint := e.Checkpoint
	if checkpoint == nil || (checkpoint.Action != "created" && checkpoint.Action != "deleted") || checkpoint.Scenario == "" || checkpoint.CheckpointID == "" || checkpoint.CreatedAt.IsZero() || checkpoint.LatencyNanos < 0 {
		return errors.New("checkpoint evidence is incomplete")
	}
	return nil
}

func validateLiveMeasurementNetwork(e liveMeasurementEvidence) error {
	if e.Network == nil || e.Network.Boundary == "" || e.Network.Source == "" {
		return errors.New("network evidence is incomplete")
	}
	return nil
}

func validateLiveMeasurementLatency(e liveMeasurementEvidence) error {
	if e.Latency == nil || e.Latency.Operation == "" || e.Latency.DurationNanos < 0 {
		return errors.New("latency evidence is incomplete")
	}
	return nil
}

func validateLiveMeasurementBilling(e liveMeasurementEvidence) error {
	if e.Billing == nil || e.Billing.Stage == "" || e.Billing.Source == "" || e.Billing.ObservedAt.IsZero() || e.Billing.Artifact == "" {
		return errors.New("billing evidence is incomplete")
	}
	return nil
}

type liveMeasurementJournal struct {
	lastSequence uint64
	digests      map[string]string
	records      map[string]liveMeasurementEvidence
}

func replayLiveMeasurementEvidence(reader io.Reader) (*liveMeasurementJournal, []liveMeasurementEvidence, error) {
	journal := &liveMeasurementJournal{
		digests: make(map[string]string), records: make(map[string]liveMeasurementEvidence),
	}
	records := make([]liveMeasurementEvidence, 0)
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1<<20)
	for scanner.Scan() {
		var evidence liveMeasurementEvidence
		decoder := json.NewDecoder(bytes.NewReader(scanner.Bytes()))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&evidence); err != nil {
			return nil, nil, fmt.Errorf("decode Phase 1c evidence: %w", err)
		}
		var trailing json.RawMessage
		if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
			return nil, nil, errors.New("Phase 1c evidence has trailing JSON")
		}
		if err := evidence.validate(); err != nil {
			return nil, nil, err
		}
		encoded, err := json.Marshal(evidence)
		if err != nil {
			return nil, nil, err
		}
		digestBytes := sha256.Sum256(encoded)
		digest := hex.EncodeToString(digestBytes[:])
		if previous, found := journal.digests[evidence.ID]; found {
			if previous != digest {
				return nil, nil, fmt.Errorf("conflicting Phase 1c evidence replay for %s", evidence.ID)
			}
			continue
		}
		if evidence.Sequence != journal.lastSequence+1 {
			return nil, nil, fmt.Errorf("Phase 1c evidence sequence %d does not follow %d", evidence.Sequence, journal.lastSequence)
		}
		journal.lastSequence = evidence.Sequence
		journal.digests[evidence.ID] = digest
		journal.records[evidence.ID] = evidence
		records = append(records, evidence)
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("scan Phase 1c evidence: %w", err)
	}
	return journal, records, nil
}

type liveMeasurementStore struct {
	directory string
	now       func() time.Time
	started   time.Time
}

type liveMeasurementCleanupBackend interface {
	Destroy(name string, labels []string) error
	Exists(name string) (bool, error)
}

func cleanupLiveMeasurementManifest(
	manifest *liveMeasurementManifest,
	backend liveMeasurementCleanupBackend,
	now time.Time,
) error {
	manifest.CleanupAttempts = append(manifest.CleanupAttempts, now.UTC())
	for cohortIndex := range manifest.Cohorts {
		cohort := &manifest.Cohorts[cohortIndex]
		for runtimeIndex, name := range cohort.RuntimeNames {
			if err := backend.Destroy(name, cohort.OwnershipLabels[runtimeIndex]); err != nil {
				return fmt.Errorf("destroy owned Phase 1c runtime %s: %w", name, err)
			}
			found, err := backend.Exists(name)
			if err != nil {
				return fmt.Errorf("verify Phase 1c runtime %s absence: %w", name, err)
			}
			if found {
				return fmt.Errorf("Phase 1c runtime %s still exists after cleanup", name)
			}
		}
		cohort.State = "cleaned"
		if cohort.CleanupVerifiedAt.IsZero() {
			cohort.CleanupVerifiedAt = now.UTC()
		}
	}
	manifest.CleanupComplete = now.UTC()
	return nil
}

func newLiveMeasurementStore(directory string, now func() time.Time) (*liveMeasurementStore, error) {
	if !filepath.IsAbs(directory) {
		return nil, errors.New("Phase 1c state directory must be absolute")
	}
	info, err := os.Stat(directory)
	if err != nil {
		return nil, fmt.Errorf("inspect Phase 1c state directory: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("Phase 1c state path is not a directory")
	}
	started := now()
	return &liveMeasurementStore{directory: filepath.Clean(directory), now: now, started: started}, nil
}

func (store *liveMeasurementStore) requireOutside(repositoryRoot string) error {
	repositoryRoot, err := filepath.EvalSymlinks(repositoryRoot)
	if err != nil {
		return err
	}
	directory, err := filepath.EvalSymlinks(store.directory)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(repositoryRoot, directory)
	if err != nil {
		return err
	}
	if relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
		return errors.New("Phase 1c state directory must be outside the repository")
	}
	return nil
}

func (store *liveMeasurementStore) load() (*liveMeasurementManifest, error) {
	contents, err := os.ReadFile(filepath.Join(store.directory, liveMeasurementManifestName))
	if err != nil {
		return nil, fmt.Errorf("read Phase 1c manifest: %w", err)
	}
	var manifest liveMeasurementManifest
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode Phase 1c manifest: %w", err)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New("Phase 1c manifest has trailing JSON")
	}
	return &manifest, manifest.validateStructure()
}

func (store *liveMeasurementStore) save(manifest *liveMeasurementManifest) error {
	if err := manifest.validateStructure(); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	contents = append(contents, '\n')
	temporary, err := os.CreateTemp(store.directory, ".phase1c-manifest-*.tmp")
	if err != nil {
		return err
	}
	name := temporary.Name()
	defer os.Remove(name)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, filepath.Join(store.directory, liveMeasurementManifestName)); err != nil {
		return err
	}
	return syncDirectory(store.directory)
}

func (store *liveMeasurementStore) appendEvidence(evidence liveMeasurementEvidence) error {
	path := filepath.Join(store.directory, liveMeasurementEvidenceName)
	file, err := os.OpenFile(path, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return err
	}
	defer file.Close()
	journal, _, err := replayLiveMeasurementEvidence(file)
	if err != nil {
		return err
	}
	if previous, exists := journal.records[evidence.ID]; exists {
		previous.Version = 0
		previous.Sequence = 0
		previous.RecordedAt = time.Time{}
		previous.MonotonicOriginUTC = time.Time{}
		previous.MonotonicNanos = 0
		candidate := evidence
		candidate.Version = 0
		candidate.Sequence = 0
		candidate.RecordedAt = time.Time{}
		candidate.MonotonicOriginUTC = time.Time{}
		candidate.MonotonicNanos = 0
		if !liveMeasurementCanonicalEqual(previous, candidate) {
			return fmt.Errorf("conflicting Phase 1c evidence append for %s", evidence.ID)
		}
		return nil
	}
	evidence.Version = liveMeasurementEvidenceVersion
	evidence.Sequence = journal.lastSequence + 1
	if evidence.RecordedAt.IsZero() {
		evidence.RecordedAt = store.now().UTC()
	}
	if evidence.MonotonicOriginUTC.IsZero() {
		evidence.MonotonicOriginUTC = store.started.UTC()
	}
	if evidence.MonotonicNanos == 0 {
		evidence.MonotonicNanos = store.now().Sub(store.started).Nanoseconds()
	}
	if err := evidence.validate(); err != nil {
		return err
	}
	encoded, err := json.Marshal(evidence)
	if err != nil {
		return err
	}
	if _, err := file.Seek(0, io.SeekEnd); err != nil {
		return err
	}
	if _, err := file.Write(append(encoded, '\n')); err != nil {
		return err
	}
	return file.Sync()
}

func liveMeasurementCanonicalEqual(left any, right any) bool {
	leftJSON, leftErr := json.Marshal(left)
	rightJSON, rightErr := json.Marshal(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftJSON, rightJSON)
}
