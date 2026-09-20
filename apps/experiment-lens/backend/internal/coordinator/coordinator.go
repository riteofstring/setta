package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/setta/experiment-lens/backend/internal/artifact"
	"github.com/setta/experiment-lens/backend/internal/contracts"
	"github.com/setta/experiment-lens/backend/internal/lensstate"
	"github.com/setta/experiment-lens/backend/internal/project"
)

var (
	ErrExperimentIdentity = errors.New("coordinator: experiment identity conflict")
	ErrRevisionConflict   = errors.New("coordinator: revision conflict")
	ErrInvalidSelection   = errors.New("coordinator: invalid selection")
	ErrArtifactMissing    = errors.New("coordinator: artifact does not exist")
	ErrArtifactChanged    = errors.New("coordinator: selected artifact changed")
)

type Coordinator struct {
	mu        sync.Mutex
	catalog   *project.Catalog
	resolver  *artifact.Resolver
	state     *lensstate.Store
	artifacts []contracts.ResolvedArtifact
}

func Open(projectRoot string) (*Coordinator, error) {
	catalog, err := project.Open(projectRoot)
	if err != nil {
		return nil, err
	}
	manifest, err := catalog.Manifest()
	if err != nil {
		return nil, err
	}
	resolver, err := artifact.New(catalog.Root())
	if err != nil {
		return nil, err
	}
	state, err := lensstate.Open(catalog.Root(), lensstate.Identity{
		ExperimentID: manifest.ID, ManifestSHA256: catalog.ManifestSHA256(), ObservationSourceSHA256: catalog.SourceSHA256(),
	})
	if err != nil {
		return nil, err
	}
	resolved := make([]contracts.ResolvedArtifact, 0, len(manifest.Artifacts))
	for _, reference := range manifest.Artifacts {
		resolved = append(resolved, resolver.Resolve(reference))
	}
	coordinator := &Coordinator{catalog: catalog, resolver: resolver, state: state, artifacts: resolved}
	if _, err := coordinator.Snapshot(); err != nil {
		_ = state.Close()
		return nil, err
	}
	return coordinator, nil
}

func (coordinator *Coordinator) Snapshot() (contracts.LensSnapshot, error) {
	document, err := coordinator.state.Snapshot()
	if err != nil {
		return contracts.LensSnapshot{}, err
	}
	return coordinator.buildSnapshot(document)
}

func (coordinator *Coordinator) Apply(mutation contracts.LensMutation) (contracts.MutationResult, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	current, err := coordinator.state.Snapshot()
	if err != nil {
		return contracts.MutationResult{}, err
	}
	if err := validateMutationTarget(mutation, current); err != nil {
		return contracts.MutationResult{}, err
	}
	manifest, source, err := coordinator.inputs()
	if err != nil {
		return contracts.MutationResult{}, err
	}
	if err := mutation.Selection.ValidateAgainst(manifest, source); err != nil {
		return contracts.MutationResult{}, fmt.Errorf("%w: %v", ErrInvalidSelection, err)
	}
	candidate := lensstate.Document{
		Version: 1, ExperimentID: current.ExperimentID, ManifestSHA256: current.ManifestSHA256,
		ObservationSourceSHA256: current.ObservationSourceSHA256, Revision: current.Revision + 1, Selection: mutation.Selection,
	}
	replaced, err := coordinator.state.Replace(current.Revision, candidate)
	if err != nil {
		return contracts.MutationResult{}, normalizeReplaceError(err)
	}
	snapshot, err := coordinator.buildSnapshot(replaced)
	if err != nil {
		return contracts.MutationResult{}, err
	}
	result := contracts.MutationResult{Version: contracts.ContractVersion, Snapshot: snapshot}
	if err := result.Validate(); err != nil {
		return contracts.MutationResult{}, err
	}
	return result, nil
}

