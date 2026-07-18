package notify

import (
	"context"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
	"setta/internal/runtimeauth"
)

type sentPush struct {
	Payload      PushPayload
	Subscription Subscription
}

type fakeSender struct {
	sent []sentPush
}

func (sender *fakeSender) Send(_ context.Context, _ VAPIDKeyPair, payload PushPayload, subscription Subscription) error {
	sender.sent = append(sender.sent, sentPush{Payload: payload, Subscription: subscription})
	return nil
}

func TestVAPIDKeypairGeneratedAtFirstStartAndReused(t *testing.T) {
	appDataDir := t.TempDir()
	authStore, _, closeAuth := newNotifyAuthStore(t, appDataDir)
	defer closeAuth()
	generateCount := 0
	generator := func() (string, string, error) {
		generateCount += 1
		return "private_test", "public_test", nil
	}
	service, err := NewService(ServiceConfig{
		AppDataDir:         appDataDir,
		RuntimeAuthService: authStore,
		Sender:             &fakeSender{},
		VAPIDKeyGenerator:  generator,
	})
	if err != nil {
		t.Fatalf("new notify service: %v", err)
	}
	if service.PublicKey() != "public_test" {
		t.Fatalf("public key = %q, want generated key", service.PublicKey())
	}
	if err := service.Close(); err != nil {
		t.Fatalf("close notify service: %v", err)
	}
	if generateCount != 1 {
		t.Fatalf("generator called %d times, want 1", generateCount)
	}
	reopened, err := NewService(ServiceConfig{
		AppDataDir:         appDataDir,
		RuntimeAuthService: authStore,
		Sender:             &fakeSender{},
		VAPIDKeyGenerator:  generator,
	})
	if err != nil {
		t.Fatalf("reopen notify service: %v", err)
	}
	defer reopened.Close()
	if generateCount != 1 {
		t.Fatalf("generator called %d times after reopen, want 1", generateCount)
	}
	if got := filepath.Base(filepath.Dir(service.store.Path())); got != "runtime" {
		t.Fatalf("notify database directory = %q, want runtime", got)
	}
}

func TestSubscriptionLifecycleAndRevocationPrune(t *testing.T) {
	appDataDir := t.TempDir()
	authStore, firstSession, closeAuth := newNotifyAuthStore(t, appDataDir)
	defer closeAuth()
	secondSession, _, err := authStore.CreateDeviceSession(context.Background(), "Second device")
	if err != nil {
		t.Fatalf("create second device: %v", err)
	}
	sender := &fakeSender{}
	service := newTestNotifyService(t, appDataDir, authStore, sender)
	defer service.Close()

	if _, err := service.Subscribe(context.Background(), firstSession.ID, testWebPushSubscription("https://push.example/first")); err != nil {
		t.Fatalf("subscribe first: %v", err)
	}
	if _, err := service.Subscribe(context.Background(), secondSession.ID, testWebPushSubscription("https://push.example/second")); err != nil {
		t.Fatalf("subscribe second: %v", err)
	}
	if _, _, err := authStore.RevokeDeviceSession(context.Background(), firstSession.ID); err != nil {
		t.Fatalf("revoke first session: %v", err)
	}
	sent, err := service.Publish(context.Background(), PushPayload{
		ConversationID: "conversation_notify",
		RunID:          "run_notify",
		Type:           PushEventTypeRunFinished,
		WorkspaceID:    "workspace_notify",
	})
	if err != nil {
		t.Fatalf("publish push: %v", err)
	}
	if sent != 1 || len(sender.sent) != 1 {
		t.Fatalf("sent count = %d, sender count = %d, want one active subscription", sent, len(sender.sent))
	}
	if sender.sent[0].Subscription.DeviceID != secondSession.ID {
		t.Fatalf("push went to device %q, want %q", sender.sent[0].Subscription.DeviceID, secondSession.ID)
	}
	subscriptions, err := service.store.ListSubscriptions(context.Background())
	if err != nil {
		t.Fatalf("list subscriptions: %v", err)
	}
	if len(subscriptions) != 1 || subscriptions[0].DeviceID != secondSession.ID {
		t.Fatalf("subscriptions after prune = %+v, want only second device", subscriptions)
	}
	removed, err := service.Unsubscribe(context.Background(), secondSession.ID, "https://push.example/second")
	if err != nil {
		t.Fatalf("unsubscribe second: %v", err)
	}
	if !removed {
		t.Fatal("unsubscribe removed = false, want true")
	}
}

