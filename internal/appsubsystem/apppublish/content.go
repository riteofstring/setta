package apppublish

import (
	"fmt"
	"strings"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

type deploymentContentService struct {
	appSpecStore appspec.Store
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
	return deploymentContentService{appSpecStore: appSpecStore}.loadPublishedAppSpec(
		runtime.Paths().DeploymentRoot,
		appDefinition,
	)
}

func (s deploymentContentService) loadPublishedAppSpec(
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

func (s deploymentContentService) preparePublishedAppDefinition(
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

	if err := appdefinition.ValidatePersistedAppDefinitionWrite(current, appSpec); err != nil {
		validationErr := appPublishValidationError([]appdefinition.ValidationIssue{{
			Message: err.Error(),
		}})
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

func (s deploymentContentService) writePublishedAppSpec(
	deploymentRoot string,
	targetAppSpecPath string,
	appSpec any,
) error {
	return s.appSpecStore.Write(deploymentRoot, targetAppSpecPath, appSpec)
}
