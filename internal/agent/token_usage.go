package agent

import (
	"fmt"
	"sync"

	"setta/internal/codexapp"
	"setta/internal/tokenestimate"
)

// turnTokenUsage keeps a tokenizer-backed estimate available from admission
// onward, then replaces it with Codex's exact per-turn usage when the provider
// publishes thread/tokenUsage/updated.
type turnTokenUsage struct {
	mu        sync.Mutex
	estimated TokenUsage
	provider  *TokenUsage
}

func newTurnTokenUsage(input string) (*turnTokenUsage, error) {
	inputTokens, err := tokenestimate.Count(input)
	if err != nil {
		return nil, fmt.Errorf("estimate agent input tokens: %w", err)
	}
	return &turnTokenUsage{estimated: TokenUsage{InputTokens: inputTokens}}, nil
}

func (usage *turnTokenUsage) addInput(input string) error {
	inputTokens, err := tokenestimate.Count(input)
	if err != nil {
		return fmt.Errorf("estimate steered agent input tokens: %w", err)
	}
	usage.mu.Lock()
	usage.estimated.InputTokens += inputTokens
	usage.mu.Unlock()
	return nil
}

func (usage *turnTokenUsage) addOutput(output string) error {
	outputTokens, err := tokenestimate.Count(output)
	if err != nil {
		return fmt.Errorf("estimate agent output tokens: %w", err)
	}
	usage.mu.Lock()
	usage.estimated.OutputTokens += outputTokens
	usage.mu.Unlock()
	return nil
}

func (usage *turnTokenUsage) observeProvider(
	notification codexapp.ThreadTokenUsageUpdatedNotification,
) error {
	provider := TokenUsage{
		InputTokens:       notification.TokenUsage.Last.InputTokens,
		CachedInputTokens: notification.TokenUsage.Last.CachedInputTokens,
		OutputTokens:      notification.TokenUsage.Last.OutputTokens,
	}
	if err := provider.Validate(); err != nil {
		return fmt.Errorf("provider token usage: %w", err)
	}
	if provider.InputTokens == 0 && provider.OutputTokens == 0 {
		return nil
	}
	usage.mu.Lock()
	usage.provider = &provider
	usage.mu.Unlock()
	return nil
}

func (usage *turnTokenUsage) snapshot() TokenUsage {
	usage.mu.Lock()
	defer usage.mu.Unlock()
	if usage.provider != nil {
		return *usage.provider
	}
	return usage.estimated
}

func tokenUsagePointer(value TokenUsage) *TokenUsage {
	copy := value
	return &copy
}
