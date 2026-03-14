package plugins

import (
	"context"
	"errors"
	"testing"

	"setta/internal/projectstate"
)

// The concrete plugin validator should delegate non-Python targets through the worker-spec resolver.
func TestProjectCodegenTargetValidatorDelegatesToWorkerSpecResolver(t *testing.T) {
	t.Parallel()

	resolvedTarget := ""
	validator, err := NewProjectCodegenTargetValidator(projectCodegenTargetWorkerSpecResolverFunc(func(_ context.Context, targetID string) (BackendWorkerSpec, error) {
		resolvedTarget = targetID
		return BackendWorkerSpec{}, nil
	}))
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}

	err = validator.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: "setta-fixture-backend-codegen:typescript",
	})
	if err != nil {
		t.Fatalf("validate target: %v", err)
	}
	if resolvedTarget != "setta-fixture-backend-codegen:typescript" {
		t.Fatalf("expected resolver target setta-fixture-backend-codegen:typescript, got %q", resolvedTarget)
	}
}

// Python targets should bypass plugin resolver validation entirely.
func TestProjectCodegenTargetValidatorSkipsPythonTargets(t *testing.T) {
	t.Parallel()

	validator, err := NewProjectCodegenTargetValidator(projectCodegenTargetWorkerSpecResolverFunc(func(context.Context, string) (BackendWorkerSpec, error) {
		t.Fatal("resolver should not run for python targets")
		return BackendWorkerSpec{}, nil
	}))
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}

	if err := validator.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: string(projectstate.CodeLanguagePython),
	}); err != nil {
		t.Fatalf("validate python target: %v", err)
	}
}

// Resolver failures should surface directly so callers keep the real plugin-validation error.
func TestProjectCodegenTargetValidatorPropagatesResolverError(t *testing.T) {
	t.Parallel()

	validator, err := NewProjectCodegenTargetValidator(projectCodegenTargetWorkerSpecResolverFunc(func(context.Context, string) (BackendWorkerSpec, error) {
		return BackendWorkerSpec{}, errors.New("missing plugin target")
	}))
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}

	err = validator.ValidateProjectCodegenTarget(context.Background(), projectstate.ProjectCodegenTarget{
		Language: "setta-fixture-backend-codegen:typescript",
	})
	if err == nil || err.Error() != "missing plugin target" {
		t.Fatalf("expected resolver error, got %v", err)
	}
}

type projectCodegenTargetWorkerSpecResolverFunc func(context.Context, string) (BackendWorkerSpec, error)

func (f projectCodegenTargetWorkerSpecResolverFunc) ResolvePluginCodegenWorkerSpec(ctx context.Context, targetID string) (BackendWorkerSpec, error) {
	return f(ctx, targetID)
}
