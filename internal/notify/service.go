package notify

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"setta/internal/chat"
	"setta/internal/runtimeauth"
)

const defaultVAPIDSubscriber = "mailto:notifications@setta.local"

type RuntimeAuthService interface {
	ListDeviceSessions(context.Context) ([]runtimeauth.DeviceSession, error)
	IsDeviceSessionRevoked(context.Context, string) (bool, error)
}

type ChatEventSource interface {
	SubscribeEvents(chat.EventCursor) (*chat.EventSubscription, error)
}

type Sender interface {
	Send(context.Context, VAPIDKeyPair, PushPayload, Subscription) error
}

type ServiceConfig struct {
	AppDataDir         string
	Clock              func() time.Time
	RuntimeAuthService RuntimeAuthService
	Sender             Sender
	VAPIDKeyGenerator  vapidKeyGenerator
	VAPIDSubscriber    string
}

type Service struct {
	authService RuntimeAuthService
	keyPair     VAPIDKeyPair
	sender      Sender
	store       *Store

	observerCancel context.CancelFunc
	observerDone   chan struct{}

	mu                sync.Mutex
	notifiedApprovals map[string]struct{}
	notifiedResponses map[string]struct{}
	notifiedRuns      map[string]struct{}
}

func NewService(config ServiceConfig) (*Service, error) {
	if config.RuntimeAuthService == nil {
		return nil, errors.New("runtime auth service is required")
	}
	keyPair, err := loadOrCreateVAPIDKeys(config.AppDataDir, config.VAPIDKeyGenerator)
	if err != nil {
		return nil, err
	}
	storeOptions := []StoreOption{}
	if config.Clock != nil {
		storeOptions = append(storeOptions, WithClock(config.Clock))
	}
	store, err := NewStore(config.AppDataDir, storeOptions...)
	if err != nil {
		return nil, err
	}
	sender := config.Sender
	if sender == nil {
		subscriber := config.VAPIDSubscriber
		if subscriber == "" {
			subscriber = defaultVAPIDSubscriber
		}
		sender = webPushSender{subscriber: subscriber}
	}
	return &Service{
		authService:       config.RuntimeAuthService,
		keyPair:           keyPair,
		notifiedApprovals: map[string]struct{}{},
		notifiedResponses: map[string]struct{}{},
		notifiedRuns:      map[string]struct{}{},
		sender:            sender,
		store:             store,
	}, nil
}

func (service *Service) PublicKey() string {
	if service == nil {
		return ""
	}
	return service.keyPair.PublicKey
}

func (service *Service) Subscribe(ctx context.Context, deviceID string, subscription WebPushSubscription) (Subscription, error) {
	if service == nil {
		return Subscription{}, errors.New("notify service is required")
	}
	if revoked, err := service.authService.IsDeviceSessionRevoked(ctx, deviceID); err != nil {
		return Subscription{}, err
	} else if revoked {
		return Subscription{}, errors.New("device session is revoked")
	}
	return service.store.SaveSubscription(ctx, deviceID, subscription)
}

func (service *Service) Unsubscribe(ctx context.Context, deviceID string, endpoint string) (bool, error) {
	if service == nil {
		return false, errors.New("notify service is required")
	}
	return service.store.DeleteSubscription(ctx, deviceID, endpoint)
}

func (service *Service) RemoveDeviceSubscriptions(ctx context.Context, deviceID string) error {
	if service == nil {
		return nil
	}
	_, err := service.store.DeleteDeviceSubscriptions(ctx, deviceID)
	return err
}

func (service *Service) Test(ctx context.Context, deviceID string) (TestResult, error) {
	if service == nil {
		return TestResult{}, errors.New("notify service is required")
	}
	if err := service.PruneRevokedSubscriptions(ctx); err != nil {
		return TestResult{}, err
	}
	subscriptions, err := service.store.ListDeviceSubscriptions(ctx, deviceID)
	if err != nil {
		return TestResult{}, err
	}
	sent, err := service.sendToSubscriptions(ctx, PushPayload{Type: PushEventTypeTest}, subscriptions)
	if err != nil {
		return TestResult{}, err
	}
	return TestResult{SentCount: sent}, nil
}

