package speech

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"time"

	"setta/internal/conversation"
)

type VoiceAssignment struct {
	VoiceID                    VoiceID  `json:"voiceId"`
	CatalogVersion             string   `json:"catalogVersion"`
	Reused                     bool     `json:"reused"`
	ReuseReason                *string  `json:"reuseReason"`
	ConflictingConversationIDs []string `json:"conflictingConversationIds"`
}

type VoiceAllocator struct {
	store *conversation.Store
	now   func() time.Time
	newID func(string) (string, error)
}

func NewVoiceAllocator(store *conversation.Store) (*VoiceAllocator, error) {
	if store == nil {
		return nil, errors.New("voice allocator conversation store is required")
	}
	return &VoiceAllocator{store: store, now: time.Now, newID: randomVoiceID}, nil
}

func (allocator *VoiceAllocator) ResolveMaster(ctx context.Context) (VoiceAssignment, error) {
	selection, err := allocator.store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return VoiceAssignment{}, err
	}
	defaultVoice := VoiceID(SynthesisVoice)
	if selection == nil {
		now := allocator.timestamp()
		voice := string(defaultVoice)
		selection = &conversation.MasterVoiceSelection{
			Selection:        conversation.PresentationSelectionExact,
			RequestedVoiceID: &voice, ResolvedVoiceID: &voice, UpdatedAt: now,
		}
		if err := allocator.persistMaster(ctx, *selection); err != nil {
			return VoiceAssignment{}, err
		}
	}
	if selection.ResolvedVoiceID == nil || !supportedVoice(VoiceID(*selection.ResolvedVoiceID)) {
		if selection.Selection == conversation.PresentationSelectionExact {
			return VoiceAssignment{}, fmt.Errorf("configured master voice is unavailable")
		}
		resolved := string(defaultVoice)
		selection.ResolvedVoiceID = &resolved
		selection.Reuse = nil
		selection.UpdatedAt = timestampAfter(selection.UpdatedAt, allocator.timestamp())
		if err := allocator.persistMaster(ctx, *selection); err != nil {
			return VoiceAssignment{}, err
		}
	}
	return voiceAssignment(VoiceID(*selection.ResolvedVoiceID), selection.Reuse), nil
}

func (allocator *VoiceAllocator) ResolveNarrator(ctx context.Context, conversationID string, activeConversationIDs []string) (VoiceAssignment, error) {
	record, err := allocator.store.ReadConversation(ctx, conversationID)
	if err != nil {
		return VoiceAssignment{}, err
	}
	snapshot, err := allocator.store.ReadSnapshot(ctx, record.WorkspaceID, conversationID)
	if err != nil {
		return VoiceAssignment{}, err
	}
	profile := snapshot.PresentationProfile
	if profile.ResolvedNarratorVoiceID != nil && supportedVoice(VoiceID(*profile.ResolvedNarratorVoiceID)) {
		return voiceAssignment(VoiceID(*profile.ResolvedNarratorVoiceID), profile.NarratorVoiceReuse), nil
	}
	master, err := allocator.ResolveMaster(ctx)
	if err != nil {
		return VoiceAssignment{}, err
	}
	resolved, reuse, err := allocator.chooseNarrator(ctx, profile, master.VoiceID, activeConversationIDs)
	if err != nil {
		return VoiceAssignment{}, err
	}
	voice := string(resolved)
	profile.ResolvedNarratorVoiceID = &voice
	profile.NarratorVoiceReuse = reuse
	profile.UpdatedAt = timestampAfter(profile.UpdatedAt, allocator.timestamp())
	if err := allocator.persistNarrator(ctx, snapshot.Conversation, profile); err != nil {
		return VoiceAssignment{}, err
	}
	return voiceAssignment(resolved, reuse), nil
}

