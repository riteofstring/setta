package coordinator

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"

	"github.com/riteofstring/setta/apps/review/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/review/backend/internal/evidence"
	"github.com/riteofstring/setta/apps/review/backend/internal/project"
	"github.com/riteofstring/setta/apps/review/backend/internal/reviewstate"
)

var (
	ErrProjectIdentity  = errors.New("coordinator: project identity conflict")
	ErrRevisionConflict = errors.New("coordinator: revision conflict")
	ErrRequestMissing   = errors.New("coordinator: request does not exist")
	ErrEvidenceMissing  = errors.New("coordinator: evidence does not exist")
)

type Coordinator struct {
	mu       sync.Mutex
	catalog  *project.Catalog
	resolver *evidence.Resolver
	state    *reviewstate.Store
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
	resolver, err := evidence.New(catalog.Root())
	if err != nil {
		return nil, err
	}
	state, err := reviewstate.Open(catalog.Root(), manifest.ID)
	if err != nil {
		return nil, err
	}
	coordinator := &Coordinator{catalog: catalog, resolver: resolver, state: state}
	if _, err := coordinator.Snapshot(); err != nil {
		_ = state.Close()
		return nil, err
	}
	return coordinator, nil
}

func (coordinator *Coordinator) Snapshot() (contracts.ReviewSnapshot, error) {
	document, err := coordinator.state.Snapshot()
	if err != nil {
		return contracts.ReviewSnapshot{}, err
	}
	return coordinator.buildSnapshot(document)
}

func (coordinator *Coordinator) Apply(mutation contracts.ReviewMutation) (contracts.MutationResult, error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	currentState, err := coordinator.state.Snapshot()
	if err != nil {
		return contracts.MutationResult{}, err
	}
	if mutation.ProjectID != currentState.ProjectID {
		return contracts.MutationResult{}, ErrProjectIdentity
	}
	if mutation.ExpectedRevision != currentState.Revision {
		return contracts.MutationResult{}, ErrRevisionConflict
	}
	current, err := coordinator.buildSnapshot(currentState)
	if err != nil {
		return contracts.MutationResult{}, err
	}
	candidate, err := contracts.ApplyMutation(current, mutation)
	if err != nil {
		return contracts.MutationResult{}, err
	}
	candidateState := stateFromSnapshot(candidate)
	if _, err := coordinator.state.Replace(currentState.Revision, candidateState); err != nil {
		if errors.Is(err, reviewstate.ErrRevisionConflict) {
			return contracts.MutationResult{}, ErrRevisionConflict
		}
		if errors.Is(err, reviewstate.ErrIdentityConflict) {
			return contracts.MutationResult{}, ErrProjectIdentity
		}
		return contracts.MutationResult{}, err
	}
	result := contracts.MutationResult{Version: contracts.ContractVersion, Snapshot: candidate}
	if err := result.Validate(); err != nil {
		return contracts.MutationResult{}, err
	}
	return result, nil
}

func (coordinator *Coordinator) Export(includeContinuations bool) (contracts.ExportResult, error) {
	snapshot, err := coordinator.Snapshot()
	if err != nil {
		return contracts.ExportResult{}, err
	}
	document := contracts.ExportDocument{
		Version:       contracts.ContractVersion,
		ProjectID:     snapshot.Project.ID,
		Revision:      snapshot.Revision,
		Responses:     []contracts.ReviewResponse{},
		Continuations: []contracts.ContinuationPacket{},
	}
	for _, request := range snapshot.Requests {
		if request.Response == nil {
			continue
		}
		document.Responses = append(document.Responses, *request.Response)
		if includeContinuations {
			document.Continuations = append(document.Continuations, contracts.ContinuationPacket{
				Version:       contracts.ContractVersion,
				ProjectID:     snapshot.Project.ID,
				Request:       request.Request,
				RequestSHA256: request.SHA256,
				Response:      *request.Response,
				Evidence:      request.Evidence,
			})
		}
	}
	result := contracts.ExportResult{Version: contracts.ContractVersion, Export: document}
	if err := result.Validate(); err != nil {
		return contracts.ExportResult{}, err
	}
	return result, nil
}

