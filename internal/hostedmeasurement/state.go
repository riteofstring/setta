package hostedmeasurement

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sync"
	"time"
)

const (
	StateSchemaVersion = 2
	maximumStateBytes  = 256 * 1024
	stateFileName      = "state.json"
)

var opaqueIDPattern = regexp.MustCompile(`^[!-~]{1,128}$`)

type Phase string

const (
	PhaseAuthorized Phase = "authorized"
	PhaseDeploying  Phase = "deploying"
	PhaseMeasuring  Phase = "measuring"
	PhaseCleaning   Phase = "cleaning"
	PhaseClean      Phase = "clean"
	PhaseFailed     Phase = "failed"
)

type ResourceKind string

const (
	ResourceFlyApp     ResourceKind = "fly_app"
	ResourceFlyVolume  ResourceKind = "fly_volume"
	ResourceFlyMachine ResourceKind = "fly_machine"
	ResourceSprite     ResourceKind = "sprite"
)

type OperationCode string

const (
	OperationCreateAccepted   OperationCode = "create_accepted"
	OperationCreateAdopted    OperationCode = "create_adopted_after_ambiguity"
	OperationDeleteAccepted   OperationCode = "delete_accepted"
	OperationAbsenceConfirmed OperationCode = "absence_confirmed"
	OperationCleanupFailed    OperationCode = "cleanup_failed"
	OperationDeadlineReached  OperationCode = "cleanup_deadline_reached"
)

type ResourceState struct {
	Kind               ResourceKind `json:"kind"`
	ID                 string       `json:"id"`
	Name               string       `json:"name"`
	ActualRegion       string       `json:"actual_region,omitempty"`
	DeleteAcceptedAt   string       `json:"delete_accepted_at,omitempty"`
	AbsenceConfirmedAt string       `json:"absence_confirmed_at,omitempty"`
}

type OperationEvent struct {
	At       string        `json:"at"`
	Code     OperationCode `json:"code"`
	Resource ResourceKind  `json:"resource"`
}

type ResourceIntent struct {
	Kind ResourceKind `json:"kind"`
	Name string       `json:"name"`
}

type BootstrapState struct {
	MachineID         string `json:"machine_id"`
	RuntimeName       string `json:"runtime_name"`
	DeviceID          string `json:"device_id"`
	CredentialSHA256  string `json:"credential_sha256"`
	BootstrapAccepted string `json:"bootstrap_accepted_at,omitempty"`
}

type State struct {
	SchemaVersion  int              `json:"schema_version"`
	RunID          string           `json:"run_id"`
	ManifestDigest string           `json:"manifest_digest"`
	Phase          Phase            `json:"phase"`
	UpdatedAt      string           `json:"updated_at"`
	Intents        []ResourceIntent `json:"intents"`
	Resources      []ResourceState  `json:"resources"`
	Operations     []OperationEvent `json:"operations"`
	Bootstrap      *BootstrapState  `json:"bootstrap,omitempty"`
}

type StateStore struct {
	directory     string
	path          string
	authorization Authorization
	mu            sync.Mutex
	state         State
	beforeRename  func(string) error
}

func OpenStateStore(directory string, authorization Authorization, now time.Time) (*StateStore, error) {
	store, exists, err := openStateStore(directory, authorization)
	if err != nil {
		return nil, err
	}
	if exists {
		return store, nil
	}
	store.state = State{
		SchemaVersion:  StateSchemaVersion,
		RunID:          authorization.Manifest.RunID,
		ManifestDigest: authorization.ManifestDigest,
		Phase:          PhaseAuthorized,
		UpdatedAt:      now.UTC().Format(time.RFC3339Nano),
		Intents:        []ResourceIntent{},
		Resources:      []ResourceState{},
		Operations:     []OperationEvent{},
	}
	if err := store.writeLocked(store.state); err != nil {
		return nil, err
	}
	return store, nil
}

func OpenExistingStateStore(directory string, authorization Authorization) (*StateStore, error) {
	store, exists, err := openStateStore(directory, authorization)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, errors.New("hosted measurement cleanup state does not exist")
	}
	return store, nil
}

