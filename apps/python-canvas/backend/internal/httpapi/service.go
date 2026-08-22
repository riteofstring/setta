package httpapi

import (
	"context"
	"fmt"

	"github.com/setta/python-canvas/backend/internal/contracts"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

// ProjectService is the complete V2 application boundary used by the HTTP
// adapter. It exposes canonical snapshots, never a mutable transport model.
type ProjectService interface {
	Snapshot() contracts.ProjectSnapshotV2
	RenameProject(context.Context, contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error)
	CreateCallable(context.Context, contracts.CreateCallableRequestV2) (contracts.ProjectSnapshotV2, error)
	RenameCallable(context.Context, string, contracts.RenameCallableRequestV2) (contracts.ProjectSnapshotV2, error)
	DeleteCallable(context.Context, string, contracts.DeleteCallableRequestV2) (contracts.ProjectSnapshotV2, error)
	CreateParameterDictionary(context.Context, contracts.CreateParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error)
	RenameParameterDictionary(context.Context, string, contracts.RenameParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error)
	DeleteParameterDictionary(context.Context, string, contracts.DeleteParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error)
	SetParameterDictionaryEntries(context.Context, string, contracts.SetParameterDictionaryEntriesRequestV2) (contracts.ProjectSnapshotV2, error)
	CreateList(context.Context, contracts.CreateListRequestV2) (contracts.ProjectSnapshotV2, error)
	RenameList(context.Context, string, contracts.RenameListRequestV2) (contracts.ProjectSnapshotV2, error)
	DeleteList(context.Context, string, contracts.DeleteListRequestV2) (contracts.ProjectSnapshotV2, error)
	IncrementListChildren(context.Context, string, contracts.IncrementListChildrenRequestV2) (contracts.ProjectSnapshotV2, error)
	DecrementListChildren(context.Context, string, contracts.DecrementListChildrenRequestV2) (contracts.ProjectSnapshotV2, error)
	ReplaceSectionForest(context.Context, contracts.ReplaceSectionForestRequestV2) (contracts.ProjectSnapshotV2, error)
	CommitCallable(context.Context, string, contracts.CommitCallableRequestV2) (contracts.ProjectSnapshotV2, error)
	RefreshCallableParameters(context.Context, string, contracts.RefreshCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error)
	SetCallableParameters(context.Context, string, contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error)
	SetPythonTarget(context.Context, contracts.SetPythonTargetRequestV2) (contracts.ProjectSnapshotV2, error)
	CompleteCallable(context.Context, string, contracts.CallableCompletionRequestV2) ([]contracts.CompletionItemV2, error)
	CompletePythonTarget(context.Context, contracts.PythonTargetCompletionRequestV2) ([]contracts.CompletionItemV2, error)
}

// CoordinatorService is the deliberately thin V2 delivery adapter around the
// durable coordinator. Request-shape checks belong to HTTP/contracts; aggregate
// semantics, rendering, provider synchronization, and persistence stay below.
type CoordinatorService struct {
	coordinator *coordinator.Coordinator
}

func NewCoordinatorService(value *coordinator.Coordinator) (*CoordinatorService, error) {
	if value == nil {
		return nil, ErrProjectServiceRequired
	}
	if _, err := snapshotV2(value.Snapshot()); err != nil {
		return nil, fmt.Errorf("map coordinator startup snapshot: %w", err)
	}
	return &CoordinatorService{coordinator: value}, nil
}

func (service *CoordinatorService) Snapshot() contracts.ProjectSnapshotV2 {
	if service == nil || service.coordinator == nil {
		return contracts.ProjectSnapshotV2{}
	}
	snapshot, err := snapshotV2(service.coordinator.Snapshot())
	if err != nil {
		return contracts.ProjectSnapshotV2{}
	}
	return snapshot
}

func (service *CoordinatorService) RenameProject(ctx context.Context, request contracts.RenameProjectRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.RenameProject(ctx, aggregate.RenameProjectCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) CreateCallable(ctx context.Context, request contracts.CreateCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.CreateCallable(ctx, aggregate.CreateCallableCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) RenameCallable(ctx context.Context, callableID string, request contracts.RenameCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.RenameCallable(ctx, aggregate.RenameCallableCommand{ProjectID: request.ProjectID, CallableID: callableID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) DeleteCallable(ctx context.Context, callableID string, request contracts.DeleteCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.DeleteCallable(ctx, aggregate.DeleteCallableCommand{ProjectID: request.ProjectID, CallableID: callableID, ExpectedRevision: request.ExpectedRevision})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) CreateParameterDictionary(ctx context.Context, request contracts.CreateParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.CreateParameterDictionary(ctx, aggregate.CreateParameterDictionaryCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) RenameParameterDictionary(ctx context.Context, dictionaryID string, request contracts.RenameParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.RenameParameterDictionary(ctx, aggregate.RenameParameterDictionaryCommand{ProjectID: request.ProjectID, DictionaryID: dictionaryID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) DeleteParameterDictionary(ctx context.Context, dictionaryID string, request contracts.DeleteParameterDictionaryRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.DeleteParameterDictionary(ctx, aggregate.DeleteParameterDictionaryCommand{ProjectID: request.ProjectID, DictionaryID: dictionaryID, ExpectedRevision: request.ExpectedRevision})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) SetParameterDictionaryEntries(ctx context.Context, dictionaryID string, request contracts.SetParameterDictionaryEntriesRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.SetParameterDictionaryEntries(ctx, aggregate.SetParameterDictionaryEntriesCommand{ProjectID: request.ProjectID, DictionaryID: dictionaryID, ExpectedRevision: request.ExpectedRevision, Entries: dictionaryEntriesFromV2(request.Entries)})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) CreateList(ctx context.Context, request contracts.CreateListRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.CreateList(ctx, aggregate.CreateListCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) RenameList(ctx context.Context, listID string, request contracts.RenameListRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.RenameList(ctx, aggregate.RenameListCommand{ProjectID: request.ProjectID, ListID: listID, ExpectedRevision: request.ExpectedRevision, Name: request.Name})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) DeleteList(ctx context.Context, listID string, request contracts.DeleteListRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.DeleteList(ctx, aggregate.DeleteListCommand{ProjectID: request.ProjectID, ListID: listID, ExpectedRevision: request.ExpectedRevision})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) IncrementListChildren(ctx context.Context, listID string, request contracts.IncrementListChildrenRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.IncrementListChildren(ctx, aggregate.IncrementListChildrenCommand{ProjectID: request.ProjectID, ListID: listID, ExpectedRevision: request.ExpectedRevision, Count: request.Count})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) DecrementListChildren(ctx context.Context, listID string, request contracts.DecrementListChildrenRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.DecrementListChildren(ctx, aggregate.DecrementListChildrenCommand{ProjectID: request.ProjectID, ListID: listID, ExpectedRevision: request.ExpectedRevision, Count: request.Count})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) ReplaceSectionForest(ctx context.Context, request contracts.ReplaceSectionForestRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.ReplaceSectionForest(ctx, aggregate.ReplaceSectionForestCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, TopLevelSectionIDs: cloneSectionIDs(request.TopLevelSectionIDs), ListChildren: listChildrenFromV2(request.ListChildren)})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) CommitCallable(ctx context.Context, callableID string, request contracts.CommitCallableRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.CommitCallable(ctx, aggregate.CommitCallableCommand{ProjectID: request.ProjectID, CallableID: callableID, ExpectedRevision: request.ExpectedRevision, AuthoredExpression: request.AuthoredExpression})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) RefreshCallableParameters(ctx context.Context, callableID string, request contracts.RefreshCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.RefreshCallableParameters(ctx, aggregate.RefreshCallableParametersCommand{ProjectID: request.ProjectID, CallableID: callableID, ExpectedRevision: request.ExpectedRevision})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) SetCallableParameters(ctx context.Context, callableID string, request contracts.SetCallableParametersRequestV2) (contracts.ProjectSnapshotV2, error) {
	parameters := make([]aggregate.ParameterProposal, 0, len(request.Parameters))
	for _, parameter := range request.Parameters {
		parameters = append(parameters, aggregate.ParameterProposal{ID: parameter.ID, Name: parameter.Name, AuthoredExpression: parameter.AuthoredExpression})
	}
	snapshot, err := service.coordinator.SetParameters(ctx, aggregate.SetParametersCommand{ProjectID: request.ProjectID, CallableID: callableID, ExpectedRevision: request.ExpectedRevision, Parameters: parameters})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) SetPythonTarget(ctx context.Context, request contracts.SetPythonTargetRequestV2) (contracts.ProjectSnapshotV2, error) {
	snapshot, err := service.coordinator.SetTarget(ctx, aggregate.SetTargetCommand{ProjectID: request.ProjectID, ExpectedRevision: request.ExpectedRevision, Prefix: request.Prefix, Suffix: request.Suffix})
	return mappedSnapshot(snapshot, err)
}

func (service *CoordinatorService) CompleteCallable(ctx context.Context, callableID string, request contracts.CallableCompletionRequestV2) ([]contracts.CompletionItemV2, error) {
	items, err := service.coordinator.CompleteCallable(ctx, request.ProjectID, callableID, request.AuthoredExpression, request.CursorOffsetUTF16)
	return completionItemsV2(items), err
}

func (service *CoordinatorService) CompletePythonTarget(ctx context.Context, request contracts.PythonTargetCompletionRequestV2) ([]contracts.CompletionItemV2, error) {
	items, err := service.coordinator.CompletePythonTarget(ctx, request.ProjectID, request.Code, coordinator.UTF16Range{Start: request.ProtectedBodyRange.Start, End: request.ProtectedBodyRange.End}, request.CursorOffsetUTF16)
	return completionItemsV2(items), err
}

func mappedSnapshot(snapshot coordinator.Snapshot, err error) (contracts.ProjectSnapshotV2, error) {
	if err != nil {
		return contracts.ProjectSnapshotV2{}, err
	}
	return snapshotV2(snapshot)
}

func snapshotV2(snapshot coordinator.Snapshot) (contracts.ProjectSnapshotV2, error) {
	callables := make([]contracts.CallableV2, 0, len(snapshot.State.Callables))
	for _, callable := range snapshot.State.Callables {
		parameters := make([]contracts.ParameterV2, 0, len(callable.Parameters))
		for _, parameter := range callable.Parameters {
			parameters = append(parameters, contracts.ParameterV2{
				ID:                 parameter.ID,
				Name:               parameter.Name,
				NameEditable:       parameter.NameEditable,
				PassingStyle:       contracts.ParameterPassingStyleV2(parameter.PassingStyle),
				TypeAnnotation:     cloneString(parameter.TypeAnnotation),
				Default:            cloneString(parameter.Default),
				ProviderOrdinal:    cloneInt(parameter.ProviderOrdinal),
				AuthoredExpression: parameter.AuthoredExpression,
			})
		}
		callables = append(callables, contracts.CallableV2{ID: callable.ID, Name: callable.Name, AuthoredExpression: callable.AuthoredExpression, Parameters: parameters})
	}
	ranges := make(map[string]contracts.ByteRangeV2, len(snapshot.Rendered.SourceRangesByTargetID))
	for targetID, sourceRange := range snapshot.Rendered.SourceRangesByTargetID {
		ranges[targetID] = byteRangeV2(sourceRange)
	}
	diagnostics := make([]contracts.DiagnosticV2, 0, len(snapshot.Diagnostics))
	for index, diagnostic := range snapshot.Diagnostics {
		diagnostics = append(diagnostics, contracts.DiagnosticV2{
			ID:       fmt.Sprintf("diagnostic:%d:%d", snapshot.State.Project.Revision, index),
			Severity: diagnosticSeverityV2(diagnostic.Severity),
			Message:  diagnostic.Message,
			Start:    diagnostic.Start,
			End:      diagnostic.End,
			TargetID: cloneString(diagnostic.TargetID),
		})
	}
	result := contracts.ProjectSnapshotV2{
		Version:               contracts.ProjectSnapshotVersionV2,
		Project:               contracts.ProjectV2{ID: snapshot.State.Project.ID, Name: snapshot.State.Project.Name, Revision: snapshot.State.Project.Revision},
		PythonTarget:          contracts.PythonTargetV2{Prefix: snapshot.State.PythonTarget.Prefix, Suffix: snapshot.State.PythonTarget.Suffix},
		Callables:             callables,
		ParameterDictionaries: parameterDictionariesV2(snapshot.State.ParameterDictionaries),
		Lists:                 listsV2(snapshot.State.Lists),
		TopLevelSectionIDs:    cloneSectionIDs(snapshot.State.TopLevelSectionIDs),
		GeneratedCode: contracts.GeneratedCodeV2{
			Code:                   snapshot.Rendered.Code,
			Body:                   snapshot.Rendered.Body,
			GeneratedBodyRange:     byteRangeV2(snapshot.Rendered.GeneratedBodyRange),
			SourceRangesByTargetID: ranges,
		},
		Diagnostics: diagnostics,
		ProviderStatus: contracts.ProviderStatusV2{
			Provider: contracts.ProviderV2(snapshot.ProviderStatus.Provider),
			Status:   contracts.ProviderAvailabilityV2(snapshot.ProviderStatus.Availability),
			State:    contracts.ProviderLifecycleStateV2(snapshot.ProviderStatus.State),
		},
	}
	if err := result.Validate(); err != nil {
		return contracts.ProjectSnapshotV2{}, err
	}
	return result, nil
}

func completionItemsV2(items []coordinator.CompletionItem) []contracts.CompletionItemV2 {
	result := make([]contracts.CompletionItemV2, 0, len(items))
	for _, item := range items {
		result = append(result, contracts.CompletionItemV2{Label: item.Label, InsertText: item.InsertText})
	}
	return result
}

func byteRangeV2(value renderer.ByteRange) contracts.ByteRangeV2 {
	return contracts.ByteRangeV2{Start: value.Start, End: value.End}
}

func diagnosticSeverityV2(value coordinator.ProviderDiagnosticSeverity) contracts.DiagnosticSeverityV2 {
	switch value {
	case coordinator.ProviderDiagnosticError:
		return contracts.DiagnosticSeverityErrorV2
	case coordinator.ProviderDiagnosticWarning:
		return contracts.DiagnosticSeverityWarningV2
	default:
		return contracts.DiagnosticSeverityInformationV2
	}
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