func (coordinator *Coordinator) Subscribe(ctx context.Context) (<-chan contracts.ReviewSnapshot, error) {
	states, err := coordinator.state.Subscribe(ctx)
	if err != nil {
		return nil, err
	}
	stream := make(chan contracts.ReviewSnapshot, 1)
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

func (coordinator *Coordinator) OpenArtifact(requestID string, evidenceID string) (*os.File, contracts.ArtifactEvidenceReference, error) {
	reference, found, err := coordinator.catalog.Evidence(requestID, evidenceID)
	if err != nil {
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	if !found {
		if _, requestFound, requestErr := coordinator.catalog.Request(requestID); requestErr != nil {
			return nil, contracts.ArtifactEvidenceReference{}, requestErr
		} else if !requestFound {
			return nil, contracts.ArtifactEvidenceReference{}, ErrRequestMissing
		}
		return nil, contracts.ArtifactEvidenceReference{}, ErrEvidenceMissing
	}
	if reference.Artifact == nil || reference.Kind != "artifact" {
		return nil, contracts.ArtifactEvidenceReference{}, ErrEvidenceMissing
	}
	file, err := coordinator.resolver.OpenArtifact(reference)
	if err != nil {
		return nil, contracts.ArtifactEvidenceReference{}, err
	}
	return file, *reference.Artifact, nil
}

func (coordinator *Coordinator) Close() error {
	return coordinator.state.Close()
}

func (coordinator *Coordinator) buildSnapshot(state reviewstate.Document) (contracts.ReviewSnapshot, error) {
	manifest, err := coordinator.catalog.Manifest()
	if err != nil {
		return contracts.ReviewSnapshot{}, err
	}
	requests, err := coordinator.catalog.Requests()
	if err != nil {
		return contracts.ReviewSnapshot{}, err
	}
	assessments := make(map[string][]contracts.ExternalAssessment, len(requests))
	for _, assessment := range state.Assessments {
		assessments[assessment.RequestID] = append(assessments[assessment.RequestID], assessment)
	}
	responses := make(map[string]contracts.ReviewResponse, len(state.Responses))
	for _, response := range state.Responses {
		responses[response.RequestID] = response
	}
	snapshot := contracts.ReviewSnapshot{
		Version:  contracts.ContractVersion,
		Project:  manifest,
		Revision: state.Revision,
		Requests: make([]contracts.RequestSnapshot, 0, len(requests)),
	}
	for _, admitted := range requests {
		requestSnapshot := contracts.RequestSnapshot{
			Path:        admitted.Path,
			SHA256:      admitted.SHA256,
			Request:     admitted.Document,
			Assessments: append([]contracts.ExternalAssessment(nil), assessments[admitted.Document.ID]...),
			Evidence:    make([]contracts.ResolvedEvidence, 0, len(admitted.Document.Evidence)),
		}
		if requestSnapshot.Assessments == nil {
			requestSnapshot.Assessments = []contracts.ExternalAssessment{}
		}
		if response, found := responses[admitted.Document.ID]; found {
			copy := response
			requestSnapshot.Response = &copy
		}
		for _, reference := range admitted.Document.Evidence {
			requestSnapshot.Evidence = append(requestSnapshot.Evidence, coordinator.resolver.Resolve(admitted.Document.ID, reference))
		}
		snapshot.Requests = append(snapshot.Requests, requestSnapshot)
	}
	if err := snapshot.Validate(); err != nil {
		return contracts.ReviewSnapshot{}, fmt.Errorf("coordinator: build snapshot: %w", err)
	}
	return snapshot, nil
}

func stateFromSnapshot(snapshot contracts.ReviewSnapshot) reviewstate.Document {
	document := reviewstate.Document{
		Version:     1,
		ProjectID:   snapshot.Project.ID,
		Revision:    snapshot.Revision,
		Assessments: []contracts.ExternalAssessment{},
		Responses:   []contracts.ReviewResponse{},
	}
	for _, request := range snapshot.Requests {
		document.Assessments = append(document.Assessments, request.Assessments...)
		if request.Response != nil {
			document.Responses = append(document.Responses, *request.Response)
		}
	}
	return document
}
