package httpapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/notify"
	"setta/internal/runtimeauth"
)

type fakeNotifyService struct {
	publicKey           string
	removedDeviceIDs    []string
	subscribedDeviceID  string
	subscription        notify.WebPushSubscription
	testDeviceID        string
	unsubscribeDeviceID string
	unsubscribeEndpoint string
}

func (service *fakeNotifyService) PublicKey() string {
	return service.publicKey
}

func (service *fakeNotifyService) RemoveDeviceSubscriptions(_ context.Context, deviceID string) error {
	service.removedDeviceIDs = append(service.removedDeviceIDs, deviceID)
	return nil
}

func (service *fakeNotifyService) Subscribe(_ context.Context, deviceID string, subscription notify.WebPushSubscription) (notify.Subscription, error) {
	service.subscribedDeviceID = deviceID
	service.subscription = subscription
	return notify.Subscription{DeviceID: deviceID, Endpoint: subscription.Endpoint}, nil
}

func (service *fakeNotifyService) Test(_ context.Context, deviceID string) (notify.TestResult, error) {
	service.testDeviceID = deviceID
	return notify.TestResult{SentCount: 1}, nil
}

func (service *fakeNotifyService) Unsubscribe(_ context.Context, deviceID string, endpoint string) (bool, error) {
	service.unsubscribeDeviceID = deviceID
	service.unsubscribeEndpoint = endpoint
	return true, nil
}

func TestPushEndpointsRequireAuthentication(t *testing.T) {
	store, _ := newTestRuntimeAuthStore(t)
	handler := NewHandler(HandlerConfig{
		Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
		NotifyService:      &fakeNotifyService{publicKey: "public_test"},
		RuntimeAuthService: store,
		RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
	})
	request := httptest.NewRequest(http.MethodPost, "/push/subscribe", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.Code)
	}
}

func TestPushSubscribeUnsubscribeAndTestUseAuthenticatedDevice(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	session, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test token ok=%v err=%v", ok, err)
	}
	notifyService := &fakeNotifyService{publicKey: "public_test"}
	handler := authenticatedTestHandler{
		handler: NewHandler(HandlerConfig{
			Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
			NotifyService:      notifyService,
			RuntimeAuthService: store,
			RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		}),
		token: token,
	}

	info := getJSON[RuntimeInfoResponse](t, handler, "/runtime/info", http.StatusOK)
	if info.VAPIDPublicKey != "public_test" {
		t.Fatalf("runtime info VAPID key = %q, want public_test", info.VAPIDPublicKey)
	}
	subscribe := postJSON[PushSubscribeResponse](t, handler, "/push/subscribe", PushSubscribeRequest{
		Subscription: notify.WebPushSubscription{
			Endpoint: "https://push.example/device",
			Keys: notify.WebPushKeys{
				Auth:   "auth_test",
				P256DH: "p256dh_test",
			},
		},
	}, http.StatusOK)
	if subscribe.VAPIDPublicKey != "public_test" {
		t.Fatalf("subscribe VAPID key = %q, want public_test", subscribe.VAPIDPublicKey)
	}
	if notifyService.subscribedDeviceID != session.ID {
		t.Fatalf("subscribed device = %q, want %q", notifyService.subscribedDeviceID, session.ID)
	}
	if notifyService.subscription.Endpoint != "https://push.example/device" {
		t.Fatalf("subscription = %+v", notifyService.subscription)
	}

	testResponse := postJSON[PushTestResponse](t, handler, "/push/test", PushTestRequest{}, http.StatusOK)
	if testResponse.SentCount != 1 || notifyService.testDeviceID != session.ID {
		t.Fatalf("test response = %+v, test device = %q, want one send for %q", testResponse, notifyService.testDeviceID, session.ID)
	}
	unsubscribe := postJSON[PushUnsubscribeResponse](t, handler, "/push/unsubscribe", PushUnsubscribeRequest{
		Endpoint: "https://push.example/device",
	}, http.StatusOK)
	if !unsubscribe.Removed ||
		notifyService.unsubscribeDeviceID != session.ID ||
		notifyService.unsubscribeEndpoint != "https://push.example/device" {
		t.Fatalf("unsubscribe = %+v device=%q endpoint=%q", unsubscribe, notifyService.unsubscribeDeviceID, notifyService.unsubscribeEndpoint)
	}
}

func TestDeviceRevocationRemovesPushSubscriptions(t *testing.T) {
	store, token := newTestRuntimeAuthStore(t)
	session, ok, err := store.ResolveDeviceToken(context.Background(), token)
	if err != nil || !ok {
		t.Fatalf("resolve test token ok=%v err=%v", ok, err)
	}
	notifyService := &fakeNotifyService{publicKey: "public_test"}
	handler := authenticatedTestHandler{
		handler: NewHandler(HandlerConfig{
			Metadata:           BackendMetadata{Name: BackendName, Version: "test"},
			NotifyService:      notifyService,
			RuntimeAuthService: store,
			RuntimeMetadata:    RuntimeMetadata{ID: "runtime_test", DisplayName: "Test Runtime"},
		}),
		token: token,
	}

	revoked := postJSON[RevokeDeviceResponse](t, handler, "/devices/revoke", RevokeDeviceRequest{
		DeviceID: session.ID,
	}, http.StatusOK)
	if revoked.Device.ID != session.ID || revoked.Device.RevokedAt == nil {
		t.Fatalf("revoked device = %+v, want revoked %q", revoked.Device, session.ID)
	}
	if len(notifyService.removedDeviceIDs) != 1 || notifyService.removedDeviceIDs[0] != session.ID {
		t.Fatalf("removed device ids = %+v, want %q", notifyService.removedDeviceIDs, session.ID)
	}
}

var _ NotifyService = (*fakeNotifyService)(nil)
var _ RuntimeAuthService = (*runtimeauth.Store)(nil)
