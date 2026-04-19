package settajsonrenderappgenbackend

import (
	"context"
	"fmt"
	"strings"

	"setta/internal/deployments"
	"setta/internal/projectstate"
	"setta/plugins/setta-json-render-app-gen/backend/appspec"
)

type appDeploymentContentService struct {
	appDefinitionService projectstate.AppDefinitionRuntime
}

func NewAppDeploymentRuntimeContent() deployments.AppDeploymentRuntimeContent {
	return appDeploymentContentService{}
}

func NewAppDeploymentPublishContent(
	service projectstate.AppDefinitionRuntime,
) deployments.AppDeploymentPublishContent {
	return appDeploymentContentService{appDefinitionService: service}
}

func (s appDeploymentContentService) LoadPublishedAppSpec(
	deploymentRoot string,
	appDefinition *projectstate.AppDefinition,
) (any, error) {
	if appDefinition == nil {
		return nil, nil
	}
	appSpecPath := strings.TrimSpace(appDefinition.AppSpecPath)
	if appSpecPath == "" {
		return nil, nil
	}
	return appspec.Read(deploymentRoot, appSpecPath)
}

func (s appDeploymentContentService) PreparePublishedAppDefinition(
	ctx context.Context,
	projectRoot string,
	appDefinition *projectstate.AppDefinition,
) (*projectstate.AppDefinition, any, string, error) {
	if appDefinition == nil {
		return nil, nil, "", deployments.ErrAppPublishAppDefinitionMissing
	}
	if s.appDefinitionService == nil {
		return nil, nil, "", deployments.ErrAppPublishContentServiceRequired
	}

	current := appDefinition.Clone()
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
	return &current, appSpec, targetAppSpecPath, nil
}

func (appDeploymentContentService) WritePublishedAppSpec(
	deploymentRoot string,
	targetAppSpecPath string,
	appSpec any,
) error {
	return appspec.Write(deploymentRoot, targetAppSpecPath, appSpec)
}
