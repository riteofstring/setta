package conversation

import (
	"context"
	"testing"

	"setta/internal/speech"
)

func TestStoreResolvesAuthoritativeNarrationSpeechSourceAndVoice(t *testing.T) {
	store := newTestStore(t)
	seedTransactionConversation(t, store)
	event := transactionMilestoneEvent()
	_, err := store.Transact(context.Background(), "append narration speech source", func(transaction *WriteTransaction) error {
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
			"narration-speech-source-created",
			"conversation:conversation-1",
			appended,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append narration speech source: %v", err)
	}

	conversationID := "conversation-1"
	source := speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		EventID:        event.ID,
		ConversationID: &conversationID,
	}
	resolved, err := store.ResolveSpeechSource(context.Background(), source)
	if err != nil {
		t.Fatalf("resolve narration speech source: %v", err)
	}
	if resolved.Source != source ||
		resolved.Text != event.Milestone.Text ||
		resolved.ResolvedVoiceID != speech.SpeechVoiceAlloy {
		t.Fatalf("resolved narration speech source = %+v", resolved)
	}

	wrongConversationID := "conversation-other"
	_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		EventID:        event.ID,
		ConversationID: &wrongConversationID,
	})
	assertSpeechSourceUnavailable(t, err)
}

func TestStoreRejectsUnavailableMasterAndUnspokenNarrationSources(t *testing.T) {
	store := newTestStore(t)
	seedTransactionConversation(t, store)

	_, err := store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker: speech.SpeechSpeakerMaster,
		EventID: "master-reply-future",
	})
	assertSpeechSourceUnavailable(t, err)

	event := transactionMilestoneEvent()
	event.ID = "topic-descriptor-source"
	event.Kind = NarrationEventKindTopicDescriptor
	event.Trigger = NarrationTriggerProgressWindowElapsed
	event.Milestone = nil
	event.TopicDescriptor = &NarrationTopicDescriptor{Text: "Speech architecture"}
	_, err = store.Transact(context.Background(), "append unspoken narration source", func(transaction *WriteTransaction) error {
		appended, err := transaction.AppendNarrationEvent(event)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(transactionTestEventDraft(
			"topic-descriptor-created",
			"conversation:conversation-1",
			appended,
		))
		return err
	})
	if err != nil {
		t.Fatalf("append topic descriptor source: %v", err)
	}
	conversationID := "conversation-1"
	_, err = store.ResolveSpeechSource(context.Background(), speech.SpeechSource{
		Speaker:        speech.SpeechSpeakerNarrator,
		EventID:        event.ID,
		ConversationID: &conversationID,
	})
	assertSpeechSourceUnavailable(t, err)
}

func assertSpeechSourceUnavailable(t *testing.T, err error) {
	t.Helper()
	speechError, ok := speech.AsError(err)
	if !ok || speechError.Code != speech.ErrorSourceUnavailable {
		t.Fatalf("speech source error = %T %v", err, err)
	}
}
