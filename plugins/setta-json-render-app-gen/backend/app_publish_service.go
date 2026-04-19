package settajsonrenderappgenbackend

import (
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func NewAppPublishService(
	options deployments.AppPublisherOptions,
	service projectstate.AppDefinitionRuntime,
) (deployments.AppPublishService, error) {
	options.ContentService = NewAppDeploymentPublishContent(service)
	return deployments.NewAppPublisher(options)
}