func (service *Service) Publish(ctx context.Context, payload PushPayload) (int, error) {
	if service == nil {
		return 0, errors.New("notify service is required")
	}
	if err := validatePushPayload(payload); err != nil {
		return 0, err
	}
	if err := service.PruneRevokedSubscriptions(ctx); err != nil {
		return 0, err
	}
	subscriptions, err := service.store.ListSubscriptions(ctx)
	if err != nil {
		return 0, err
	}
	return service.sendToSubscriptions(ctx, payload, subscriptions)
}

func (service *Service) PruneRevokedSubscriptions(ctx context.Context) error {
	sessions, err := service.authService.ListDeviceSessions(ctx)
	if err != nil {
		return err
	}
	for _, session := range sessions {
		if session.RevokedAt == nil {
			continue
		}
		if _, err := service.store.DeleteDeviceSubscriptions(ctx, session.ID); err != nil {
			return err
		}
	}
	return nil
}

func (service *Service) StartChatObserver(ctx context.Context, source ChatEventSource) error {
	if service == nil {
		return errors.New("notify service is required")
	}
	if source == nil {
		return errors.New("chat event source is required")
	}
	service.mu.Lock()
	if service.observerCancel != nil {
		service.mu.Unlock()
		return errors.New("chat observer already started")
	}
	observerCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	service.observerCancel = cancel
	service.observerDone = done
	service.mu.Unlock()

	subscription, err := source.SubscribeEvents(chat.EventCursor{})
	if err != nil {
		cancel()
		service.mu.Lock()
		service.observerCancel = nil
		service.observerDone = nil
		service.mu.Unlock()
		return fmt.Errorf("subscribe chat events for push notifications: %w", err)
	}
	go service.observeChatEvents(observerCtx, subscription, done)
	return nil
}

func (service *Service) Close() error {
	if service == nil {
		return nil
	}
	service.mu.Lock()
	cancel := service.observerCancel
	done := service.observerDone
	service.observerCancel = nil
	service.observerDone = nil
	service.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
	return service.store.Close()
}

func (service *Service) observeChatEvents(ctx context.Context, subscription *chat.EventSubscription, done chan<- struct{}) {
	defer close(done)
	defer subscription.Unsubscribe()
	for {
		select {
		case <-ctx.Done():
			return
		case event, ok := <-subscription.Events:
			if !ok {
				return
			}
			_ = service.HandleChatEvent(ctx, event)
		}
	}
}

func (service *Service) HandleChatEvent(ctx context.Context, event chat.Event) error {
	if service == nil {
		return errors.New("notify service is required")
	}
	payload, ok, err := service.pushPayloadForChatEvent(event)
	if err != nil || !ok {
		return err
	}
	_, err = service.Publish(ctx, payload)
	return err
}

func (service *Service) pushPayloadForChatEvent(event chat.Event) (PushPayload, bool, error) {
	switch event.Type {
	case chat.EventTypeAssistantTextDelta:
		if event.RunID == "" {
			return PushPayload{}, false, nil
		}
		if !service.markFirst(service.notifiedResponses, event.RunID) {
			return PushPayload{}, false, nil
		}
		return PushPayload{
			ConversationID: event.ConversationID,
			RunID:          event.RunID,
			Type:           PushEventTypeAgentResponded,
			WorkspaceID:    event.WorkspaceID,
		}, true, nil
	case chat.EventTypeRunUpdated:
		var payload chat.RunUpdatedPayload
		if err := json.Unmarshal(event.Payload, &payload); err != nil {
			return PushPayload{}, false, fmt.Errorf("decode chat run update event for push: %w", err)
		}
		run := payload.Run
		if run.PendingApproval != nil && run.PendingApproval.Status == chat.ApprovalStatusPending {
			if !service.markFirst(service.notifiedApprovals, run.PendingApproval.ID) {
				return PushPayload{}, false, nil
			}
			return PushPayload{
				ApprovalID:     run.PendingApproval.ID,
				ConversationID: run.ConversationID,
				RunID:          run.ID,
				Type:           PushEventTypeApprovalRequested,
				WorkspaceID:    run.WorkspaceID,
			}, true, nil
		}
		if runFinished(run.Status) {
			if !service.markFirst(service.notifiedRuns, run.ID) {
				return PushPayload{}, false, nil
			}
			return PushPayload{
				ConversationID: run.ConversationID,
				RunID:          run.ID,
				Type:           PushEventTypeRunFinished,
				WorkspaceID:    run.WorkspaceID,
			}, true, nil
		}
	}
	return PushPayload{}, false, nil
}

