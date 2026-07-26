package sprites

import (
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
	coldSoakSchemaVersion = 1
	coldSoakManifestName  = "manifest.json"
	coldSoakEvidenceName  = "observations.jsonl"
)

type coldSoakClassification string

const (
	coldSoakConfirmedCold coldSoakClassification = "confirmed_cold"
	coldSoakWarm          coldSoakClassification = "behaviorally_warm"
	coldSoakProviderFail  coldSoakClassification = "provider_failure"
	coldSoakInconclusive  coldSoakClassification = "inconclusive"
)

type coldSoakVersions struct {
	ProviderAPI string `json:"provider_api"`
	SDK         string `json:"sdk"`
	CLI         string `json:"cli"`
	LiveServer  string `json:"live_server,omitempty"`
}

type coldSoakCapacity struct {
	Organization string `json:"organization"`
	Running      int    `json:"running"`
	Warm         int    `json:"warm"`
	Cold         int    `json:"cold"`
	RunningLimit int    `json:"running_limit"`
	WarmLimit    int    `json:"warm_limit"`
}

type coldSoakStart struct {
	StartedAt time.Time `json:"started_at"`
	BootID    string    `json:"boot_id"`
	ProcessID int       `json:"pid"`
}

type coldSoakProbe struct {
	SentinelSHA256 string          `json:"sentinel_sha256"`
	StartCount     int             `json:"service_start_count"`
	StartHistory   []coldSoakStart `json:"service_start_history"`
	Heartbeat      int             `json:"service_heartbeat"`
	CurrentBootID  string          `json:"current_boot_id"`
}

type coldSoakCohort struct {
	Label              string                 `json:"label"`
	DurationHours      int                    `json:"duration_hours"`
	Name               string                 `json:"name"`
	Labels             []string               `json:"labels"`
	ProviderResourceID string                 `json:"provider_resource_id,omitempty"`
	CreatedAt          time.Time              `json:"created_at,omitempty"`
	SentinelSHA256     string                 `json:"sentinel_sha256,omitempty"`
	InitialProbe       *coldSoakProbe         `json:"initial_probe,omitempty"`
	WarmBaseline       *coldSoakProbe         `json:"warm_baseline,omitempty"`
	FirstColdAt        time.Time              `json:"first_cold_at,omitempty"`
	DueAt              time.Time              `json:"due_at,omitempty"`
	WakeStartedAt      time.Time              `json:"wake_started_at,omitempty"`
	PostWakeProbe      *coldSoakProbe         `json:"post_wake_probe,omitempty"`
	Classification     coldSoakClassification `json:"classification,omitempty"`
	ClassificationNote string                 `json:"classification_note,omitempty"`
	DeletedAt          time.Time              `json:"deleted_at,omitempty"`
}

type coldSoakPressure struct {
	Index              int       `json:"index"`
	Name               string    `json:"name"`
	Labels             []string  `json:"labels"`
	ProviderResourceID string    `json:"provider_resource_id,omitempty"`
	CreatedAt          time.Time `json:"created_at,omitempty"`
	DeletionAttemptAt  time.Time `json:"deletion_attempt_at,omitempty"`
	DeletedAt          time.Time `json:"deleted_at,omitempty"`
}

type coldSoakManifest struct {
	SchemaVersion   int                `json:"schema_version"`
	RunID           string             `json:"run_id"`
	CreatedAt       time.Time          `json:"created_at"`
	Versions        coldSoakVersions   `json:"versions"`
	InitialCapacity coldSoakCapacity   `json:"initial_capacity"`
	Cohorts         []coldSoakCohort   `json:"cohorts"`
	Pressure        []coldSoakPressure `json:"pressure"`
	ColdEpoch       time.Time          `json:"common_reported_cold_epoch,omitempty"`
	CleanupAttempts []time.Time        `json:"cleanup_attempts,omitempty"`
	EmptyConfirmed  time.Time          `json:"empty_confirmed_at,omitempty"`
	ReportPath      string             `json:"report_path,omitempty"`
}

