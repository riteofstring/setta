package speech

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"setta/internal/conversation"
)

type VoiceProvider interface {
	Configured() bool
	SynthesizeSpeechWithVoice(context.Context, string, VoiceID) (SynthesizedAudio, error)
}

type Coordinator struct {
	provider            VoiceProvider
	allocator           *VoiceAllocator
	store               *conversation.Store
	activeConversations func(context.Context) ([]string, error)
}

type CoordinatorConfig struct {
	Provider            VoiceProvider
	Allocator           *VoiceAllocator
	Store               *conversation.Store
	ActiveConversations func(context.Context) ([]string, error)
}

func NewCoordinator(config CoordinatorConfig) (*Coordinator, error) {
	if config.Provider == nil || config.Allocator == nil || config.Store == nil {
		return nil, errors.New("global speech provider, voice allocator, and conversation store are required")
	}
	active := config.ActiveConversations
	if active == nil {
		active = func(context.Context) ([]string, error) { return []string{}, nil }
	}
	return &Coordinator{
		provider: config.Provider, allocator: config.Allocator,
		store: config.Store, activeConversations: active,
	}, nil
}

func (coordinator *Coordinator) VoiceCatalog(context.Context) (SpeechVoiceCatalog, error) {
	voices := VoiceCatalog()
	result := SpeechVoiceCatalog{Version: VoiceCatalogVersion(), Voices: make([]SpeechVoice, 0, len(voices))}
	for _, voice := range voices {
		result.Voices = append(result.Voices, SpeechVoice{ID: voice})
	}
	return result, nil
}

func (coordinator *Coordinator) Synthesize(ctx context.Context, request SourcedSynthesisRequest) (SourcedSpeechAudio, error) {
	if coordinator == nil || coordinator.provider == nil {
		return SourcedSpeechAudio{}, errors.New("global speech coordinator is required")
	}
	if !coordinator.provider.Configured() {
		return SourcedSpeechAudio{}, classifiedError(ErrorNotConfigured, "OpenAI speech is not configured.", nil)
	}
	if err := validateSourcedSynthesisRequest(request); err != nil {
		return SourcedSpeechAudio{}, err
	}
	if err := coordinator.validateSource(ctx, request); err != nil {
		return SourcedSpeechAudio{}, err
	}
	assignment, err := coordinator.resolveVoice(ctx, request)
	if err != nil {
		return SourcedSpeechAudio{}, err
	}
	generated, err := coordinator.provider.SynthesizeSpeechWithVoice(ctx, request.Text, assignment.VoiceID)
	if err != nil {
		return SourcedSpeechAudio{}, err
	}
	return SourcedSpeechAudio{
		AudioBase64: base64.StdEncoding.EncodeToString(generated.Bytes),
		MediaType:   generated.MediaType, Format: generated.Format,
		SourceEventID: request.SourceEventID, SourceKind: request.SourceKind,
		Speaker: request.Speaker, ConversationID: cloneConversationID(request.ConversationID),
		ResolvedVoiceID: assignment.VoiceID,
	}, nil
}

func validateSourcedSynthesisRequest(request SourcedSynthesisRequest) error {
	if err := validateSourceID("speech source event id", request.SourceEventID); err != nil {
		return err
	}
	if !validSpeechSourceKind(request.SourceKind) {
		return fmt.Errorf("unsupported speech source kind %q", request.SourceKind)
	}
	if err := validateSynthesisText(request.Text); err != nil {
		return err
	}
	switch request.Speaker {
	case SpeakerMaster:
		if request.ConversationID != nil {
			return errors.New("master speech must not include a conversation id")
		}
		if request.SourceKind != SpeechSourceMasterAnswer && request.SourceKind != SpeechSourceAttention {
			return fmt.Errorf("master speech cannot synthesize source kind %s", request.SourceKind)
		}
	case SpeakerNarrator:
		if request.ConversationID == nil || strings.TrimSpace(*request.ConversationID) == "" {
			return errors.New("narrator speech requires a conversation id")
		}
		if request.SourceKind == SpeechSourceMasterAnswer {
			return errors.New("narrator speech cannot use a master-answer source")
		}
	default:
		return fmt.Errorf("unsupported speech speaker %q", request.Speaker)
	}
	return nil
}

func (coordinator *Coordinator) resolveVoice(ctx context.Context, request SourcedSynthesisRequest) (VoiceAssignment, error) {
	if request.Speaker == SpeakerMaster {
		return coordinator.allocator.ResolveMaster(ctx)
	}
	active, err := coordinator.activeConversations(ctx)
	if err != nil {
		return VoiceAssignment{}, err
	}
	return coordinator.allocator.ResolveNarrator(ctx, *request.ConversationID, active)
}

func (coordinator *Coordinator) validateSource(ctx context.Context, request SourcedSynthesisRequest) error {
	if request.Speaker == SpeakerMaster {
		event, err := coordinator.store.ReadCommittedEventByID(ctx, request.SourceEventID)
		if err != nil {
			return err
		}
		if event.StreamID != "master:global" || event.Kind != "master.reply" {
			return errors.New("master speech source is not a committed master reply")
		}
		return nil
	}
	if request.SourceKind == SpeechSourceAttention {
		event, err := coordinator.store.ReadCommittedEventByID(ctx, request.SourceEventID)
		if err != nil {
			return err
		}
		if event.StreamID != "conversation:"+*request.ConversationID {
			return errors.New("attention speech source does not belong to the conversation")
		}
		return nil
	}
	event, err := coordinator.store.ReadNarrationEvent(ctx, *request.ConversationID, request.SourceEventID)
	if err != nil {
		return err
	}
	want, err := narrationKindForSpeechSource(request.SourceKind)
	if err != nil {
		return err
	}
	if event.Kind != want {
		return fmt.Errorf("speech source kind %s does not match narration event %s", request.SourceKind, event.Kind)
	}
	return nil
}

func narrationKindForSpeechSource(kind SpeechSourceKind) (conversation.NarrationEventKind, error) {
	switch kind {
	case SpeechSourceStatusReply:
		return conversation.NarrationEventKindStatusReply, nil
	case SpeechSourceFinalSummary:
		return conversation.NarrationEventKindFinalSummary, nil
	case SpeechSourceMilestone:
		return conversation.NarrationEventKindMilestone, nil
	default:
		return "", fmt.Errorf("speech source %s is not a narrator narration kind", kind)
	}
}

func validSpeechSourceKind(kind SpeechSourceKind) bool {
	switch kind {
	case SpeechSourceMasterAnswer, SpeechSourceStatusReply, SpeechSourceAttention, SpeechSourceFinalSummary, SpeechSourceMilestone:
		return true
	default:
		return false
	}
}

func cloneConversationID(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
