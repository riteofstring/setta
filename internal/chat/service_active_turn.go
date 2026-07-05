package chat

import (
	"context"
	"time"
)

type activeTurn struct {
	assistantMessage            ChatMessage
	assistantTextByProviderItem map[string]assistantProviderTextState
	completedAssistantTexts     []string
	cancel                      context.CancelFunc
	cancelDrain                 bool
	goalOperation               HarnessGoalOperation
	lastPersistedAt             time.Time
	lastProviderEventAt         time.Time
	lastVisibleActivityAt       time.Time
	livenessCheckGeneration     uint64
	publicReasoningHeadline     string
	providerEventGeneration     uint64
	runID                       string
	threadID                    string
	turnID                      string
	workspaceID                 string
	transcript                  *transcriptIngest
}
