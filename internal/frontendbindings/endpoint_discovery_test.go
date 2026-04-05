package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/appgenskills"
	"setta/internal/filebrowser"
	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/projectview"
	"setta/internal/realtime"
	"setta/internal/settingsstate"
)

func TestDiscoverCurrentEndpointsUsesOwnerizedNotificationListResponse(t *testing.T) {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		t.Fatalf("discover current endpoints: %v", err)
	}

	for _, spec := range specs {
		if spec.FunctionName != "route_get_notifications" {
			continue
		}
		wantResponse := reflect.TypeOf(httpapi.NotificationList(nil))
		if spec.ResponseType != wantResponse {
			t.Fatalf("route_get_notifications response type = %v, want %v", spec.ResponseType, wantResponse)
		}
		return
	}

	t.Fatal("route_get_notifications endpoint not found")
}

func TestDiscoverCurrentEndpointsTracksMultiReturnHandlerResponses(t *testing.T) {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		t.Fatalf("discover current endpoints: %v", err)
	}

	cases := []struct {
		functionName string
		wantResponse reflect.Type
	}{
		{
			functionName: "route_get_ai_follow_snapshot",
			wantResponse: reflect.TypeOf([]realtime.AIFollowToolArgumentsUpdateContent(nil)),
		},
		{
			functionName: "route_create_top_level_section",
			wantResponse: reflect.TypeOf(projectstate.CreateTopLevelSectionResult{}),
		},
		{
			functionName: "route_create_child_sections",
			wantResponse: reflect.TypeOf(projectstate.CreateChildSectionsResult{}),
		},
		{
			functionName: "route_create_child_sections_via_incrementer",
			wantResponse: reflect.TypeOf(projectstate.CreateChildSectionsResult{}),
		},
		{
			functionName: "route_delete_section_variant_or_ask",
			wantResponse: reflect.TypeOf(""),
		},
		{
			functionName: "route_get_external_agent_health",
			wantResponse: reflect.TypeOf(httpapi.ExternalAgentPreflightStatusList(nil)),
		},
	}

	specsByFunction := make(map[string]EndpointSpec, len(specs))
	for _, spec := range specs {
		specsByFunction[spec.FunctionName] = spec
	}

	for _, tc := range cases {
		spec, ok := specsByFunction[tc.functionName]
		if !ok {
			t.Fatalf("%s endpoint not found", tc.functionName)
		}
		if spec.ResponseType != tc.wantResponse {
			t.Fatalf("%s response type = %v, want %v", tc.functionName, spec.ResponseType, tc.wantResponse)
		}
	}
}

func TestDiscoverCurrentEndpointsResolvesServiceInterfaceOwnerResponses(t *testing.T) {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		t.Fatalf("discover current endpoints: %v", err)
	}

	for _, spec := range specs {
		if spec.FunctionName != "route_get_file_browser_root" {
			continue
		}
		wantResponse := reflect.TypeOf(filebrowser.RootResponse{})
		if spec.ResponseType != wantResponse {
			t.Fatalf("route_get_file_browser_root response type = %v, want %v", spec.ResponseType, wantResponse)
		}
		return
	}

	t.Fatal("route_get_file_browser_root endpoint not found")
}

func TestDiscoverCurrentEndpointsIgnoresTransportOnlyRequestTypes(t *testing.T) {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		t.Fatalf("discover current endpoints: %v", err)
	}

	cases := []string{
		"route_get_server_mode",
		"route_sdk_runtime_handshake",
	}

	specsByFunction := make(map[string]EndpointSpec, len(specs))
	for _, spec := range specs {
		specsByFunction[spec.FunctionName] = spec
	}

	for _, functionName := range cases {
		spec, ok := specsByFunction[functionName]
		if !ok {
			t.Fatalf("%s endpoint not found", functionName)
		}
		if spec.RequestType != nil {
			t.Fatalf("%s request type = %v, want nil", functionName, spec.RequestType)
		}
	}
}