func (service *Service) markFirst(seen map[string]struct{}, key string) bool {
	if key == "" {
		return false
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if _, ok := seen[key]; ok {
		return false
	}
	seen[key] = struct{}{}
	return true
}

func (service *Service) sendToSubscriptions(ctx context.Context, payload PushPayload, subscriptions []Subscription) (int, error) {
	sent := 0
	for _, subscription := range subscriptions {
		err := service.sender.Send(ctx, service.keyPair, payload, subscription)
		if errors.Is(err, ErrSubscriptionGone) {
			if _, deleteErr := service.store.DeleteSubscription(ctx, subscription.DeviceID, subscription.Endpoint); deleteErr != nil {
				return sent, deleteErr
			}
			continue
		}
		if err != nil {
			return sent, err
		}
		sent += 1
	}
	return sent, nil
}

func runFinished(status chat.RunStatus) bool {
	switch status {
	case chat.RunStatusCompleted, chat.RunStatusCancelled, chat.RunStatusFailed:
		return true
	default:
		return false
	}
}

func validatePushPayload(payload PushPayload) error {
	switch payload.Type {
	case PushEventTypeTest:
		return nil
	case PushEventTypeRunFinished, PushEventTypeAgentResponded:
		if strings.TrimSpace(payload.WorkspaceID) == "" ||
			strings.TrimSpace(payload.ConversationID) == "" ||
			strings.TrimSpace(payload.RunID) == "" {
			return errors.New("push payload workspace, conversation, and run ids are required")
		}
		return nil
	case PushEventTypeApprovalRequested:
		if strings.TrimSpace(payload.WorkspaceID) == "" ||
			strings.TrimSpace(payload.ConversationID) == "" ||
			strings.TrimSpace(payload.RunID) == "" ||
			strings.TrimSpace(payload.ApprovalID) == "" {
			return errors.New("approval push payload workspace, conversation, run, and approval ids are required")
		}
		return nil
	default:
		return fmt.Errorf("unsupported push event type %q", payload.Type)
	}
}

type webPushSender struct {
	subscriber string
}

func (sender webPushSender) Send(ctx context.Context, keyPair VAPIDKeyPair, payload PushPayload, subscription Subscription) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal web push payload: %w", err)
	}
	response, err := webpush.SendNotificationWithContext(
		ctx,
		data,
		&webpush.Subscription{
			Endpoint: subscription.Endpoint,
			Keys: webpush.Keys{
				Auth:   subscription.Auth,
				P256dh: subscription.P256DH,
			},
		},
		&webpush.Options{
			Subscriber:      sender.subscriber,
			TTL:             300,
			Urgency:         webpush.UrgencyNormal,
			VAPIDPrivateKey: keyPair.PrivateKey,
			VAPIDPublicKey:  keyPair.PublicKey,
		},
	)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusGone, http.StatusNotFound:
		return ErrSubscriptionGone
	}
	if response.StatusCode < 200 || response.StatusCode > 299 {
		return fmt.Errorf("web push endpoint returned HTTP %d", response.StatusCode)
	}
	return nil
}