func validateMutationTarget(mutation contracts.LensMutation, current lensstate.Document) error {
	if mutation.ExperimentID != current.ExperimentID || mutation.ManifestSHA256 != current.ManifestSHA256 || mutation.ObservationSourceSHA256 != current.ObservationSourceSHA256 {
		return ErrExperimentIdentity
	}
	if mutation.ExpectedRevision != current.Revision {
		return ErrRevisionConflict
	}
	return nil
}

func (coordinator *Coordinator) inputs() (contracts.ExperimentManifest, contracts.ObservationSource, error) {
	manifest, err := coordinator.catalog.Manifest()
	if err != nil {
		return contracts.ExperimentManifest{}, contracts.ObservationSource{}, err
	}
	source, err := coordinator.catalog.Source()
	if err != nil {
		return contracts.ExperimentManifest{}, contracts.ObservationSource{}, err
	}
	return manifest, source, nil
}

func normalizeReplaceError(err error) error {
	if errors.Is(err, lensstate.ErrRevisionConflict) {
		return ErrRevisionConflict
	}
	if errors.Is(err, lensstate.ErrIdentityConflict) {
		return ErrExperimentIdentity
	}
	return err
}

func (coordinator *Coordinator) Export() (contracts.ExportResult, error) {
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		return contracts.ExportResult{}, err
	}
	observationIDs := selectionObservationIDs(snapshot.Selection)
	selectedObservations := selectedObservations(snapshot.Observations, observationIDs)
	artifactIDs := selectionArtifactIDs(snapshot, observationIDs)
	selectedArtifacts, err := coordinator.selectedArtifacts(snapshot.Experiment.Artifacts, artifactIDs)
	if err != nil {
		return contracts.ExportResult{}, err
	}
	packet := contracts.SelectionPacket{
		Version: contracts.ContractVersion,
		ID:      fmt.Sprintf("%s-r%d", snapshot.Experiment.ID, snapshot.Revision),
		Experiment: contracts.PacketExperiment{
			ID: snapshot.Experiment.ID, Title: snapshot.Experiment.Title, Summary: snapshot.Experiment.Summary,
		},
		Source: contracts.SourceIdentity{
			ManifestPath: "experiment.json", ManifestSHA256: snapshot.ManifestSHA256,
			ObservationSourcePath: snapshot.ObservationSourcePath, ObservationSourceSHA256: snapshot.ObservationSourceSHA256,
		},
		Revision: snapshot.Revision, Selection: snapshot.Selection,
		Observations: selectedObservations, Artifacts: selectedArtifacts,
	}
	result := contracts.ExportResult{Version: contracts.ContractVersion, Packet: packet}
	if err := result.Validate(); err != nil {
		return contracts.ExportResult{}, err
	}
	return result, nil
}

func selectionObservationIDs(selection contracts.LensSelection) map[string]struct{} {
	observationIDs := map[string]struct{}{}
	for _, id := range selection.SelectedObservationIDs {
		observationIDs[id] = struct{}{}
	}
	for _, annotation := range selection.Annotations {
		for _, observationID := range annotation.ObservationIDs {
			observationIDs[observationID] = struct{}{}
		}
	}
	return observationIDs
}

func selectedObservations(observations []contracts.Observation, observationIDs map[string]struct{}) []contracts.Observation {
	selectedObservations := make([]contracts.Observation, 0, len(observationIDs))
	for _, observation := range observations {
		if _, exists := observationIDs[observation.ID]; exists {
			selectedObservations = append(selectedObservations, observation)
		}
	}
	return selectedObservations
}

