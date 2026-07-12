package conversation

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/speech"
)

var _ speech.VoiceConfigurationStore = (*Store)(nil)

func (store *Store) EnsureMasterVoiceSelection(
	ctx context.Context,
	initial speech.MasterVoiceSelection,
) (speech.MasterVoiceSelection, error) {
	if store == nil {
		return speech.MasterVoiceSelection{}, errors.New("conversation store is required")
	}
	if err := initial.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	var selection speech.MasterVoiceSelection
	initialized := false
	reuseJSON, err := encodeOptionalJSONColumn("initial master voice reuse", initial.Reuse)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	err = store.write(ctx, "initialize master voice selection", func(ctx context.Context, tx *sql.Tx) error {
		stored, selectionFound, markerFound, err := inspectMasterVoiceSelectionState(
			ctx,
			tx,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveMasterVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if existing != nil {
			selection = *existing
			return nil
		}
		if _, err := tx.ExecContext(ctx, `
INSERT INTO master_voice_selection (
  singleton, selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
) VALUES (1, ?, ?, ?, ?, ?)
`,
			initial.Selection,
			nullableString(voiceIDPointerString(initial.RequestedVoiceID)),
			nullableString(voiceIDPointerString(initial.ResolvedVoiceID)),
			reuseJSON,
			initial.UpdatedAt,
		); err != nil {
			return err
		}
		selection = speech.CloneMasterVoiceSelection(initial)
		if err := appendMasterVoiceSelectionInitialization(ctx, tx, selection); err != nil {
			return err
		}
		initialized = true
		return nil
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	if initialized {
		store.notifyCommittedEvents()
	}
	return speech.CloneMasterVoiceSelection(selection), nil
}

func (store *Store) ReadMasterVoiceSelection(
	ctx context.Context,
) (speech.MasterVoiceSelection, error) {
	if store == nil {
		return speech.MasterVoiceSelection{}, errors.New("conversation store is required")
	}
	var selection speech.MasterVoiceSelection
	err := store.read(ctx, "read master voice selection", func(ctx context.Context, reader *sql.Conn) error {
		stored, selectionFound, markerFound, err := inspectMasterVoiceSelectionState(
			ctx,
			reader,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveMasterVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if existing == nil {
			return corruptMasterVoiceConfiguration(store.dbPath, "master voice selection is missing")
		}
		selection = *existing
		return nil
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	return speech.CloneMasterVoiceSelection(selection), nil
}

func (store *Store) UpdateMasterVoiceSelection(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
	updatedAt string,
) (speech.MasterVoiceSelection, error) {
	if ctx == nil {
		return speech.MasterVoiceSelection{}, errors.New("master voice selection update context is required")
	}
	if err := request.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	var result speech.MasterVoiceSelection
	err := store.withPresentationConfigurationLock(func() error {
		var err error
		result, err = store.updateMasterVoiceSelectionLocked(ctx, request, updatedAt)
		return err
	})
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	return speech.CloneMasterVoiceSelection(result), nil
}

func (store *Store) updateMasterVoiceSelectionLocked(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
	updatedAt string,
) (speech.MasterVoiceSelection, error) {
	current, err := store.ReadMasterVoiceSelection(ctx)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	if masterVoiceSelectionMatchesRequest(current, request) {
		return current, nil
	}
	presentations, err := store.readActiveConversationPresentations(ctx)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	resolved, err := speech.ResolveMasterVoiceSelection(
		request,
		narratorVoiceAssignments(presentations, nil),
		advanceTimestamp(current.UpdatedAt, updatedAt),
	)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	updates, err := narratorUpdatesForMasterVoice(
		presentations,
		*resolved.ResolvedVoiceID,
		resolved.UpdatedAt,
	)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	resolved.Reuse = masterVoiceReuseAfterNarratorUpdates(
		presentations,
		updates,
		*resolved.ResolvedVoiceID,
	)
	if err := resolved.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	profilePublications, err := store.prepareMasterVoiceProfilePublications(updates)
	if err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	if err := store.commitMasterVoiceUpdate(
		ctx,
		current,
		resolved,
		updates,
		profilePublications,
		speech.MasterVoiceSelectionUpdateUserOverride,
	); err != nil {
		return speech.MasterVoiceSelection{}, err
	}
	return resolved, nil
}

func (store *Store) prepareMasterVoiceProfilePublications(
	updates []ConversationPresentationProfile,
) ([]preparedPublication, error) {
	publications := make([]preparedPublication, 0, len(updates))
	for _, update := range updates {
		eventID, err := randomServiceID("conversation_event")
		if err != nil {
			return nil, err
		}
		streamID, err := ConversationStreamID(update.ConversationID)
		if err != nil {
			return nil, err
		}
		publications = append(publications, preparedPublication{draft: CommittedEventDraft{
			ID:       eventID,
			StreamID: streamID,
			Kind:     string(ConversationEventTypePresentationProfileUpdated),
			Payload: ConversationPresentationProfileUpdatedEventPayload{
				Type:    ConversationEventTypePresentationProfileUpdated,
				Profile: update,
			},
			CommittedAt: update.UpdatedAt,
		}})
	}
	return publications, nil
}

func (store *Store) commitMasterVoiceUpdate(
	ctx context.Context,
	current speech.MasterVoiceSelection,
	resolved speech.MasterVoiceSelection,
	updates []ConversationPresentationProfile,
	profilePublications []preparedPublication,
	reason speech.MasterVoiceSelectionUpdateReason,
) error {
	masterEventID, err := randomServiceID("speech_event")
	if err != nil {
		return err
	}
	selectionUpdate := speech.NewMasterVoiceSelectionUpdate(current, resolved, reason)
	if err := selectionUpdate.Validate(); err != nil {
		return err
	}
	_, err = store.Transact(ctx, "update master voice configuration", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateMasterVoiceSelection(current.UpdatedAt, resolved); err != nil {
			return err
		}
		for _, update := range updates {
			if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
				return err
			}
		}
		if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          masterEventID,
			StreamID:    speech.MasterVoiceSelectionStreamID,
			Kind:        speech.MasterVoiceSelectionUpdatedEventKind,
			Payload:     selectionUpdate,
			CommittedAt: resolved.UpdatedAt,
		}); err != nil {
			return err
		}
		return appendPublications(transaction, profilePublications)
	})
	return err
}

func masterVoiceSelectionMatchesRequest(
	selection speech.MasterVoiceSelection,
	request speech.VoiceSelectionRequest,
) bool {
	if selection.Selection != request.Selection {
		return false
	}
	if request.Selection == speech.VoiceSelectionAutoDistinct {
		return true
	}
	return voiceIDsEqual(selection.RequestedVoiceID, request.RequestedVoiceID)
}

func narratorUpdatesForMasterVoice(
	presentations []activeConversationPresentation,
	masterVoiceID speech.SpeechVoiceID,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	excluded := map[string]bool{}
	affected := make([]ConversationPresentationProfile, 0)
	for _, presentation := range presentations {
		profile := presentation.Profile
		if profile.NarratorVoiceSelection != speech.VoiceSelectionAutoDistinct ||
			profile.ResolvedNarratorVoiceID == nil ||
			*profile.ResolvedNarratorVoiceID != masterVoiceID {
			continue
		}
		excluded[profile.ConversationID] = true
		affected = append(affected, profile)
	}
	assignments := narratorVoiceAssignments(presentations, excluded)
	updates := make([]ConversationPresentationProfile, 0, len(affected))
	for _, profile := range affected {
		allocation, err := speech.AllocateNarratorVoice(masterVoiceID, assignments)
		if err != nil {
			return nil, err
		}
		profile.ResolvedNarratorVoiceID = voiceIDPointer(allocation.VoiceID)
		profile.NarratorVoiceReuse = presentationReuseFromVoiceAllocation(allocation)
		profile.UpdatedAt = advanceTimestamp(profile.UpdatedAt, updatedAt)
		if err := profile.Validate(); err != nil {
			return nil, err
		}
		updates = append(updates, profile)
		assignments = append(assignments, narratorVoiceAssignment(profile))
	}
	return updates, nil
}

func masterVoiceReuseAfterNarratorUpdates(
	presentations []activeConversationPresentation,
	updates []ConversationPresentationProfile,
	masterVoiceID speech.SpeechVoiceID,
) *speech.VoiceReuse {
	updatedByConversationID := make(map[string]ConversationPresentationProfile, len(updates))
	for _, update := range updates {
		updatedByConversationID[update.ConversationID] = update
	}
	final := make([]activeConversationPresentation, 0, len(presentations))
	for _, presentation := range presentations {
		if update, ok := updatedByConversationID[presentation.Profile.ConversationID]; ok {
			presentation.Profile = update
		}
		final = append(final, presentation)
	}
	return speech.VoiceReuseForAssignments(masterVoiceID, narratorVoiceAssignments(final, nil))
}

type masterVoiceSelectionQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func inspectMasterVoiceSelectionState(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (speech.MasterVoiceSelection, bool, bool, error) {
	selection, selectionFound, err := findMasterVoiceSelectionRow(ctx, query, dbPath)
	if err != nil {
		return speech.MasterVoiceSelection{}, false, false, err
	}
	markerFound, err := findMasterVoiceSelectionInitialization(ctx, query, dbPath)
	if err != nil {
		return speech.MasterVoiceSelection{}, false, false, err
	}
	return selection, selectionFound, markerFound, nil
}

func resolveMasterVoiceSelectionState(
	selection speech.MasterVoiceSelection,
	selectionFound bool,
	markerFound bool,
	dbPath string,
) (*speech.MasterVoiceSelection, error) {
	switch {
	case selectionFound && markerFound:
		return &selection, nil
	case selectionFound:
		return nil, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event is missing",
		)
	case markerFound:
		return nil, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection is missing after initialization",
		)
	default:
		return nil, nil
	}
}

func findMasterVoiceSelectionRow(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (speech.MasterVoiceSelection, bool, error) {
	var selection speech.MasterVoiceSelection
	var requestedVoiceID sql.NullString
	var resolvedVoiceID sql.NullString
	var reuseJSON sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
FROM master_voice_selection
WHERE singleton = 1
`).Scan(
		&selection.Selection,
		&requestedVoiceID,
		&resolvedVoiceID,
		&reuseJSON,
		&selection.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return speech.MasterVoiceSelection{}, false, nil
	}
	if err != nil {
		return speech.MasterVoiceSelection{}, false, err
	}
	selection.RequestedVoiceID = scannedSpeechVoiceID(requestedVoiceID)
	selection.ResolvedVoiceID = scannedSpeechVoiceID(resolvedVoiceID)
	if err := decodeOptionalJSON("master voice reuse", reuseJSON, &selection.Reuse); err != nil {
		return speech.MasterVoiceSelection{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  err,
		}
	}
	if err := selection.Validate(); err != nil {
		return speech.MasterVoiceSelection{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master voice selection: %w", err),
		}
	}
	return selection, true, nil
}

func findMasterVoiceSelectionInitialization(
	ctx context.Context,
	query masterVoiceSelectionQuery,
	dbPath string,
) (bool, error) {
	var event CommittedEvent
	var payloadJSON string
	err := query.QueryRowContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE id = ?
`, speech.MasterVoiceSelectionInitializedEventID).Scan(
		&event.CommitSequence,
		&event.ID,
		&event.StreamID,
		&event.StreamSequence,
		&event.Kind,
		&payloadJSON,
		&event.CommittedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	event.Payload = json.RawMessage(payloadJSON)
	if err := event.Validate(); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("master voice selection initialization event: %w", err),
		}
	}
	if event.StreamID != speech.MasterVoiceSelectionStreamID || event.StreamSequence != 1 ||
		event.Kind != speech.MasterVoiceSelectionInitializedEventKind {
		return false, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event has invalid identity",
		)
	}
	var initialization speech.MasterVoiceSelectionInitialization
	decoder := json.NewDecoder(bytes.NewBufferString(payloadJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&initialization); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode master voice selection initialization event: %w", err),
		}
	}
	if err := initialization.Validate(); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate master voice selection initialization event: %w", err),
		}
	}
	if event.CommittedAt != initialization.Selection.UpdatedAt {
		return false, corruptMasterVoiceConfiguration(
			dbPath,
			"master voice selection initialization event timestamp does not match its selection",
		)
	}
	return true, nil
}

func appendMasterVoiceSelectionInitialization(
	ctx context.Context,
	tx *sql.Tx,
	selection speech.MasterVoiceSelection,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	initialization := speech.NewMasterVoiceSelectionInitialization(selection)
	if err := initialization.Validate(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          speech.MasterVoiceSelectionInitializedEventID,
		StreamID:    speech.MasterVoiceSelectionStreamID,
		Kind:        speech.MasterVoiceSelectionInitializedEventKind,
		Payload:     initialization,
		CommittedAt: selection.UpdatedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func corruptMasterVoiceConfiguration(dbPath string, message string) error {
	return &CorruptStateError{Path: dbPath, Err: errors.New(message)}
}

func scannedSpeechVoiceID(value sql.NullString) *speech.SpeechVoiceID {
	if !value.Valid {
		return nil
	}
	result := speech.SpeechVoiceID(value.String)
	return &result
}