func openStateStore(directory string, authorization Authorization) (*StateStore, bool, error) {
	if directory == "" || !filepath.IsAbs(directory) {
		return nil, false, errors.New("hosted measurement state directory must be absolute")
	}
	if filepath.Clean(directory) != authorization.StateDirectory {
		return nil, false, errors.New("hosted measurement state must share the authorization manifest directory")
	}
	if err := validatePrivateDirectory(directory); err != nil {
		return nil, false, err
	}
	store := &StateStore{
		directory:     filepath.Clean(directory),
		path:          filepath.Join(filepath.Clean(directory), stateFileName),
		authorization: authorization,
	}
	data, err := readPrivateRegularFile(store.path, maximumStateBytes, "hosted measurement state")
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, false, err
	}
	if err == nil {
		state, decodeErr := decodeState(data)
		if decodeErr != nil {
			return nil, false, decodeErr
		}
		if validateErr := validateState(state, authorization); validateErr != nil {
			return nil, false, validateErr
		}
		store.state = state
		return store, true, nil
	}
	return store, false, nil
}

func (store *StateStore) Snapshot() State {
	store.mu.Lock()
	defer store.mu.Unlock()
	return cloneState(store.state)
}

func (store *StateStore) SetPhase(phase Phase, now time.Time) error {
	if !validPhase(phase) {
		return fmt.Errorf("invalid hosted measurement phase %q", phase)
	}
	return store.update(now, func(state *State) error {
		state.Phase = phase
		return nil
	})
}

func (store *StateStore) RecordIntent(intent ResourceIntent, now time.Time) error {
	if !validResourceKind(intent.Kind) || !opaqueIDPattern.MatchString(intent.Name) {
		return errors.New("hosted measurement resource intent must have a valid kind and deterministic name")
	}
	return store.update(now, func(state *State) error {
		for _, existing := range state.Intents {
			if existing.Kind == intent.Kind {
				if existing == intent {
					return nil
				}
				return fmt.Errorf("hosted measurement resource intent %s is already recorded", intent.Kind)
			}
		}
		state.Intents = append(state.Intents, intent)
		return nil
	})
}

func (store *StateStore) RecordResource(resource ResourceState, code OperationCode, now time.Time) error {
	if err := validateResource(resource); err != nil {
		return err
	}
	if !validOperationCode(code) {
		return fmt.Errorf("invalid hosted measurement operation code %q", code)
	}
	return store.update(now, func(state *State) error {
		for _, existing := range state.Resources {
			if existing.Kind == resource.Kind || existing.ID == resource.ID {
				if existing == resource {
					return nil
				}
				return fmt.Errorf("hosted measurement resource %s is already recorded", resource.Kind)
			}
		}
		state.Resources = append(state.Resources, resource)
		state.Operations = append(state.Operations, OperationEvent{
			At:       now.UTC().Format(time.RFC3339Nano),
			Code:     code,
			Resource: resource.Kind,
		})
		return nil
	})
}

func (store *StateStore) RecordDeletion(kind ResourceKind, code OperationCode, now time.Time) error {
	if code != OperationDeleteAccepted && code != OperationAbsenceConfirmed && code != OperationCleanupFailed {
		return fmt.Errorf("operation code %q is not a cleanup result", code)
	}
	return store.update(now, func(state *State) error {
		found := false
		for index := range state.Resources {
			resource := &state.Resources[index]
			if resource.Kind != kind {
				continue
			}
			found = true
			switch code {
			case OperationDeleteAccepted:
				resource.DeleteAcceptedAt = now.UTC().Format(time.RFC3339Nano)
			case OperationAbsenceConfirmed:
				resource.AbsenceConfirmedAt = now.UTC().Format(time.RFC3339Nano)
			case OperationCleanupFailed:
			}
		}
		if !found {
			return fmt.Errorf("hosted measurement resource %s is not recorded", kind)
		}
		state.Operations = append(state.Operations, OperationEvent{
			At:       now.UTC().Format(time.RFC3339Nano),
			Code:     code,
			Resource: kind,
		})
		return nil
	})
}

func (store *StateStore) RecordBootstrapIntent(bootstrap BootstrapState, now time.Time) error {
	if bootstrap.BootstrapAccepted != "" {
		return errors.New("hosted measurement bootstrap intent cannot already be accepted")
	}
	return store.update(now, func(state *State) error {
		if state.Bootstrap != nil {
			if *state.Bootstrap == bootstrap {
				return nil
			}
			return errors.New("hosted measurement bootstrap intent differs from durable state")
		}
		state.Bootstrap = &bootstrap
		return nil
	})
}

func (store *StateStore) RecordBootstrapAccepted(now time.Time) error {
	return store.update(now, func(state *State) error {
		if state.Bootstrap == nil {
			return errors.New("hosted measurement bootstrap intent is not recorded")
		}
		if state.Bootstrap.BootstrapAccepted != "" {
			return nil
		}
		state.Bootstrap.BootstrapAccepted = now.UTC().Format(time.RFC3339Nano)
		return nil
	})
}

