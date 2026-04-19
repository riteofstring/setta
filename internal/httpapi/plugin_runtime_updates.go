package httpapi

import (
	"context"

	"setta/internal/plugins"
	"setta/internal/realtime"
)

type pluginRuntimeUpdateService interface {
	Runtime(options plugins.RuntimeOptions) (plugins.PluginRuntimeResponse, error)
}

func broadcastPluginRuntimeUpdate(
	ctx context.Context,
	service pluginRuntimeUpdateService,
	websocketHub *realtime.WebsocketHub,
) error {
	response, err := service.Runtime(plugins.RuntimeOptions{
		AssetURLBuilder: buildPluginAssetURL,
	})
	if err != nil {
		return err
	}
	_, err = websocketHub.BroadcastJSON(
		ctx,
		realtime.NewPluginRuntimeUpdateMessage(response),
		realtime.Selection{Type: realtime.ConnectionTypeFrontend},
	)
	return err
}
