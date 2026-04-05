package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/httpapi"
	"setta/internal/projectstate"
	"setta/internal/realtime"
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
