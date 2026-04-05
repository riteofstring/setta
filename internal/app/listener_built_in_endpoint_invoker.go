package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"setta/internal/deployments"
	"setta/internal/listenerendpoints"
	"setta/internal/projectstate"
	"setta/internal/scriptablechat"
	"setta/internal/wsapi"
)

type listenerBuiltInEndpointInvoker struct {
	scriptableChat     *scriptablechat.Service
	projectRuntime     *projectstate.Runtime
	deploymentRuntime  *deployments.Runtime
	chatSectionChatIDs listenerChatSectionChatIDService
	explicitHandlers   map[string]listenerBuiltInEndpointHandler
}

type listenerChatSectionChatIDService interface {
	GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error)
}

type listenerBuiltInEndpointHandler func(
	context.Context,
	wsapi.ConnectionInfo,
	map[string]any,
) (any, error)

func newListenerBuiltInEndpointInvoker(
	scriptableChat *scriptablechat.Service,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	chatSectionChatIDs listenerChatSectionChatIDService,
) (*listenerBuiltInEndpointInvoker, error) {
	invoker := &listenerBuiltInEndpointInvoker{
		scriptableChat:     scriptableChat,
		projectRuntime:     projectRuntime,
		deploymentRuntime:  deploymentRuntime,
		chatSectionChatIDs: chatSectionChatIDs,
	}
	invoker.explicitHandlers = map[string]listenerBuiltInEndpointHandler{
		listenerendpoints.EndpointCreateChat:           invoker.handleCreateChat,
		listenerendpoints.EndpointGetChat:              invoker.handleGetChat,
		listenerendpoints.EndpointAppendChatMessages:   invoker.handleAppendChatMessages,
		listenerendpoints.EndpointSetChatSystemPrompt:  invoker.handleSetChatSystemPrompt,
		listenerendpoints.EndpointGetAllChatMetadata:   invoker.handleGetAllChatMetadata,
		listenerendpoints.EndpointGetChatSectionChatID: invoker.handleGetChatSectionChatID,
		listenerendpoints.EndpointSetChatSectionChatID: invoker.handleSetChatSectionChatID,
		listenerendpoints.EndpointSetChatSectionState:  invoker.handleSetChatSectionState,
		listenerendpoints.EndpointDeleteChat:           invoker.handleDeleteChat,
		listenerendpoints.EndpointEmitChatStreamDelta:  invoker.handleEmitChatStreamDelta,
		listenerendpoints.EndpointRunMCPTools:          invoker.handleRunMCPTools,
	}
	return invoker, nil
}

func (i *listenerBuiltInEndpointInvoker) SetHandler(http.Handler) {}

func (i *listenerBuiltInEndpointInvoker) InvokeBuiltInListenerEndpoint(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if i == nil {
		return nil, false, nil
	}
	if result, handled, err := i.invokeExplicitBuiltInEndpoint(ctx, info, endpointName, payload); handled || err != nil {
		return result, handled, err
	}
	return nil, false, nil
}

func (i *listenerBuiltInEndpointInvoker) invokeExplicitBuiltInEndpoint(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	endpointName string,
	payload map[string]any,
) (any, bool, error) {
	if i == nil {
		return nil, false, nil
	}
	handler, ok := i.explicitHandlers[strings.TrimSpace(endpointName)]
	if !ok {
		return nil, false, nil
	}
	result, err := handler(ctx, info, payload)
	return result, true, err
}