func (allocator *VoiceAllocator) chooseNarrator(ctx context.Context, profile conversation.ConversationPresentationProfile, master VoiceID, activeConversationIDs []string) (VoiceID, *conversation.PresentationReuse, error) {
	if profile.NarratorVoiceSelection == conversation.PresentationSelectionExact {
		if profile.RequestedNarratorVoiceID == nil {
			return "", nil, errors.New("exact narrator voice selection has no requested voice")
		}
		voice := VoiceID(*profile.RequestedNarratorVoiceID)
		if !supportedVoice(voice) {
			return "", nil, fmt.Errorf("requested narrator voice %q is unavailable", voice)
		}
		return voice, nil, nil
	}
	profiles, err := allocator.store.ListPresentationProfiles(ctx)
	if err != nil {
		return "", nil, err
	}
	active := stringSet(activeConversationIDs)
	used := map[VoiceID][]string{}
	for _, candidate := range profiles {
		if candidate.ConversationID == profile.ConversationID || !active[candidate.ConversationID] || candidate.ResolvedNarratorVoiceID == nil {
			continue
		}
		voice := VoiceID(*candidate.ResolvedNarratorVoiceID)
		used[voice] = append(used[voice], candidate.ConversationID)
	}
	catalog := VoiceCatalog()
	for _, voice := range catalog {
		if voice != master && len(used[voice]) == 0 {
			return voice, nil, nil
		}
	}
	selected := leastUsedNarratorVoice(catalog, master, used)
	conflicts := append([]string{}, used[selected]...)
	sort.Strings(conflicts)
	reuse := &conversation.PresentationReuse{
		Reason:           conversation.PresentationReuseCatalogExhausted,
		ResolvedChoiceID: string(selected), ConflictingConversationIDs: conflicts,
	}
	return selected, reuse, nil
}

func leastUsedNarratorVoice(catalog []VoiceID, master VoiceID, used map[VoiceID][]string) VoiceID {
	var selected VoiceID
	for _, voice := range catalog {
		if voice == master {
			continue
		}
		if selected == "" || len(used[voice]) < len(used[selected]) {
			selected = voice
		}
	}
	return selected
}

func (allocator *VoiceAllocator) persistMaster(ctx context.Context, selection conversation.MasterVoiceSelection) error {
	id, err := allocator.newID("master_voice_event")
	if err != nil {
		return err
	}
	_, err = allocator.store.Transact(ctx, "persist master voice selection", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpsertMasterVoiceSelection(selection); err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID: id, StreamID: "speech:master", Kind: "speech.master_voice.updated",
			Payload: selection, CommittedAt: selection.UpdatedAt,
		})
		return err
	})
	return err
}

func (allocator *VoiceAllocator) persistNarrator(ctx context.Context, owner conversation.TopicConversation, profile conversation.ConversationPresentationProfile) error {
	id, err := allocator.newID("conversation_voice_event")
	if err != nil {
		return err
	}
	_, err = allocator.store.Transact(ctx, "persist narrator voice assignment", func(transaction *conversation.WriteTransaction) error {
		if err := transaction.UpsertConversationPresentationProfile(profile); err != nil {
			return err
		}
		streamID, err := conversation.ConversationStreamID(owner.ID)
		if err != nil {
			return err
		}
		_, err = transaction.AppendCommittedEvent(conversation.CommittedEventDraft{
			ID: id, StreamID: streamID, Kind: string(conversation.ConversationEventTypePresentationProfileUpdated),
			Payload: conversation.ConversationPresentationProfileUpdatedEventPayload{
				Type: conversation.ConversationEventTypePresentationProfileUpdated, Profile: profile,
			},
			CommittedAt: profile.UpdatedAt,
		})
		return err
	})
	return err
}

func voiceAssignment(voice VoiceID, reuse *conversation.PresentationReuse) VoiceAssignment {
	assignment := VoiceAssignment{
		VoiceID: voice, CatalogVersion: VoiceCatalogVersion(),
		ConflictingConversationIDs: []string{},
	}
	if reuse != nil {
		reason := string(reuse.Reason)
		assignment.Reused = true
		assignment.ReuseReason = &reason
		assignment.ConflictingConversationIDs = append([]string{}, reuse.ConflictingConversationIDs...)
	}
	return assignment
}

func stringSet(values []string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func (allocator *VoiceAllocator) timestamp() string {
	return allocator.now().UTC().Format(time.RFC3339Nano)
}

func timestampAfter(previous string, candidate string) string {
	previousTime, previousErr := time.Parse(time.RFC3339Nano, previous)
	candidateTime, candidateErr := time.Parse(time.RFC3339Nano, candidate)
	if previousErr == nil && (candidateErr != nil || !candidateTime.After(previousTime)) {
		return previousTime.Add(time.Nanosecond).Format(time.RFC3339Nano)
	}
	return candidate
}

func randomVoiceID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}
