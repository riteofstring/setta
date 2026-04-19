package settajsonrenderappgenbackend

import "setta/internal/deployments"

func NewAppPublishService(
	options deployments.AppPublisherOptions,
) (deployments.AppPublishService, error) {
	return deployments.NewAppPublisher(options)
}
