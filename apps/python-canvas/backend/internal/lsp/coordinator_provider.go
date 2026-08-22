package lsp

import (
	"context"
	"fmt"

	"github.com/setta/python-canvas/backend/internal/project"
	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/coordinator"
)

// CoordinatorProvider adapts the one pinned Basedpyright session to the new
// private coordinator port. It converts LSP protocol data once at this
// boundary; neither the aggregate nor renderer sees protocol objects.
type CoordinatorProvider struct {
	provider *BasedpyrightProvider
}

// NewCoordinatorProvider binds one existing pinned Basedpyright provider to a
// coordinator. The V1 Store continues to use the same underlying provider
// directly until the later atomic public cutover.
func NewCoordinatorProvider(provider *BasedpyrightProvider) *CoordinatorProvider {
	return &CoordinatorProvider{provider: provider}
}

// ResolveCallableSignature returns the full normalized provider signature,
// including zero parameters and every supported passing style.
func (adapter *CoordinatorProvider) ResolveCallableSignature(
	ctx context.Context,
	request coordinator.SignatureRequest,
) ([]aggregate.ProviderParameter, error) {
	if adapter == nil || adapter.provider == nil {
		return nil, ErrProviderClosed
	}
	signature, err := adapter.provider.ResolveCallableSignature(ctx, project.SignatureRequest{
		ProjectID:          request.ProjectID,
		SectionID:          request.CallableID,
		CallableExpression: request.AuthoredExpression,
		Code:               request.Code,
		CallOffset:         request.CallOffset,
	})
	if err != nil {
		return nil, err
	}
	parameters := make([]aggregate.ProviderParameter, 0, len(signature.Parameters))
	for _, parameter := range signature.Parameters {
		parameters = append(parameters, aggregate.ProviderParameter{
			Name:           parameter.Name,
			PassingStyle:   aggregate.PassingStyle(parameter.PassingStyle),
			TypeAnnotation: parameter.TypeAnnotation,
			Default:        copyString(parameter.Default),
		})
	}
	return parameters, nil
}

// SynchronizeGeneratedDocument publishes the exact installed materialization
// and converts provider diagnostics/status to coordinator-owned values.
func (adapter *CoordinatorProvider) SynchronizeGeneratedDocument(
	ctx context.Context,
	request coordinator.GeneratedDocumentRequest,
) (coordinator.GeneratedDocumentResult, error) {
	if adapter == nil || adapter.provider == nil {
		return coordinator.GeneratedDocumentResult{}, ErrProviderClosed
	}
	result, err := adapter.provider.SynchronizeGeneratedDocument(ctx, project.GeneratedDocumentRequest{
		Path:     request.Path,
		Revision: request.Revision,
		Code:     request.Code,
	})
	if err != nil {
		return coordinator.GeneratedDocumentResult{}, err
	}
	status := coordinator.ProviderStatus{
		Provider:     string(result.ProviderStatus.Provider),
		Availability: coordinator.ProviderAvailability(result.ProviderStatus.Status),
		State:        coordinator.ProviderLifecycleState(result.ProviderStatus.State),
	}
	if err := status.Validate(); err != nil {
		return coordinator.GeneratedDocumentResult{}, fmt.Errorf("normalize provider status: %w", err)
	}
	diagnostics := make([]coordinator.ProviderDiagnostic, 0, len(result.Diagnostics))
	for _, diagnostic := range result.Diagnostics {
		diagnostics = append(diagnostics, coordinator.ProviderDiagnostic{
			Start:    diagnostic.Start,
			End:      diagnostic.End,
			Severity: coordinator.ProviderDiagnosticSeverity(diagnostic.Severity),
			Message:  diagnostic.Message,
			Code:     diagnostic.Code,
		})
	}
	return coordinator.GeneratedDocumentResult{
		Diagnostics:    diagnostics,
		ProviderStatus: status,
	}, nil
}

// Close releases the single underlying language-server session.
func (adapter *CoordinatorProvider) Close() error {
	if adapter == nil || adapter.provider == nil {
		return nil
	}
	return adapter.provider.Close()
}
