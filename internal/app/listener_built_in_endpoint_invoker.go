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
}

type listenerChatSectionChatIDService interface {
	GetChatID(ctx context.Context, projectID string, sectionID string) (*string, error)
}

func newListenerBuiltInEndpointInvoker(
	scriptableChat *scriptablechat.Service,
	projectRuntime *projectstate.Runtime,
	deploymentRuntime *deployments.Runtime,
	chatSectionChatIDs listenerChatSectionChatIDService,
) (*listenerBuiltInEndpointInvoker, error) {
	return &listenerBuiltInEndpointInvoker{
		scriptableChat:     scriptableChat,
		projectRuntime:     projectRuntime,
		deploymentRuntime:  deploymentRuntime,
		chatSectionChatIDs: chatSectionChatIDs,
	}, nil
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

	switch strings.TrimSpace(endpointName) {
	case listenerendpoints.EndpointCreateChat:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.CreateChatRequest](payload)
		if err != nil {
			return nil, true, err
		}
		result, err := i.scriptableChat.CreateChat(request)
		return result, true, err
	case listenerendpoints.EndpointGetChat:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.GetChatRequest](payload)
		if err != nil {
			return nil, true, err
		}
		result, err := i.scriptableChat.GetChat(request)
		return result, true, err
	case listenerendpoints.EndpointAppendChatMessages:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.AppendMessagesRequest](payload)
		if err != nil {
			return nil, true, err
		}
		result, err := i.scriptableChat.AppendMessages(request)
		return result, true, err
	case listenerendpoints.EndpointSetChatSystemPrompt:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.SetSystemPromptRequest](payload)
		if err != nil {
			return nil, true, err
		}
		result, err := i.scriptableChat.SetSystemPrompt(request)
		return result, true, err
	case listenerendpoints.EndpointGetAllChatMetadata:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.GetAllMetadataRequest](payload)
		if err != nil {
			return nil, true, err
		}
		result, err := i.scriptableChat.GetAllMetadata(request)
		return result, true, err
	case listenerendpoints.EndpointGetChatSectionChatID:
		request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerGetChatSectionChatIDRequestPayload](payload)
		if err != nil {
			return nil, true, err
		}
		if err := info.Modes.Policy.RequireIDE(); err != nil {
			return nil, true, err
		}
		projectID, err := requiredListenerProjectID(request.ProjectConfigID)
		if err != nil {
			return nil, true, err
		}
		sectionID := strings.TrimSpace(request.SectionID)
		if sectionID == "" {
			return nil, true, fmt.Errorf("Section id is required.")
		}
		if i.chatSectionChatIDs == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		chatID, err := i.chatSectionChatIDs.GetChatID(ctx, projectID, sectionID)
		if err != nil {
			return nil, true, listenerChatSectionMutationError(err)
		}
		if chatID == nil {
			return nil, true, nil
		}
		return *chatID, true, nil
	case listenerendpoints.EndpointSetChatSectionChatID:
		request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerSetChatSectionChatIDRequestPayload](payload)
		if err != nil {
			return nil, true, err
		}
		if err := ensureListenerProjectLLMMutationsAllowed(info, i.deploymentRuntime); err != nil {
			return nil, true, err
		}
		projectID, err := requiredListenerProjectID(request.ProjectConfigID)
		if err != nil {
			return nil, true, err
		}
		sectionID := strings.TrimSpace(request.SectionID)
		if sectionID == "" {
			return nil, true, fmt.Errorf("Section id is required.")
		}
		runtime, err := i.projectRuntimeForInfo(info)
		if err != nil {
			return nil, true, err
		}
		if _, err := runtime.SetChatSectionChatID(ctx, projectID, sectionID, request.ChatID); err != nil {
			return nil, true, listenerChatSectionMutationError(err)
		}
		return nil, true, nil
	case listenerendpoints.EndpointSetChatSectionState:
		request, err := decodeListenerBuiltInPayload[listenerendpoints.ListenerSetChatSectionStateRequestPayload](payload)
		if err != nil {
			return nil, true, err
		}
		if err := ensureListenerProjectLayoutMutationsAllowed(info, i.deploymentRuntime); err != nil {
			return nil, true, err
		}
		projectID, err := requiredListenerProjectID(request.ProjectConfigID)
		if err != nil {
			return nil, true, err
		}
		sectionID := strings.TrimSpace(request.SectionID)
		if sectionID == "" {
			return nil, true, fmt.Errorf("Section id is required.")
		}
		runtime, err := i.projectRuntimeForInfo(info)
		if err != nil {
			return nil, true, err
		}
		if _, err := runtime.SetChatSectionState(ctx, projectID, sectionID, request.State); err != nil {
			return nil, true, listenerChatSectionMutationError(err)
		}
		return nil, true, nil
	case listenerendpoints.EndpointDeleteChat:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.DeleteChatRequest](payload)
		if err != nil {
			return nil, true, err
		}
		return nil, true, i.scriptableChat.DeleteChat(request)
	case listenerendpoints.EndpointEmitChatStreamDelta:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.EmitStreamDeltaRequest](payload)
		if err != nil {
			return nil, true, err
		}
		request.ShareSessionID = info.Modes.ShareSessionID
		return nil, true, i.scriptableChat.EmitStreamDelta(ctx, request)
	case listenerendpoints.EndpointRunMCPTools:
		if i.scriptableChat == nil {
			return nil, true, fmt.Errorf("Internal Server Error")
		}
		request, err := decodeListenerBuiltInPayload[scriptablechat.RunToolsRequest](payload)
		if err != nil {
			return nil, true, err
		}
		request.ShareSessionID = info.Modes.ShareSessionID
		result, err := i.scriptableChat.RunTools(ctx, request)
		return result, true, err
	default:
		return nil, false, nil
	}
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
