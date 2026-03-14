package plugins

import (
	"context"
	"errors"
	"strings"

	"setta/internal/projectstate"
)

var ErrProjectCodegenTargetResolverRequired = errors.New("plugins: project codegen target worker spec resolver is required")

type ProjectCodegenTargetWorkerSpecResolver interface {
	ResolvePluginCodegenWorkerSpec(context.Context, string) (BackendWorkerSpec, error)
}

type ProjectCodegenTargetValidator struct {
	resolver ProjectCodegenTargetWorkerSpecResolver
}

func NewProjectCodegenTargetValidator(resolver ProjectCodegenTargetWorkerSpecResolver) (*ProjectCodegenTargetValidator, error) {
	if resolver == nil {
		return nil, ErrProjectCodegenTargetResolverRequired
	}
	return &ProjectCodegenTargetValidator{
		resolver: resolver,
	}, nil
}

func (v *ProjectCodegenTargetValidator) ValidateProjectCodegenTarget(ctx context.Context, target projectstate.ProjectCodegenTarget) error {
	if v == nil || v.resolver == nil {
		return ErrProjectCodegenTargetResolverRequired
	}
	if strings.TrimSpace(target.Language) == string(projectstate.CodeLanguagePython) {
		return nil
	}
	_, err := v.resolver.ResolvePluginCodegenWorkerSpec(ctx, target.Language)
	return err
}
