package settajsonrenderappgenbackend

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appdefinition"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type appDeploymentContentService struct {
	appDefinitionService projectstate.AppDefinitionRuntime
}

func LoadPublishedAppSpecFromRuntime(
	runtime *deployments.Runtime,
	appDefinition projectstate.RawJSON,
) (any, error) {
	if runtime == nil {
		return nil, deployments.ErrRuntimeRequired
	}
	return appDeploymentContentService{}.LoadPublishedAppSpec(
		runtime.Paths().DeploymentRoot,
		appDefinition,
	)
}

func (s appDeploymentContentService) LoadPublishedAppSpec(
	deploymentRoot string,
	appDefinition projectstate.RawJSON,
) (any, error) {
	storedDefinition, err := appdefinition.DecodeStoredAppDefinition(appDefinition)
	if err != nil {
		return nil, err
	}
	if storedDefinition == nil {
		return nil, nil
	}
	appSpecPath := strings.TrimSpace(storedDefinition.AppSpecPath)
	if appSpecPath == "" {
		return nil, nil
	}
	return appspec.Read(deploymentRoot, appSpecPath)
}

func (s appDeploymentContentService) PreparePublishedAppDefinition(
	ctx context.Context,
	projectRoot string,
	appDefinition projectstate.RawJSON,
) (projectstate.RawJSON, any, string, error) {
	storedDefinition, err := appdefinition.DecodeStoredAppDefinition(appDefinition)
	if err != nil {
		return nil, nil, "", err
	}
	if storedDefinition == nil {
		return nil, nil, "", deployments.ErrAppPublishAppDefinitionMissing
	}
	if s.appDefinitionService == nil {
		return nil, nil, "", deployments.ErrAppPublishContentServiceRequired
	}

	current := storedDefinition.Clone()
	if strings.TrimSpace(current.AppSpecPath) == "" {
		return nil, nil, "", deployments.ErrAppPublishAppSpecPathRequired
	}

	targetAppSpecPath, err := appspec.NormalizePath(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", deployments.ErrAppPublishAppSpecInvalid, err)
	}
	appSpec, err := appspec.Read(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", deployments.ErrAppPublishAppSpecInvalid, err)
	}
	if appSpec == nil {
		return nil, nil, "", deployments.ErrAppPublishAppSpecNotFound
	}

	validationResult, err := s.appDefinitionService.ValidateAppDefinition(ctx, projectstate.ValidateAppDefinitionInput{
		AppSpec: appSpec,
	})
	if err != nil {
		return nil, nil, "", err
	}
	if len(validationResult.Errors) != 0 {
		return nil, nil, "", &deployments.AppPublishValidationError{
			Issues: append([]projectstate.AppDefinitionValidationIssue(nil), validationResult.Errors...),
		}
	}

	current.AppSpecPath = targetAppSpecPath
	encodedDefinition, err := appdefinition.EncodeStoredAppDefinition(&current)
	if err != nil {
		return nil, nil, "", err
	}
	return encodedDefinition, appSpec, targetAppSpecPath, nil
}

func (appDeploymentContentService) WritePublishedAppSpec(
	deploymentRoot string,
	targetAppSpecPath string,
	appSpec any,
) error {
	return appspec.Write(deploymentRoot, targetAppSpecPath, appSpec)
}