func TestChatObserverPayloadsContainIDsOnly(t *testing.T) {
	appDataDir := t.TempDir()
	authStore, session, closeAuth := newNotifyAuthStore(t, appDataDir)
	defer closeAuth()
	sender := &fakeSender{}
	service := newTestNotifyService(t, appDataDir, authStore, sender)
	defer service.Close()
	if _, err := service.Subscribe(context.Background(), session.ID, testWebPushSubscription("https://push.example/device")); err != nil {
		t.Fatalf("subscribe: %v", err)
	}

	run := chat.Run{
		ID:             "run_notify",
		WorkspaceID:    "workspace_notify",
		ConversationID: "conversation_notify",
		Status:         chat.RunStatusRunning,
		PendingApproval: &chat.ApprovalRequest{
			ID:     "approval_notify",
			Status: chat.ApprovalStatusPending,
		},
	}
	runPayload, err := json.Marshal(chat.RunUpdatedPayload{Run: run})
	if err != nil {
		t.Fatalf("marshal run payload: %v", err)
	}
	if err := service.HandleChatEvent(context.Background(), chat.Event{
		Type:    chat.EventTypeRunUpdated,
		Payload: runPayload,
	}); err != nil {
		t.Fatalf("handle approval event: %v", err)
	}
	if err := service.HandleChatEvent(context.Background(), chat.Event{
		ConversationID: "conversation_notify",
		RunID:          "run_notify",
		Type:           chat.EventTypeAssistantTextDelta,
		WorkspaceID:    "workspace_notify",
		Payload:        json.RawMessage(`{"delta":"must not leak"}`),
	}); err != nil {
		t.Fatalf("handle response event: %v", err)
	}
	run.Status = chat.RunStatusCompleted
	run.PendingApproval = nil
	runPayload, err = json.Marshal(chat.RunUpdatedPayload{Run: run})
	if err != nil {
		t.Fatalf("marshal completed run payload: %v", err)
	}
	if err := service.HandleChatEvent(context.Background(), chat.Event{
		Type:    chat.EventTypeRunUpdated,
		Payload: runPayload,
	}); err != nil {
		t.Fatalf("handle run finished event: %v", err)
	}
	if len(sender.sent) != 3 {
		t.Fatalf("sent push count = %d, want 3", len(sender.sent))
	}
	wantTypes := []PushEventType{
		PushEventTypeApprovalRequested,
		PushEventTypeAgentResponded,
		PushEventTypeRunFinished,
	}
	for index, sent := range sender.sent {
		payload := sent.Payload
		if payload.Type != wantTypes[index] {
			t.Fatalf("payload[%d].type = %q, want %q", index, payload.Type, wantTypes[index])
		}
		if payload.WorkspaceID != "workspace_notify" ||
			payload.ConversationID != "conversation_notify" ||
			payload.RunID != "run_notify" {
			t.Fatalf("payload[%d] ids = %+v, want workspace/conversation/run ids", index, payload)
		}
		if payload.Type == PushEventTypeApprovalRequested && payload.ApprovalID != "approval_notify" {
			t.Fatalf("approval id = %q, want approval_notify", payload.ApprovalID)
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal sent payload: %v", err)
		}
		if string(encoded) == "" ||
			containsAny(string(encoded), []string{"must not leak", "prompt", "body", "title"}) {
			t.Fatalf("payload leaked content: %s", encoded)
		}
	}
}

func newNotifyAuthStore(t *testing.T, appDataDir string) (*runtimeauth.Store, runtimeauth.DeviceSession, func()) {
	t.Helper()
	store, err := runtimeauth.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new runtime auth store: %v", err)
	}
	session, _, err := store.CreateDeviceSession(context.Background(), "Phone")
	if err != nil {
		t.Fatalf("create device session: %v", err)
	}
	return store, session, func() {
		if err := store.Close(); err != nil {
			t.Fatalf("close runtime auth store: %v", err)
		}
	}
}

func newTestNotifyService(t *testing.T, appDataDir string, authStore *runtimeauth.Store, sender *fakeSender) *Service {
	t.Helper()
	service, err := NewService(ServiceConfig{
		AppDataDir:         appDataDir,
		Clock:              func() time.Time { return time.Date(2026, 7, 2, 12, 0, 0, 0, time.UTC) },
		RuntimeAuthService: authStore,
		Sender:             sender,
		VAPIDKeyGenerator: func() (string, string, error) {
			return "private_test", "public_test", nil
		},
	})
	if err != nil {
		t.Fatalf("new notify service: %v", err)
	}
	return service
}

func testWebPushSubscription(endpoint string) WebPushSubscription {
	return WebPushSubscription{
		Endpoint: endpoint,
		Keys: WebPushKeys{
			Auth:   "auth_test",
			P256DH: "p256dh_test",
		},
	}
}

func containsAny(text string, needles []string) bool {
	for _, needle := range needles {
		if len(needle) > 0 && strings.Contains(text, needle) {
			return true
		}
	}
	return false
}
