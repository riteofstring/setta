package deployments

import "context"

type SharePublishService interface {
	Publish(context.Context, SharePublishRequest) (SharePublishResult, error)
}

type AppPublishService interface {
	Publish(context.Context, AppPublishRequest) (AppPublishResult, error)
}
