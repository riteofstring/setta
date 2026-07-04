package notify

import "errors"

const (
	PushEventTypeRunFinished       PushEventType = "run-finished"
	PushEventTypeApprovalRequested PushEventType = "approval-requested"
	PushEventTypeAgentResponded    PushEventType = "agent-responded"
	PushEventTypeTest              PushEventType = "test"
)

type PushEventType string

type WebPushSubscription struct {
	Endpoint string      `json:"endpoint"`
	Keys     WebPushKeys `json:"keys"`
}

type WebPushKeys struct {
	Auth   string `json:"auth"`
	P256DH string `json:"p256dh"`
}

type Subscription struct {
	DeviceID  string `json:"deviceId"`
	Endpoint  string `json:"endpoint"`
	P256DH    string `json:"p256dh"`
	Auth      string `json:"auth"`
	CreatedAt string `json:"createdAt"`
}

type PushPayload struct {
	Type           PushEventType `json:"type"`
	WorkspaceID    string        `json:"workspaceId,omitempty"`
	ConversationID string        `json:"conversationId,omitempty"`
	RunID          string        `json:"runId,omitempty"`
	ApprovalID     string        `json:"approvalId,omitempty"`
}

type TestResult struct {
	SentCount int `json:"sentCount"`
}

type VAPIDKeyPair struct {
	PublicKey  string `json:"publicKey"`
	PrivateKey string `json:"privateKey"`
}

var ErrSubscriptionGone = errors.New("web push subscription is gone")
