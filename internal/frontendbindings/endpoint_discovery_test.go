package frontendbindings

import (
	"reflect"
	"testing"

	"setta/internal/httpapi"
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
