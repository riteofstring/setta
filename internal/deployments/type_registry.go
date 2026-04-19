package deployments

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrTypeRegistrationInvalid          = errors.New("deployment type registration is invalid")
	ErrTypeRegistrationDuplicate        = errors.New("deployment type registration is duplicated")
	ErrStartupModeRegistrationMissing   = errors.New("deployment startup mode is not registered")
	ErrStartupModeRegistrationDuplicate = errors.New("deployment startup mode registration is duplicated")
	ErrDeploymentTypeUnregistered       = errors.New("deployment type is not registered")
)

type StartupRegistration struct {
	ModeName string
	URLLabel string
}

type RuntimeOpener func(context.Context, RuntimeOptions) (*Runtime, error)

type TypeRegistration struct {
	Type        Type
	Startup     StartupRegistration
	OpenRuntime RuntimeOpener
}

type TypeRegistry struct {
	byType     map[Type]TypeRegistration
	byModeName map[string]TypeRegistration
}

func ShareTypeRegistration() TypeRegistration {
	return TypeRegistration{
		Type: TypeShare,
		Startup: StartupRegistration{
			ModeName: string(TypeShare),
			URLLabel: "Share URL",
		},
		OpenRuntime: Open,
	}
}

func NewTypeRegistry(registrations []TypeRegistration) (*TypeRegistry, error) {
	byType := map[Type]TypeRegistration{}
	byModeName := map[string]TypeRegistration{}

	for _, registration := range registrations {
		normalized, err := normalizeTypeRegistration(registration)
		if err != nil {
			return nil, err
		}
		if _, exists := byType[normalized.Type]; exists {
			return nil, fmt.Errorf("%w: %q", ErrTypeRegistrationDuplicate, normalized.Type)
		}
		if _, exists := byModeName[normalized.Startup.ModeName]; exists {
			return nil, fmt.Errorf("%w: %q", ErrStartupModeRegistrationDuplicate, normalized.Startup.ModeName)
		}
		byType[normalized.Type] = normalized
		byModeName[normalized.Startup.ModeName] = normalized
	}

	return &TypeRegistry{
		byType:     byType,
		byModeName: byModeName,
	}, nil
}

func normalizeTypeRegistration(
	registration TypeRegistration,
) (TypeRegistration, error) {
	deploymentType, err := normalizeDeploymentType(registration.Type)
	if err != nil {
		return TypeRegistration{}, fmt.Errorf("%w: %v", ErrTypeRegistrationInvalid, err)
	}
	registration.Type = deploymentType

	modeName := strings.TrimSpace(registration.Startup.ModeName)
	if modeName == "" {
		return TypeRegistration{}, fmt.Errorf("%w: startup mode name is required", ErrTypeRegistrationInvalid)
	}
	urlLabel := strings.TrimSpace(registration.Startup.URLLabel)
	if urlLabel == "" {
		return TypeRegistration{}, fmt.Errorf("%w: startup url label is required", ErrTypeRegistrationInvalid)
	}
	if registration.OpenRuntime == nil {
		return TypeRegistration{}, fmt.Errorf("%w: runtime opener is required", ErrTypeRegistrationInvalid)
	}

	registration.Startup.ModeName = modeName
	registration.Startup.URLLabel = urlLabel
	return registration, nil
}

func (r *TypeRegistry) RegistrationForType(
	deploymentType Type,
) (TypeRegistration, error) {
	if r == nil {
		return TypeRegistration{}, fmt.Errorf("%w: %q", ErrDeploymentTypeUnregistered, deploymentType)
	}
	registration, ok := r.byType[deploymentType]
	if !ok {
		return TypeRegistration{}, fmt.Errorf("%w: %q", ErrDeploymentTypeUnregistered, deploymentType)
	}
	return registration, nil
}

func (r *TypeRegistry) RegistrationForStartupMode(
	modeName string,
) (TypeRegistration, error) {
	trimmedModeName := strings.TrimSpace(modeName)
	if r == nil {
		return TypeRegistration{}, fmt.Errorf("%w: %q", ErrStartupModeRegistrationMissing, trimmedModeName)
	}
	registration, ok := r.byModeName[trimmedModeName]
	if !ok {
		return TypeRegistration{}, fmt.Errorf("%w: %q", ErrStartupModeRegistrationMissing, trimmedModeName)
	}
	return registration, nil
}

func (r *TypeRegistry) ResolveStartupRegistration(
	modeName string,
	manifest Manifest,
) (TypeRegistration, error) {
	registration, err := r.RegistrationForStartupMode(modeName)
	if err != nil {
		return TypeRegistration{}, err
	}
	if manifest.DeploymentType != registration.Type {
		return TypeRegistration{}, fmt.Errorf(
			"deployment is not a %s deployment: %s/%s",
			registration.Startup.ModeName,
			manifest.DeploymentName,
			manifest.DeploymentVersion,
		)
	}
	return registration, nil
}

func (r *TypeRegistry) OpenRuntimeForType(
	ctx context.Context,
	deploymentType Type,
	options RuntimeOptions,
) (*Runtime, error) {
	registration, err := r.RegistrationForType(deploymentType)
	if err != nil {
		return nil, err
	}
	return registration.OpenRuntime(ctx, options)
}