type coldSoakEvidence struct {
	RecordedAt     time.Time              `json:"recorded_at"`
	Kind           string                 `json:"kind"`
	Phase          string                 `json:"phase"`
	Cohort         string                 `json:"cohort,omitempty"`
	Name           string                 `json:"name,omitempty"`
	Activity       string                 `json:"reported_activity,omitempty"`
	ProviderTime   time.Time              `json:"provider_updated_at,omitempty"`
	Capacity       *coldSoakCapacity      `json:"organization_capacity,omitempty"`
	Probe          *coldSoakProbe         `json:"probe,omitempty"`
	Classification coldSoakClassification `json:"classification,omitempty"`
	Note           string                 `json:"note,omitempty"`
}

type coldSoakStateStore struct {
	directory string
	now       func() time.Time
}

func newColdSoakStateStore(directory string, now func() time.Time) (*coldSoakStateStore, error) {
	if directory == "" || !filepath.IsAbs(directory) {
		return nil, errors.New("cold-soak state directory must be an absolute path")
	}
	info, err := os.Stat(directory)
	if err != nil {
		return nil, fmt.Errorf("inspect cold-soak state directory: %w", err)
	}
	if !info.IsDir() {
		return nil, errors.New("cold-soak state path is not a directory")
	}
	return &coldSoakStateStore{directory: filepath.Clean(directory), now: now}, nil
}

func (store *coldSoakStateStore) requireOutside(repositoryRoot string) error {
	repositoryRoot, err := filepath.EvalSymlinks(repositoryRoot)
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}
	stateDirectory, err := filepath.EvalSymlinks(store.directory)
	if err != nil {
		return fmt.Errorf("resolve state directory: %w", err)
	}
	relative, err := filepath.Rel(repositoryRoot, stateDirectory)
	if err != nil {
		return fmt.Errorf("compare repository and state directory: %w", err)
	}
	if relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
		return errors.New("cold-soak state directory must be outside the repository")
	}
	return nil
}

func (store *coldSoakStateStore) requireEmpty() error {
	entries, err := os.ReadDir(store.directory)
	if err != nil {
		return fmt.Errorf("read cold-soak state directory: %w", err)
	}
	if len(entries) != 0 {
		return errors.New("prepare requires a newly created empty state directory")
	}
	return nil
}

func (store *coldSoakStateStore) load() (*coldSoakManifest, error) {
	contents, err := os.ReadFile(filepath.Join(store.directory, coldSoakManifestName))
	if err != nil {
		return nil, fmt.Errorf("read cold-soak manifest: %w", err)
	}
	var manifest coldSoakManifest
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return nil, fmt.Errorf("decode cold-soak manifest: %w", err)
	}
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return nil, errors.New("cold-soak manifest has trailing JSON data")
	}
	if err := manifest.validate(); err != nil {
		return nil, err
	}
	return &manifest, nil
}

func (store *coldSoakStateStore) save(manifest *coldSoakManifest) error {
	if err := manifest.validate(); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return fmt.Errorf("encode cold-soak manifest: %w", err)
	}
	contents = append(contents, '\n')
	temporary, err := os.CreateTemp(store.directory, ".manifest-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary cold-soak manifest: %w", err)
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect temporary cold-soak manifest: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return fmt.Errorf("write temporary cold-soak manifest: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync temporary cold-soak manifest: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary cold-soak manifest: %w", err)
	}
	if err := os.Rename(temporaryName, filepath.Join(store.directory, coldSoakManifestName)); err != nil {
		return fmt.Errorf("replace cold-soak manifest: %w", err)
	}
	return syncDirectory(store.directory)
}