func (store *StateStore) update(now time.Time, mutate func(*State) error) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	next := cloneState(store.state)
	if err := mutate(&next); err != nil {
		return err
	}
	next.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
	if err := validateState(next, store.authorization); err != nil {
		return err
	}
	if err := store.writeLocked(next); err != nil {
		return err
	}
	store.state = next
	return nil
}

func (store *StateStore) writeLocked(state State) error {
	temporary, err := os.CreateTemp(store.directory, ".state-*")
	if err != nil {
		return fmt.Errorf("create temporary hosted measurement state: %w", err)
	}
	temporaryPath := temporary.Name()
	installed := false
	defer func() {
		if !installed {
			_ = temporary.Close()
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(0o600); err != nil {
		return fmt.Errorf("restrict temporary hosted measurement state: %w", err)
	}
	encoder := json.NewEncoder(temporary)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(state); err != nil {
		return fmt.Errorf("encode hosted measurement state: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync temporary hosted measurement state: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary hosted measurement state: %w", err)
	}
	if store.beforeRename != nil {
		if err := store.beforeRename(temporaryPath); err != nil {
			return err
		}
	}
	if err := os.Rename(temporaryPath, store.path); err != nil {
		return fmt.Errorf("install hosted measurement state: %w", err)
	}
	installed = true
	return syncPrivateDirectory(store.directory)
}

func decodeState(data []byte) (State, error) {
	if err := rejectDuplicateJSONFields(data); err != nil {
		return State{}, fmt.Errorf("validate hosted measurement state JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var state State
	if err := decoder.Decode(&state); err != nil {
		return State{}, fmt.Errorf("decode hosted measurement state: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return State{}, errors.New("hosted measurement state must contain one JSON value")
	}
	return state, nil
}

func validateState(state State, authorization Authorization) error {
	if state.SchemaVersion != StateSchemaVersion || state.RunID != authorization.Manifest.RunID || state.ManifestDigest != authorization.ManifestDigest {
		return errors.New("hosted measurement state does not match the authorization manifest")
	}
	if !validPhase(state.Phase) {
		return fmt.Errorf("hosted measurement state has invalid phase %q", state.Phase)
	}
	if _, err := time.Parse(time.RFC3339Nano, state.UpdatedAt); err != nil {
		return errors.New("hosted measurement state updated_at must be RFC3339Nano")
	}
	intentNames, err := validateResourceIntents(state.Intents)
	if err != nil {
		return err
	}
	if err := validateResources(state.Resources, intentNames); err != nil {
		return err
	}
	if err := validateOperationEvents(state.Operations); err != nil {
		return err
	}
	return validateBootstrapState(state.Bootstrap, state.Resources)
}

func validateBootstrapState(bootstrap *BootstrapState, resources []ResourceState) error {
	if bootstrap == nil {
		return nil
	}
	if err := validateBootstrapIdentity(*bootstrap); err != nil {
		return err
	}
	if err := validateBootstrapResources(*bootstrap, resources); err != nil {
		return err
	}
	if bootstrap.BootstrapAccepted == "" {
		return nil
	}
	if _, err := time.Parse(time.RFC3339Nano, bootstrap.BootstrapAccepted); err != nil {
		return errors.New("hosted measurement bootstrap acceptance must be RFC3339Nano")
	}
	return nil
}

func validateBootstrapIdentity(bootstrap BootstrapState) error {
	if !opaqueIDPattern.MatchString(bootstrap.MachineID) || !opaqueIDPattern.MatchString(bootstrap.RuntimeName) ||
		!opaqueIDPattern.MatchString(bootstrap.DeviceID) || !isLowerSHA256(bootstrap.CredentialSHA256) {
		return errors.New("hosted measurement bootstrap state has invalid identities or credential digest")
	}
	return nil
}

func validateBootstrapResources(bootstrap BootstrapState, resources []ResourceState) error {
	machine, hasMachine := resourceFromSlice(resources, ResourceFlyMachine)
	runtime, hasRuntime := resourceFromSlice(resources, ResourceSprite)
	if !hasMachine || !hasRuntime || machine.ID != bootstrap.MachineID || runtime.Name != bootstrap.RuntimeName {
		return errors.New("hosted measurement bootstrap state differs from durable Machine or Sprite resources")
	}
	return nil
}

func resourceFromSlice(resources []ResourceState, kind ResourceKind) (ResourceState, bool) {
	for _, resource := range resources {
		if resource.Kind == kind {
			return resource, true
		}
	}
	return ResourceState{}, false
}

func validateResourceIntents(intents []ResourceIntent) (map[ResourceKind]string, error) {
	seenKinds := make(map[ResourceKind]struct{})
	intentNames := make(map[ResourceKind]string)
	for _, intent := range intents {
		if !validResourceKind(intent.Kind) || !opaqueIDPattern.MatchString(intent.Name) {
			return nil, errors.New("hosted measurement state contains an invalid resource intent")
		}
		if _, exists := seenKinds[intent.Kind]; exists {
			return nil, fmt.Errorf("hosted measurement state repeats resource intent kind %s", intent.Kind)
		}
		seenKinds[intent.Kind] = struct{}{}
		intentNames[intent.Kind] = intent.Name
	}
	return intentNames, nil
}

func validateResources(resources []ResourceState, intentNames map[ResourceKind]string) error {
	seenKinds := make(map[ResourceKind]struct{})
	seenIDs := make(map[string]struct{})
	for _, resource := range resources {
		if err := validateResource(resource); err != nil {
			return err
		}
		if _, exists := seenKinds[resource.Kind]; exists {
			return fmt.Errorf("hosted measurement state repeats resource kind %s", resource.Kind)
		}
		if _, exists := seenIDs[resource.ID]; exists {
			return errors.New("hosted measurement state repeats a provider resource id")
		}
		seenKinds[resource.Kind] = struct{}{}
		seenIDs[resource.ID] = struct{}{}
		if intentName, exists := intentNames[resource.Kind]; exists && intentName != resource.Name {
			return fmt.Errorf("hosted measurement resource %s does not match its durable intent", resource.Kind)
		}
	}
	return nil
}

func validateOperationEvents(operations []OperationEvent) error {
	for _, operation := range operations {
		if !validOperationCode(operation.Code) || !validResourceKind(operation.Resource) {
			return errors.New("hosted measurement state contains an invalid operation event")
		}
		if _, err := time.Parse(time.RFC3339Nano, operation.At); err != nil {
			return errors.New("hosted measurement operation timestamp must be RFC3339Nano")
		}
	}
	return nil
}

func validateResource(resource ResourceState) error {
	if !validResourceKind(resource.Kind) || !opaqueIDPattern.MatchString(resource.ID) || !opaqueIDPattern.MatchString(resource.Name) {
		return errors.New("hosted measurement resource must have a valid kind and opaque provider id/name")
	}
	if resource.ActualRegion != "" && !regionPattern.MatchString(resource.ActualRegion) {
		return errors.New("hosted measurement resource region is invalid")
	}
	for _, value := range []string{resource.DeleteAcceptedAt, resource.AbsenceConfirmedAt} {
		if value == "" {
			continue
		}
		if _, err := time.Parse(time.RFC3339Nano, value); err != nil {
			return errors.New("hosted measurement resource cleanup timestamp must be RFC3339Nano")
		}
	}
	return nil
}

func validResourceKind(kind ResourceKind) bool {
	switch kind {
	case ResourceFlyApp, ResourceFlyVolume, ResourceFlyMachine, ResourceSprite:
		return true
	default:
		return false
	}
}

func validOperationCode(code OperationCode) bool {
	switch code {
	case OperationCreateAccepted, OperationCreateAdopted, OperationDeleteAccepted, OperationAbsenceConfirmed,
		OperationCleanupFailed, OperationDeadlineReached:
		return true
	default:
		return false
	}
}

func validPhase(phase Phase) bool {
	switch phase {
	case PhaseAuthorized, PhaseDeploying, PhaseMeasuring, PhaseCleaning, PhaseClean, PhaseFailed:
		return true
	default:
		return false
	}
}

func cloneState(state State) State {
	cloned := state
	cloned.Intents = append([]ResourceIntent(nil), state.Intents...)
	cloned.Resources = append([]ResourceState(nil), state.Resources...)
	cloned.Operations = append([]OperationEvent(nil), state.Operations...)
	if state.Bootstrap != nil {
		bootstrap := *state.Bootstrap
		cloned.Bootstrap = &bootstrap
	}
	return cloned
}

func syncPrivateDirectory(directory string) error {
	handle, err := os.Open(directory)
	if err != nil {
		return fmt.Errorf("open hosted measurement state directory: %w", err)
	}
	defer handle.Close()
	if err := handle.Sync(); err != nil {
		return fmt.Errorf("sync hosted measurement state directory: %w", err)
	}
	return nil
}
