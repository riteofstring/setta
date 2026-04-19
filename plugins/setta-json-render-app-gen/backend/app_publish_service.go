package settajsonrenderappgenbackend

import (
	"setta/internal/deployments"
	"setta/internal/projectstate"
)

func NewAppPublishService(
	options deployments.AppPublisherOptions,
	service projectstate.AppDefinitionRuntime,
) (deployments.AppPublishService, error) {
	options.AppDefinitionService = service
	return deployments.NewAppPublisher(options)
}
