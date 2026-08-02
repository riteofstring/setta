package httpapi

import (
	"context"
	"net/http"
	"testing"

	"setta/internal/conversation"
)

func TestRoleConfigurationEndpointsExposeCatalogAndValidatedScopeUpdates(t *testing.T) {
	service := &recordingRoleConfigurationHTTPService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		RoleConfigurationService: service,
	})

	catalog := getJSON[conversation.RoleModelCatalog](t, handler, "/roles/models", http.StatusOK)
	if err := catalog.Validate(); err != nil {
		t.Fatalf("role model catalog response: %v", err)
	}
	global := getJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/roles/configuration/global",
		http.StatusOK,
	)
	if err := global.Validate(); err != nil {
		t.Fatalf("global role configuration response: %v", err)
	}

	agentProfile := conversation.DefaultAgentRoleProfile()
	updated := postJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/roles/configuration/global/update",
		UpdateGlobalRoleProfilesRequest{Updates: []conversation.RoleProfileUpdate{{
			Role:    conversation.RoleAgent,
			Profile: &agentProfile,
		}}},
		http.StatusOK,
	)
	if err := updated.Validate(); err != nil {
		t.Fatalf("updated global role configuration response: %v", err)
	}
	if len(service.globalUpdates) != 1 || service.globalUpdates[0].Role != conversation.RoleAgent {
		t.Fatalf("global role updates = %+v", service.globalUpdates)
	}

	workspaceRequest := ReadWorkspaceRoleConfigurationRequest{
		WorkspaceID: "workspace-role-http",
	}
	workspaceConfiguration := postJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/workspaces/roles/read",
		workspaceRequest,
		http.StatusOK,
	)
	if err := workspaceConfiguration.Validate(); err != nil {
		t.Fatalf("workspace role configuration response: %v", err)
	}
	if service.workspaceID != workspaceRequest.WorkspaceID {
		t.Fatalf("workspace role read identity = %s", service.workspaceID)
	}

	narratorProfile := conversation.DefaultNarratorRoleProfile()
	postJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/workspaces/roles/update",
		UpdateWorkspaceRoleProfilesRequest{
			WorkspaceID: workspaceRequest.WorkspaceID,
			Updates: []conversation.RoleProfileUpdate{{
				Role:    conversation.RoleNarrator,
				Profile: &narratorProfile,
			}},
		},
		http.StatusOK,
	)
	if len(service.workspaceUpdates) != 1 ||
		service.workspaceUpdates[0].Role != conversation.RoleNarrator {
		t.Fatalf("workspace role updates = %+v", service.workspaceUpdates)
	}

	request := ReadConversationRoleConfigurationRequest{
		WorkspaceID:    "workspace-role-http",
		ConversationID: "conversation-role-http",
	}
	conversationConfiguration := postJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/conversations/roles/read",
		request,
		http.StatusOK,
	)
	if err := conversationConfiguration.Validate(); err != nil {
		t.Fatalf("conversation role configuration response: %v", err)
	}
	if service.workspaceID != request.WorkspaceID || service.conversationID != request.ConversationID {
		t.Fatalf("conversation role read identity = %s/%s", service.workspaceID, service.conversationID)
	}

	postJSON[conversation.RoleConfiguration](
		t,
		handler,
		"/conversations/roles/update",
		UpdateConversationRoleProfilesRequest{
			WorkspaceID:    request.WorkspaceID,
			ConversationID: request.ConversationID,
			Updates: []conversation.RoleProfileUpdate{{
				Role:    conversation.RoleNarrator,
				Profile: &narratorProfile,
			}},
		},
		http.StatusOK,
	)
	if len(service.conversationUpdates) != 1 ||
		service.conversationUpdates[0].Role != conversation.RoleNarrator {
		t.Fatalf("conversation role updates = %+v", service.conversationUpdates)
	}
}