func TestDiscoverCurrentEndpointsResolvesFormerOverrideBackedRoutes(t *testing.T) {
	specs, err := discoverCurrentEndpoints()
	if err != nil {
		t.Fatalf("discover current endpoints: %v", err)
	}

	specsByFunction := make(map[string]EndpointSpec, len(specs))
	for _, spec := range specs {
		specsByFunction[spec.FunctionName] = spec
	}

	cases := []struct {
		functionName string
		wantRequest  reflect.Type
		wantResponse reflect.Type
	}{
		{
			functionName: "route_get_app_definition",
			wantRequest:  reflect.TypeOf(httpapi.GetAppDefinitionRequest{}),
			wantResponse: reflect.TypeOf(projectstate.AppDefinitionReadResult{}),
		},
		{
			functionName: "route_get_app_gen_skills",
			wantResponse: reflect.TypeOf(appgenskills.GetSkillsResponse{}),
		},
		{
			functionName: "route_get_chat_section_chat_id",
			wantRequest:  reflect.TypeOf(httpapi.GetChatSectionChatIDRequest{}),
			wantResponse: reflect.TypeOf(""),
		},
		{
			functionName: "route_get_llm_response",
			wantRequest:  reflect.TypeOf(httpapi.GetLLMResponseRequest{}),
			wantResponse: reflect.TypeOf(httpapi.LLMChatIDResponse("")),
		},
		{
			functionName: "route_get_server_mode",
			wantResponse: reflect.TypeOf(httpapi.ServerModeResponse{}),
		},
		{
			functionName: "route_load_project_config",
			wantRequest:  reflect.TypeOf(httpapi.ProjectLoadRequest{}),
			wantResponse: reflect.TypeOf(projectview.SingleConfig{}),
		},
		{
			functionName: "route_get_latest_lsp_diagnostics",
			wantRequest:  reflect.TypeOf(httpapi.GetLatestLSPDiagnosticsRequest{}),
			wantResponse: reflect.TypeOf(projectstate.LSPDiagnosticsPayload{}),
		},
		{
			functionName: "route_load_settings",
			wantResponse: reflect.TypeOf(settingsstate.FrontendSettingsState{}),
		},
		{
			functionName: "route_publish_app_deployment",
			wantRequest:  reflect.TypeOf(httpapi.PublishAppDeploymentRequest{}),
			wantResponse: reflect.TypeOf(httpapi.DeploymentMetadataResponse{}),
		},
		{
			functionName: "route_publish_share_deployment",
			wantRequest:  reflect.TypeOf(httpapi.PublishShareDeploymentRequest{}),
			wantResponse: reflect.TypeOf(httpapi.DeploymentMetadataResponse{}),
		},
		{
			functionName: "route_set_project_config_codegen_targets",
			wantRequest:  reflect.TypeOf(httpapi.SetProjectConfigCodegenTargetsRequest{}),
			wantResponse: reflect.TypeOf(projectview.SingleConfig{}),
		},
		{
			functionName: "route_share_deployment_current_session",
			wantResponse: reflect.TypeOf(httpapi.ShareDeploymentSessionResponse{}),
		},
		{
			functionName: "route_share_deployment_project_config",
			wantRequest:  reflect.TypeOf(httpapi.LoadDeploymentProjectConfigRequest{}),
			wantResponse: reflect.TypeOf(httpapi.ProjectStateSingleConfigWithCompletedOpIDs{}),
		},
		{
			functionName: "route_share_deployment_state",
			wantResponse: reflect.TypeOf(httpapi.ProjectStateSingleConfigWithCompletedOpIDs{}),
		},
	}

	for _, tc := range cases {
		spec, ok := specsByFunction[tc.functionName]
		if !ok {
			t.Fatalf("%s endpoint not found", tc.functionName)
		}
		if spec.RequestType != tc.wantRequest {
			t.Fatalf("%s request type = %v, want %v", tc.functionName, spec.RequestType, tc.wantRequest)
		}
		if spec.ResponseType != tc.wantResponse {
			t.Fatalf("%s response type = %v, want %v", tc.functionName, spec.ResponseType, tc.wantResponse)
		}
	}
}