func (store *coldSoakStateStore) appendEvidence(evidence coldSoakEvidence) error {
	if evidence.RecordedAt.IsZero() {
		evidence.RecordedAt = store.now().UTC()
	}
	encoded, err := json.Marshal(evidence)
	if err != nil {
		return fmt.Errorf("encode cold-soak evidence: %w", err)
	}
	file, err := os.OpenFile(
		filepath.Join(store.directory, coldSoakEvidenceName),
		os.O_CREATE|os.O_APPEND|os.O_WRONLY,
		0o600,
	)
	if err != nil {
		return fmt.Errorf("open cold-soak evidence: %w", err)
	}
	defer file.Close()
	if _, err := file.Write(append(encoded, '\n')); err != nil {
		return fmt.Errorf("append cold-soak evidence: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync cold-soak evidence: %w", err)
	}
	return nil
}

func (manifest *coldSoakManifest) validate() error {
	if manifest.SchemaVersion != coldSoakSchemaVersion {
		return fmt.Errorf("unsupported cold-soak manifest schema %d", manifest.SchemaVersion)
	}
	if manifest.RunID == "" || manifest.CreatedAt.IsZero() {
		return errors.New("cold-soak manifest is missing its run identity")
	}
	expected := []struct {
		label string
		hours int
	}{{"12h", 12}, {"24h", 24}, {"48h", 48}}
	if len(manifest.Cohorts) != len(expected) {
		return fmt.Errorf("cold-soak manifest has %d cohorts, want %d", len(manifest.Cohorts), len(expected))
	}
	seenNames := make(map[string]struct{})
	if err := manifest.validateCohorts(expected, seenNames); err != nil {
		return err
	}
	return manifest.validatePressure(seenNames)
}

func (manifest *coldSoakManifest) validateCohorts(
	expected []struct {
		label string
		hours int
	},
	seenNames map[string]struct{},
) error {
	for index, cohort := range manifest.Cohorts {
		if cohort.Label != expected[index].label || cohort.DurationHours != expected[index].hours {
			return fmt.Errorf("cold-soak cohort %d has an unexpected schedule", index)
		}
		identity, err := coldSoakIdentity(manifest.RunID, "target", cohort.Label)
		if err != nil {
			return err
		}
		if cohort.Name != identity.Name || !slices.Equal(cohort.Labels, identity.Labels) {
			return fmt.Errorf("cold-soak cohort %s has conflicting ownership", cohort.Label)
		}
		if _, duplicate := seenNames[cohort.Name]; duplicate {
			return fmt.Errorf("duplicate cold-soak runtime name %s", cohort.Name)
		}
		seenNames[cohort.Name] = struct{}{}
		if !manifest.ColdEpoch.IsZero() {
			expectedDue := manifest.ColdEpoch.Add(time.Duration(cohort.DurationHours) * time.Hour)
			if !cohort.DueAt.Equal(expectedDue) {
				return fmt.Errorf("cold-soak cohort %s has conflicting due time", cohort.Label)
			}
		}
	}
	return nil
}

func (manifest *coldSoakManifest) validatePressure(seenNames map[string]struct{}) error {
	for index, pressure := range manifest.Pressure {
		identity, err := coldSoakIdentity(manifest.RunID, "pressure", fmt.Sprintf("%d", index))
		if err != nil {
			return err
		}
		if pressure.Index != index || pressure.Name != identity.Name || !slices.Equal(pressure.Labels, identity.Labels) {
			return fmt.Errorf("cold-soak pressure Sprite %d has conflicting ownership", index)
		}
		if _, duplicate := seenNames[pressure.Name]; duplicate {
			return fmt.Errorf("duplicate cold-soak runtime name %s", pressure.Name)
		}
		seenNames[pressure.Name] = struct{}{}
	}
	return nil
}