func TestRoleConfigurationEndpointsRejectInvalidIdentityAndUnavailableService(t *testing.T) {
	service := &recordingRoleConfigurationHTTPService{}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:                 BackendMetadata{Name: BackendName, Version: "test"},
		RoleConfigurationService: service,
	})
	errorResponse := postJSON[ErrorResponse](
		t,
		handler,
		"/conversations/roles/read",
		ReadConversationRoleConfigurationRequest{
			WorkspaceID:    " workspace-role-http",
			ConversationID: "conversation-role-http",
		},
		http.StatusBadRequest,
	)
	if errorResponse.Error.Code != "invalid_conversation_role_configuration_request" {
		t.Fatalf("invalid identity error = %+v", errorResponse.Error)
	}
	errorResponse = postJSON[ErrorResponse](
		t,
		handler,
		"/workspaces/roles/read",
		ReadWorkspaceRoleConfigurationRequest{WorkspaceID: " workspace-role-http"},
		http.StatusBadRequest,
	)
	if errorResponse.Error.Code != "invalid_workspace_role_configuration_request" {
		t.Fatalf("invalid workspace identity error = %+v", errorResponse.Error)
	}

	unavailable := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata: BackendMetadata{Name: BackendName, Version: "test"},
	})
	errorResponse = getJSON[ErrorResponse](
		t,
		unavailable,
		"/roles/configuration/global",
		http.StatusServiceUnavailable,
	)
	if errorResponse.Error.Code != "role_configuration_service_unavailable" {
		t.Fatalf("unavailable role service error = %+v", errorResponse.Error)
	}
}

type recordingRoleConfigurationHTTPService struct {
	workspaceID         string
	conversationID      string
	globalUpdates       []conversation.RoleProfileUpdate
	workspaceUpdates    []conversation.RoleProfileUpdate
	conversationUpdates []conversation.RoleProfileUpdate
}

func (service *recordingRoleConfigurationHTTPService) ReadModelCatalog(
	context.Context,
) (conversation.RoleModelCatalog, error) {
	return validHTTPRoleModelCatalog(), nil
}

func (service *recordingRoleConfigurationHTTPService) ReadGlobalConfiguration(
	context.Context,
) (conversation.RoleConfiguration, error) {
	return validHTTPRoleConfiguration(conversation.RoleProfileScopeGlobal, "", ""), nil
}

func (service *recordingRoleConfigurationHTTPService) ReadWorkspaceConfiguration(
	_ context.Context,
	workspaceID string,
) (conversation.RoleConfiguration, error) {
	service.workspaceID = workspaceID
	return validHTTPRoleConfiguration(
		conversation.RoleProfileScopeWorkspace,
		workspaceID,
		"",
	), nil
}

func (service *recordingRoleConfigurationHTTPService) ReadConversationConfiguration(
	_ context.Context,
	workspaceID string,
	conversationID string,
) (conversation.RoleConfiguration, error) {
	service.workspaceID = workspaceID
	service.conversationID = conversationID
	return validHTTPRoleConfiguration(
		conversation.RoleProfileScopeConversation,
		workspaceID,
		conversationID,
	), nil
}

func (service *recordingRoleConfigurationHTTPService) UpdateGlobalConfiguration(
	_ context.Context,
	updates []conversation.RoleProfileUpdate,
) (conversation.RoleConfiguration, error) {
	service.globalUpdates = updates
	return validHTTPRoleConfiguration(conversation.RoleProfileScopeGlobal, "", ""), nil
}

func (service *recordingRoleConfigurationHTTPService) UpdateWorkspaceConfiguration(
	_ context.Context,
	workspaceID string,
	updates []conversation.RoleProfileUpdate,
) (conversation.RoleConfiguration, error) {
	service.workspaceID = workspaceID
	service.workspaceUpdates = updates
	return validHTTPRoleConfiguration(
		conversation.RoleProfileScopeWorkspace,
		workspaceID,
		"",
	), nil
}