func (i *listenerBuiltInEndpointInvoker) handleCreateChat(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.CreateChatRequest) (any, error) {
			return service.CreateChat(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleGetChat(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.GetChatRequest) (any, error) {
			return service.GetChat(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleAppendChatMessages(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.AppendMessagesRequest) (any, error) {
			return service.AppendMessages(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleSetChatSystemPrompt(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.SetSystemPromptRequest) (any, error) {
			return service.SetSystemPrompt(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleGetAllChatMetadata(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.GetAllMetadataRequest) (any, error) {
			return service.GetAllMetadata(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleGetChatSectionChatID(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerGetChatSectionChatIDRequestPayload](payload)
	if err != nil {
		return nil, err
	}
	if err := info.Modes.Policy.RequireIDE(); err != nil {
		return nil, err
	}
	projectID, sectionID, err := listenerProjectSectionScope(request.ProjectConfigID, request.SectionID)
	if err != nil {
		return nil, err
	}
	if i.chatSectionChatIDs == nil {
		return nil, fmt.Errorf("Internal Server Error")
	}
	chatID, err := i.chatSectionChatIDs.GetChatID(ctx, projectID, sectionID)
	if err != nil {
		return nil, listenerChatSectionMutationError(err)
	}
	if chatID == nil {
		return nil, nil
	}
	return *chatID, nil
}

func (i *listenerBuiltInEndpointInvoker) handleSetChatSectionChatID(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerSetChatSectionChatIDRequestPayload](payload)
	if err != nil {
		return nil, err
	}
	if err := ensureListenerProjectLLMMutationsAllowed(info, i.deploymentRuntime); err != nil {
		return nil, err
	}
	projectID, sectionID, err := listenerProjectSectionScope(request.ProjectConfigID, request.SectionID)
	if err != nil {
		return nil, err
	}
	runtime, err := i.projectRuntimeForInfo(info)
	if err != nil {
		return nil, err
	}
	if _, err := runtime.SetChatSectionChatID(ctx, projectID, sectionID, request.ChatID); err != nil {
		return nil, listenerChatSectionMutationError(err)
	}
	return nil, nil
}

func (i *listenerBuiltInEndpointInvoker) handleSetChatSectionState(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerSetChatSectionStateRequestPayload](payload)
	if err != nil {
		return nil, err
	}
	if err := ensureListenerProjectLayoutMutationsAllowed(info, i.deploymentRuntime); err != nil {
		return nil, err
	}
	projectID, sectionID, err := listenerProjectSectionScope(request.ProjectConfigID, request.SectionID)
	if err != nil {
		return nil, err
	}
	runtime, err := i.projectRuntimeForInfo(info)
	if err != nil {
		return nil, err
	}
	if _, err := runtime.SetChatSectionState(ctx, projectID, sectionID, request.State); err != nil {
		return nil, listenerChatSectionMutationError(err)
	}
	return nil, nil
}

func (i *listenerBuiltInEndpointInvoker) handleDeleteChat(
	_ context.Context,
	_ wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		i.scriptableChat,
		func(service *scriptablechat.Service, request scriptablechat.DeleteChatRequest) (any, error) {
			return nil, service.DeleteChat(request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleEmitChatStreamDelta(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatContextPayload(
		ctx,
		payload,
		i.scriptableChat,
		func(request *scriptablechat.EmitStreamDeltaRequest) {
			request.ShareSessionID = info.Modes.ShareSessionID
		},
		func(ctx context.Context, service *scriptablechat.Service, request scriptablechat.EmitStreamDeltaRequest) (any, error) {
			return nil, service.EmitStreamDelta(ctx, request)
		},
	)
}

func (i *listenerBuiltInEndpointInvoker) handleRunMCPTools(
	ctx context.Context,
	info wsapi.ConnectionInfo,
	payload map[string]any,
) (any, error) {
	return invokeListenerScriptableChatContextPayload(
		ctx,
		payload,
		i.scriptableChat,
		func(request *scriptablechat.RunToolsRequest) {
			request.ShareSessionID = info.Modes.ShareSessionID
		},
		func(ctx context.Context, service *scriptablechat.Service, request scriptablechat.RunToolsRequest) (any, error) {
			return service.RunTools(ctx, request)
		},
	)
}

func decodeListenerBuiltInPayload[T any](payload map[string]any) (T, error) {
	var decoded T
	body, err := json.Marshal(payload)
	if err != nil {
		return decoded, fmt.Errorf("marshal built-in listener payload: %w", err)
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return decoded, fmt.Errorf("decode built-in listener payload: %w", err)
	}
	return decoded, nil
}

func invokeListenerScriptableChatPayload[T any](
	payload map[string]any,
	service *scriptablechat.Service,
	handler func(*scriptablechat.Service, T) (any, error),
) (any, error) {
	if service == nil {
		return nil, fmt.Errorf("Internal Server Error")
	}
	request, err := decodeListenerBuiltInPayload[T](payload)
	if err != nil {
		return nil, err
	}
	return handler(service, request)
}

func invokeListenerScriptableChatContextPayload[T any](
	ctx context.Context,
	payload map[string]any,
	service *scriptablechat.Service,
	prepare func(*T),
	handler func(context.Context, *scriptablechat.Service, T) (any, error),
) (any, error) {
	return invokeListenerScriptableChatPayload(
		payload,
		service,
		func(service *scriptablechat.Service, request T) (any, error) {
			if prepare != nil {
				prepare(&request)
			}
			return handler(ctx, service, request)
		},
	)
}

func requiredListenerProjectID(projectID *string) (string, error) {
	if projectID == nil {
		return "", fmt.Errorf("Project config id is required.")
	}
	trimmedProjectID := strings.TrimSpace(*projectID)
	if trimmedProjectID == "" {
		return "", fmt.Errorf("Project config id is required.")
	}
	return trimmedProjectID, nil
}

func listenerProjectSectionScope(projectID *string, sectionID string) (string, string, error) {
	resolvedProjectID, err := requiredListenerProjectID(projectID)
	if err != nil {
		return "", "", err
	}
	trimmedSectionID := strings.TrimSpace(sectionID)
	if trimmedSectionID == "" {
		return "", "", fmt.Errorf("Section id is required.")
	}
	return resolvedProjectID, trimmedSectionID, nil
}

func (i *listenerBuiltInEndpointInvoker) projectRuntimeForInfo(info wsapi.ConnectionInfo) (*projectstate.Runtime, error) {
	if info.Modes.Policy.IsDeployment() {
		if i.deploymentRuntime == nil {
			return nil, fmt.Errorf("deployment runtime is required in deployment mode")
		}
		return i.deploymentRuntime.Overlay(info.Modes.ShareSessionID)
	}
	if i.projectRuntime == nil {
		return nil, fmt.Errorf("project runtime is required")
	}
	return i.projectRuntime, nil
}

func ensureListenerProjectLayoutMutationsAllowed(
	info wsapi.ConnectionInfo,
	deploymentRuntime *deployments.Runtime,
) error {
	if !info.Modes.Policy.IsDeployment() {
		return nil
	}
	if deploymentRuntime == nil {
		return fmt.Errorf("Internal Server Error")
	}
	if deploymentRuntime.Policy().AllowLayoutChanges {
		return nil
	}
	return fmt.Errorf("Deployment policy disallows layout changes.")
}

func ensureListenerProjectLLMMutationsAllowed(
	info wsapi.ConnectionInfo,
	deploymentRuntime *deployments.Runtime,
) error {
	if !info.Modes.Policy.IsDeployment() {
		return nil
	}
	if deploymentRuntime == nil {
		return fmt.Errorf("Internal Server Error")
	}
	if deploymentRuntime.Policy().AllowLLM {
		return nil
	}
	return fmt.Errorf("Deployment policy disallows LLM access.")
}

func listenerChatSectionMutationError(err error) error {
	switch {
	case errors.Is(err, projectstate.ErrChatSectionRequired):
		return fmt.Errorf("Section must resolve to a chat section.")
	case errors.Is(err, projectstate.ErrChatPermissionModeInvalid),
		errors.Is(err, projectstate.ErrChatDictationModeInvalid):
		return fmt.Errorf("%s", err)
	default:
		return listenerProjectLayoutMutationError(err)
	}
}

func listenerProjectLayoutMutationError(err error) error {
	switch {
	case errors.Is(err, projectstate.ErrProjectIDRequired):
		return fmt.Errorf("Project config id is required.")
	case errors.Is(err, projectstate.ErrSectionIDRequired):
		return fmt.Errorf("Section id is required.")
	case errors.Is(err, projectstate.ErrProjectNotFound):
		return fmt.Errorf("Project config not found.")
	case errors.Is(err, projectstate.ErrSectionNotFound):
		return fmt.Errorf("Section not found.")
	case errors.Is(err, projectstate.ErrGroupSectionRequired):
		return fmt.Errorf("Section must resolve to a group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionParentRequired):
		return fmt.Errorf("Section must resolve to a list root or group section.")
	case errors.Is(err, projectstate.ErrDefaultChildSectionTypeInvalid),
		errors.Is(err, projectstate.ErrListRootViewModeInvalid),
		errors.Is(err, projectstate.ErrSectionParamFilterUnsupported),
		errors.Is(err, projectstate.ErrSectionParamColumnWidthUnsupported):
		return fmt.Errorf("%s", err)
	case errors.Is(err, projectstate.ErrListRootSectionRequired):
		return fmt.Errorf("Section must resolve to a list root section.")
	case errors.Is(err, projectstate.ErrMetaControlSectionRequired):
		return fmt.Errorf("Section must resolve to a meta control section.")
	default:
		return fmt.Errorf("Internal Server Error")
	}
}