func newColdSoakManifest(
	runID string,
	createdAt time.Time,
	versions coldSoakVersions,
	capacity coldSoakCapacity,
) (*coldSoakManifest, error) {
	manifest := &coldSoakManifest{
		SchemaVersion:   coldSoakSchemaVersion,
		RunID:           runID,
		CreatedAt:       createdAt.UTC(),
		Versions:        versions,
		InitialCapacity: capacity,
	}
	for _, schedule := range []struct {
		label string
		hours int
	}{{"12h", 12}, {"24h", 24}, {"48h", 48}} {
		identity, err := coldSoakIdentity(runID, "target", schedule.label)
		if err != nil {
			return nil, err
		}
		manifest.Cohorts = append(manifest.Cohorts, coldSoakCohort{
			Label: schedule.label, DurationHours: schedule.hours,
			Name: identity.Name, Labels: identity.Labels,
		})
	}
	for index := range capacity.WarmLimit {
		identity, err := coldSoakIdentity(runID, "pressure", fmt.Sprintf("%d", index))
		if err != nil {
			return nil, err
		}
		manifest.Pressure = append(manifest.Pressure, coldSoakPressure{
			Index: index, Name: identity.Name, Labels: identity.Labels,
		})
	}
	return manifest, manifest.validate()
}

func coldSoakIdentity(runID string, kind string, value string) (runtimeprovider.ManagedIdentity, error) {
	return runtimeprovider.NewManagedIdentity("sprites-confirmed-cold-soak:" + runID + ":" + kind + ":" + value)
}

func classifyColdSoakProbe(
	initial coldSoakProbe,
	baseline coldSoakProbe,
	post coldSoakProbe,
	serviceHealthy bool,
) (coldSoakClassification, string, bool) {
	if post.SentinelSHA256 != baseline.SentinelSHA256 {
		return coldSoakProviderFail, "persistence sentinel is missing or changed", true
	}
	if err := validateColdSoakProbe(post); err != nil {
		return coldSoakProviderFail, err.Error(), true
	}
	if !serviceHealthy {
		return "", "Service has not recovered", false
	}
	if post.StartCount > initial.StartCount &&
		coldSoakHistoryHasPrefix(post.StartHistory, initial.StartHistory) &&
		post.StartHistory[len(post.StartHistory)-1].BootID != initial.StartHistory[len(initial.StartHistory)-1].BootID {
		if post.Heartbeat < baseline.Heartbeat {
			return coldSoakConfirmedCold, "Service restarted on a different boot and reset its heartbeat", true
		}
		return coldSoakProviderFail, "Service restarted but the heartbeat did not prove a reset", true
	}
	if post.StartCount == initial.StartCount &&
		coldSoakHistoryHasPrefix(post.StartHistory, initial.StartHistory) &&
		post.StartHistory[len(post.StartHistory)-1].BootID == initial.StartHistory[len(initial.StartHistory)-1].BootID &&
		post.CurrentBootID == initial.CurrentBootID {
		if post.Heartbeat > baseline.Heartbeat {
			return coldSoakWarm, "the original Service process and heartbeat resumed", true
		}
		return "", "waiting for the preserved heartbeat to resume", false
	}
	return coldSoakProviderFail, "probe boot, start history, and counter are inconsistent", true
}

func coldSoakHistoryHasPrefix(history []coldSoakStart, prefix []coldSoakStart) bool {
	return len(history) >= len(prefix) && slices.Equal(history[:len(prefix)], prefix)
}

func validateColdSoakProbe(probe coldSoakProbe) error {
	if len(probe.SentinelSHA256) != sha256.Size*2 {
		return errors.New("probe has an invalid sentinel digest")
	}
	if _, err := hex.DecodeString(probe.SentinelSHA256); err != nil {
		return errors.New("probe has an invalid sentinel digest")
	}
	if probe.StartCount < 1 || len(probe.StartHistory) != probe.StartCount {
		return errors.New("probe start counter and history are inconsistent")
	}
	latest := probe.StartHistory[len(probe.StartHistory)-1]
	if latest.BootID == "" || latest.ProcessID < 1 || latest.StartedAt.IsZero() || latest.BootID != probe.CurrentBootID {
		return errors.New("probe start history and current boot are inconsistent")
	}
	if probe.Heartbeat < 0 {
		return errors.New("probe heartbeat is invalid")
	}
	return nil
}

func syncDirectory(directory string) error {
	file, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer file.Close()
	return file.Sync()
}