func (service *recordingRoleConfigurationHTTPService) UpdateConversationConfiguration(
	_ context.Context,
	workspaceID string,
	conversationID string,
	updates []conversation.RoleProfileUpdate,
) (conversation.RoleConfiguration, error) {
	service.workspaceID = workspaceID
	service.conversationID = conversationID
	service.conversationUpdates = updates
	return validHTTPRoleConfiguration(
		conversation.RoleProfileScopeConversation,
		workspaceID,
		conversationID,
	), nil
}

func validHTTPRoleConfiguration(
	scopeKind conversation.RoleProfileScopeKind,
	workspaceID string,
	conversationID string,
) conversation.RoleConfiguration {
	scope := conversation.RoleConfigurationScope{Kind: scopeKind}
	roles := []conversation.Role{
		conversation.RoleAgent,
		conversation.RoleNarrator,
		conversation.RoleDirector,
		conversation.RoleSideAgent,
	}
	switch scopeKind {
	case conversation.RoleProfileScopeWorkspace:
		scope.WorkspaceID = &workspaceID
		roles = []conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleSideAgent,
		}
	case conversation.RoleProfileScopeConversation:
		scope.WorkspaceID = &workspaceID
		scope.ConversationID = &conversationID
		roles = []conversation.Role{
			conversation.RoleAgent,
			conversation.RoleNarrator,
			conversation.RoleSideAgent,
		}
	}
	profiles := make([]conversation.RoleProfileConfiguration, 0, len(roles))
	for _, role := range roles {
		profile := defaultHTTPRoleProfile(role)
		profiles = append(profiles, conversation.RoleProfileConfiguration{
			Role:            role,
			BuiltIn:         profile,
			Effective:       profile,
			EffectiveSource: conversation.RoleProfileSourceBuiltIn,
			Resolved: conversation.ResolvedRoleProfileSelection{
				ModelID:         *profile.ModelSelection.ModelID,
				ReasoningEffort: profile.ReasoningEffort,
			},
		})
	}
	return conversation.RoleConfiguration{
		SchemaVersion: conversation.RoleConfigurationSchemaVersion,
		Scope:         scope,
		Profiles:      profiles,
		ModelCatalog:  validHTTPRoleModelCatalog(),
	}
}

func validHTTPRoleModelCatalog() conversation.RoleModelCatalog {
	return conversation.RoleModelCatalog{
		Provider:       conversation.ProviderCodex,
		DefaultModelID: "gpt-5.6-sol",
		Models: []conversation.RoleModelOption{
			httpRoleModel("gpt-5.6-sol", conversation.ReasoningEffortHigh, true),
			httpRoleModel("gpt-5.6-terra", conversation.ReasoningEffortMedium, false),
			httpRoleModel("gpt-5.6-luna", conversation.ReasoningEffortMedium, false),
			httpRoleModel("gpt-5.4-mini", conversation.ReasoningEffortHigh, false),
		},
	}
}

func httpRoleModel(
	modelID string,
	effort conversation.ReasoningEffort,
	isDefault bool,
) conversation.RoleModelOption {
	return conversation.RoleModelOption{
		Provider:                  conversation.ProviderCodex,
		ModelID:                   modelID,
		DisplayName:               modelID,
		Description:               modelID + " HTTP test model",
		DefaultReasoningEffort:    effort,
		SupportedReasoningEfforts: []conversation.ReasoningEffort{effort},
		ServiceTiers:              []string{},
		IsDefault:                 isDefault,
	}
}

func defaultHTTPRoleProfile(role conversation.Role) conversation.RoleProfile {
	switch role {
	case conversation.RoleAgent:
		return conversation.DefaultAgentRoleProfile()
	case conversation.RoleNarrator:
		return conversation.DefaultNarratorRoleProfile()
	case conversation.RoleDirector:
		return conversation.DefaultDirectorRoleProfile()
	case conversation.RoleSideAgent:
		return conversation.DefaultSideAgentRoleProfile()
	default:
		panic("unsupported HTTP role profile")
	}
}