func selectionArtifactIDs(snapshot contracts.LensSnapshot, observationIDs map[string]struct{}) map[string]struct{} {
	artifactIDs := map[string]struct{}{}
	for _, id := range snapshot.Selection.SelectedArtifactIDs {
		artifactIDs[id] = struct{}{}
	}
	for _, selectedRange := range snapshot.Selection.Ranges {
		artifactIDs[selectedRange.ArtifactID] = struct{}{}
	}
	for _, annotation := range snapshot.Selection.Annotations {
		if annotation.ArtifactID != nil {
			artifactIDs[*annotation.ArtifactID] = struct{}{}
		}
	}
	for _, relation := range snapshot.Experiment.Relations {
		if _, exists := observationIDs[relation.ObservationID]; exists {
			artifactIDs[relation.ArtifactID] = struct{}{}
		}
	}
	return artifactIDs
}

func (coordinator *Coordinator) selectedArtifacts(references []contracts.ArtifactReference, artifactIDs map[string]struct{}) ([]contracts.ArtifactReference, error) {
	selectedArtifacts := make([]contracts.ArtifactReference, 0, len(artifactIDs))
	for _, reference := range references {
		if _, exists := artifactIDs[reference.ID]; !exists {
			continue
		}
		if err := coordinator.resolver.Verify(reference); err != nil {
			return nil, fmt.Errorf("%w: %s", ErrArtifactChanged, reference.ID)
		}
		selectedArtifacts = append(selectedArtifacts, reference)
	}
	return selectedArtifacts, nil
}

func (coordinator *Coordinator) Subscribe(ctx context.Context) (<-chan contracts.LensSnapshot, error) {
	states, err := coordinator.state.Subscribe(ctx)
	if err != nil {
		return nil, err
	}
	stream := make(chan contracts.LensSnapshot, 1)
	go func() {
		defer close(stream)
		for state := range states {
			snapshot, err := coordinator.buildSnapshot(state)
			if err != nil {
				return
			}
			select {
			case stream <- snapshot:
			case <-ctx.Done():
				return
			}
		}
	}()
	return stream, nil
}

func (coordinator *Coordinator) OpenArtifact(id string) (*os.File, contracts.ArtifactReference, error) {
	reference, found, err := coordinator.catalog.Artifact(id)
	if err != nil {
		return nil, contracts.ArtifactReference{}, err
	}
	if !found {
		return nil, contracts.ArtifactReference{}, ErrArtifactMissing
	}
	file, err := coordinator.resolver.Open(reference)
	if err != nil {
		return nil, contracts.ArtifactReference{}, err
	}
	return file, reference, nil
}

func (coordinator *Coordinator) Close() error {
	return coordinator.state.Close()
}

func (coordinator *Coordinator) buildSnapshot(state lensstate.Document) (contracts.LensSnapshot, error) {
	manifest, err := coordinator.catalog.Manifest()
	if err != nil {
		return contracts.LensSnapshot{}, err
	}
	source, err := coordinator.catalog.Source()
	if err != nil {
		return contracts.LensSnapshot{}, err
	}
	artifacts, err := cloneArtifacts(coordinator.artifacts)
	if err != nil {
		return contracts.LensSnapshot{}, err
	}
	snapshot := contracts.LensSnapshot{
		Version: contracts.ContractVersion, ManifestPath: "experiment.json", ManifestSHA256: coordinator.catalog.ManifestSHA256(),
		ObservationSourcePath: manifest.Observations.Path, ObservationSourceSHA256: coordinator.catalog.SourceSHA256(),
		Experiment: manifest, Observations: source.Observations, Artifacts: artifacts,
		Revision: state.Revision, Selection: state.Selection,
	}
	if err := snapshot.Validate(); err != nil {
		return contracts.LensSnapshot{}, fmt.Errorf("coordinator: build snapshot: %w", err)
	}
	return snapshot, nil
}

func cloneArtifacts(values []contracts.ResolvedArtifact) ([]contracts.ResolvedArtifact, error) {
	encoded, err := json.Marshal(values)
	if err != nil {
		return nil, err
	}
	var cloned []contracts.ResolvedArtifact
	if err := json.Unmarshal(encoded, &cloned); err != nil {
		return nil, err
	}
	return cloned, nil
}
