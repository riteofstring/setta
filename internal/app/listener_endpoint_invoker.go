package app

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/auth"
	"setta/internal/plugins"
	"setta/internal/scriptablechat"
	"setta/internal/wsapi"
)

type pluginListenerEndpointService interface {
	InvokeRegisteredListenerEndpoint(context.Context, plugins.BackendListenerEndpointRequest) (any, bool, error)
}

type listenerEndpointInvoker struct {
	builtIn *listenerBuiltInEndpointInvoker
	plugins pluginListenerEndpointService
}

func newListenerEndpointInvoker(
	authService *auth.Service,
	scriptableChat *scriptablechat.Service,
	pluginRuntime pluginListenerEndpointService,
) (*listenerEndpointInvoker, error) {
	builtIn, err := newListenerBuiltInEndpointInvoker(authService, scriptableChat)
	if err != nil {
		return nil, err
	}
	return &listenerEndpointInvoker{
		builtIn: builtIn,
		plugins: pluginRuntime,
	}, nil
}

func (i *listenerEndpointInvoker) SetHandler(handler http.Handler) {
	if i == nil || i.builtIn == nil {
		return
	}
	i.builtIn.SetHandler(handler)
}

func (i *listenerEndpointInvoker) InvokeBuiltInListenerEndpoint(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if i == nil {
		return nil, false, nil
	}
	if i.builtIn != nil {
		result, handled, err := i.builtIn.InvokeBuiltInListenerEndpoint(ctx, info, endpointName, payload)
		if handled || err != nil {
			return result, handled, err
		}
	}
	if i.plugins == nil {
		return nil, false, nil
	}

	projectConfigID, err := listenerEndpointProjectConfigID(payload)
	if err != nil {
		return nil, true, err
	}
	result, handled, err := i.plugins.InvokeRegisteredListenerEndpoint(ctx, plugins.BackendListenerEndpointRequest{
		Context: plugins.BackendRequestContext{
			ServerMode:      info.Modes.Policy.Mode(),
			HasAuth:         info.HasAuth,
			SessionID:       strings.TrimSpace(info.Auth.SessionID),
			ShareSessionID:  strings.TrimSpace(info.Modes.ShareSessionID),
			ProjectConfigID: projectConfigID,
		},
		EndpointName: strings.TrimSpace(endpointName),
		Payload:      payload,
	})
	return result, handled, err
}

func listenerEndpointProjectConfigID(payload map[string]any) (string, error) {
	rawProjectConfigID, ok := payload["projectConfigId"]
	if !ok {
		return "", fmt.Errorf("listener endpoint payload is missing projectConfigId")
	}
	projectConfigID, ok := rawProjectConfigID.(string)
	if !ok {
		return "", fmt.Errorf("listener endpoint payload projectConfigId must be a string")
	}
	trimmedProjectConfigID := strings.TrimSpace(projectConfigID)
	if trimmedProjectConfigID == "" {
		return "", fmt.Errorf("listener endpoint payload projectConfigId is required")
	}
	return trimmedProjectConfigID, nil
}
