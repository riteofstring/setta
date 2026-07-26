package runtime

import (
	"context"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/speech"
)

func newSpeechService(
	config speech.OpenAIProviderConfig,
	startupAPIKey string,
	store *conversation.Store,
) (*speech.Service, error) {
	providerController, err := speech.NewOpenAIProviderController(config, startupAPIKey)
	if err != nil {
		return nil, fmt.Errorf("create OpenAI speech provider controller: %w", err)
	}
	service, err := speech.NewService(context.Background(), speech.ServiceConfig{
		ProviderController:      providerController,
		SourceResolver:          runtimeSpeechSourceResolver{store: store},
		VoiceConfigurationStore: store,
	})
	if err != nil {
		providerController.Shutdown()
		return nil, fmt.Errorf("create speech service: %w", err)
	}
	return service, nil
}

type runtimeSpeechSourceResolver struct {
	store *conversation.Store
}

func (resolver runtimeSpeechSourceResolver) ResolveSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (speech.ResolvedSpeechSource, error) {
	if resolver.store == nil {
		return speech.ResolvedSpeechSource{}, errors.New("conversation store is required")
	}
	if source.Speaker != speech.SpeechSpeakerDirector {
		return resolver.store.ResolveSpeechSource(ctx, source)
	}
	return resolver.resolveDirectorSpeechSource(ctx, source)
}

func (resolver runtimeSpeechSourceResolver) resolveDirectorSpeechSource(
	ctx context.Context,
	source speech.SpeechSource,
) (speech.ResolvedSpeechSource, error) {
	if err := source.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	voice, err := resolver.store.ReadDirectorVoiceSelection(ctx)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	if voice.ResolvedVoiceID == nil {
		return speech.ResolvedSpeechSource{}, errors.New("director speech requires a resolved Director voice")
	}
	text, err := resolver.resolveDirectorSpeechText(ctx, source.EventID)
	if err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	resolved := speech.ResolvedSpeechSource{
		Source:          source,
		Text:            text,
		ResolvedVoiceID: *voice.ResolvedVoiceID,
	}
	if err := resolved.Validate(); err != nil {
		return speech.ResolvedSpeechSource{}, err
	}
	return resolved, nil
}

// resolveDirectorSpeechText reads what the Director said out of its own
// conversation. A turn may act through several tools before it answers, and only
// the reply is speech: the tool calls beside it are what the app did, which the
// user watches rather than hears.
func (resolver runtimeSpeechSourceResolver) resolveDirectorSpeechText(
	ctx context.Context,
	intentID string,
) (string, error) {
	afterSequence := 0
	for {
		events, err := resolver.store.ReadCommittedStreamEvents(
			ctx,
			conversation.DirectorConversationStreamID,
			afterSequence,
			conversation.MaxCommittedEventReadLimit,
		)
		if err != nil {
			return "", err
		}
		for _, event := range events {
			afterSequence = event.StreamSequence
			entry, err := conversation.DecodeDirectorConversationEntry(event)
			if err != nil {
				return "", err
			}
			if entry.Kind != conversation.DirectorConversationAssistantText || entry.TurnID != intentID {
				continue
			}
			return entry.Text.Text, nil
		}
		if len(events) < conversation.MaxCommittedEventReadLimit {
			break
		}
	}
	return "", speech.SourceUnavailable("The requested Director speech event is not available.", nil)
}
