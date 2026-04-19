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
	appDefinitionService appdefinition.Runtime
	appSpecStore         appspec.Store
}

func LoadPublishedAppSpecFromRuntime(
	runtime *deployments.Runtime,
	appDefinition projectstate.RawJSON,
	pluginID string,
) (any, error) {
	if runtime == nil {
		return nil, deployments.ErrRuntimeRequired
	}
	appSpecStore, err := appspec.ForPlugin(pluginID)
	if err != nil {
		return nil, err
	}
	return appDeploymentContentService{appSpecStore: appSpecStore}.LoadPublishedAppSpec(
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
	return s.appSpecStore.Read(deploymentRoot, appSpecPath)
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

	targetAppSpecPath, err := s.appSpecStore.NormalizePath(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", deployments.ErrAppPublishAppSpecInvalid, err)
	}
	appSpec, err := s.appSpecStore.Read(projectRoot, current.AppSpecPath)
	if err != nil {
		return nil, nil, "", fmt.Errorf("%w: %v", deployments.ErrAppPublishAppSpecInvalid, err)
	}
	if appSpec == nil {
		return nil, nil, "", deployments.ErrAppPublishAppSpecNotFound
	}

	validationResult, err := s.appDefinitionService.ValidateAppDefinition(ctx, appdefinition.ValidateInput{
		AppSpec: appSpec,
	})
	if err != nil {
		return nil, nil, "", err
	}
	if validationErr := appPublishValidationError(validationResult.Errors); validationErr != nil {
		return nil, nil, "", validationErr
	}

	current.AppSpecPath = targetAppSpecPath
	encodedDefinition, err := appdefinition.EncodeStoredAppDefinition(&current)
	if err != nil {
		return nil, nil, "", err
	}
	return encodedDefinition, appSpec, targetAppSpecPath, nil
}

func appPublishValidationError(
	errors []appdefinition.ValidationIssue,
) error {
	if len(errors) == 0 {
		return nil
	}
	issues := make([]deployments.ValidationIssue, 0, len(errors))
	for _, issue := range errors {
		issues = append(issues, deployments.ValidationIssue{
			Message:     issue.Message,
			ElementKey:  issue.ElementKey,
			ElementType: issue.ElementType,
		})
	}
	return &deployments.AppPublishValidationError{
		Issues: issues,
	}
}

func (s appDeploymentContentService) WritePublishedAppSpec(
	deploymentRoot string,
	targetAppSpecPath string,
	appSpec any,
) error {
	return s.appSpecStore.Write(deploymentRoot, targetAppSpecPath, appSpec)
}
