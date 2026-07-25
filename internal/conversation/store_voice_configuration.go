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

func (store *Store) EnsureDirectorVoiceSelection(
	ctx context.Context,
	initial speech.DirectorVoiceSelection,
) (speech.DirectorVoiceSelection, error) {
	if store == nil {
		return speech.DirectorVoiceSelection{}, errors.New("conversation store is required")
	}
	if err := initial.Validate(); err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	var selection speech.DirectorVoiceSelection
	initialized := false
	reuseJSON, err := encodeOptionalJSONColumn("initial director voice reuse", initial.Reuse)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	err = store.write(ctx, "initialize director voice selection", func(ctx context.Context, tx *sql.Tx) error {
		stored, selectionFound, markerFound, err := inspectDirectorVoiceSelectionState(
			ctx,
			tx,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveDirectorVoiceSelectionState(
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
INSERT INTO director_voice_selection (
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
		selection = speech.CloneDirectorVoiceSelection(initial)
		if err := appendDirectorVoiceSelectionInitialization(ctx, tx, selection); err != nil {
			return err
		}
		initialized = true
		return nil
	})
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	if initialized {
		store.notifyCommittedEvents()
	}
	return speech.CloneDirectorVoiceSelection(selection), nil
}

func (store *Store) ReadDirectorVoiceSelection(
	ctx context.Context,
) (speech.DirectorVoiceSelection, error) {
	if store == nil {
		return speech.DirectorVoiceSelection{}, errors.New("conversation store is required")
	}
	var selection speech.DirectorVoiceSelection
	err := store.read(ctx, "read director voice selection", func(ctx context.Context, reader *sql.Conn) error {
		stored, selectionFound, markerFound, err := inspectDirectorVoiceSelectionState(
			ctx,
			reader,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		existing, err := resolveDirectorVoiceSelectionState(
			stored,
			selectionFound,
			markerFound,
			store.dbPath,
		)
		if err != nil {
			return err
		}
		if existing == nil {
			return corruptDirectorVoiceConfiguration(store.dbPath, "director voice selection is missing")
		}
		selection = *existing
		return nil
	})
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	return speech.CloneDirectorVoiceSelection(selection), nil
}

func (store *Store) UpdateDirectorVoiceSelection(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
	updatedAt string,
) (speech.DirectorVoiceSelection, error) {
	if ctx == nil {
		return speech.DirectorVoiceSelection{}, errors.New("director voice selection update context is required")
	}
	if err := request.Validate(); err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	var result speech.DirectorVoiceSelection
	err := store.withPresentationConfigurationLock(func() error {
		var err error
		result, err = store.updateDirectorVoiceSelectionLocked(ctx, request, updatedAt)
		return err
	})
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	return speech.CloneDirectorVoiceSelection(result), nil
}

func (store *Store) updateDirectorVoiceSelectionLocked(
	ctx context.Context,
	request speech.VoiceSelectionRequest,
	updatedAt string,
) (speech.DirectorVoiceSelection, error) {
	current, err := store.ReadDirectorVoiceSelection(ctx)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	if directorVoiceSelectionMatchesRequest(current, request) {
		return current, nil
	}
	presentations, err := store.readConversationPresentations(ctx)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	resolved, err := speech.ResolveDirectorVoiceSelection(
		request,
		narratorVoiceAssignments(presentations, nil),
		advanceTimestamp(current.UpdatedAt, updatedAt),
	)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	updates, err := narratorUpdatesForDirectorVoice(
		presentations,
		*resolved.ResolvedVoiceID,
		resolved.UpdatedAt,
	)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	resolved.Reuse = directorVoiceReuseAfterNarratorUpdates(
		presentations,
		updates,
		*resolved.ResolvedVoiceID,
	)
	if err := resolved.Validate(); err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	profilePublications, err := store.prepareDirectorVoiceProfilePublications(updates)
	if err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	if err := store.commitDirectorVoiceUpdate(
		ctx,
		current,
		resolved,
		updates,
		profilePublications,
		speech.DirectorVoiceSelectionUpdateUserOverride,
	); err != nil {
		return speech.DirectorVoiceSelection{}, err
	}
	return resolved, nil
}

func (store *Store) prepareDirectorVoiceProfilePublications(
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

func (store *Store) commitDirectorVoiceUpdate(
	ctx context.Context,
	current speech.DirectorVoiceSelection,
	resolved speech.DirectorVoiceSelection,
	updates []ConversationPresentationProfile,
	profilePublications []preparedPublication,
	reason speech.DirectorVoiceSelectionUpdateReason,
) error {
	directorEventID, err := randomServiceID("speech_event")
	if err != nil {
		return err
	}
	selectionUpdate := speech.NewDirectorVoiceSelectionUpdate(current, resolved, reason)
	if err := selectionUpdate.Validate(); err != nil {
		return err
	}
	_, err = store.Transact(ctx, "update director voice configuration", func(transaction *WriteTransaction) error {
		if err := transaction.UpdateDirectorVoiceSelection(current.UpdatedAt, resolved); err != nil {
			return err
		}
		for _, update := range updates {
			if err := transaction.UpsertConversationPresentationProfile(update); err != nil {
				return err
			}
		}
		if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
			ID:          directorEventID,
			StreamID:    speech.DirectorVoiceSelectionStreamID,
			Kind:        speech.DirectorVoiceSelectionUpdatedEventKind,
			Payload:     selectionUpdate,
			CommittedAt: resolved.UpdatedAt,
		}); err != nil {
			return err
		}
		return appendPublications(transaction, profilePublications)
	})
	return err
}

func directorVoiceSelectionMatchesRequest(
	selection speech.DirectorVoiceSelection,
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

func narratorUpdatesForDirectorVoice(
	presentations []activeConversationPresentation,
	directorVoiceID speech.SpeechVoiceID,
	updatedAt string,
) ([]ConversationPresentationProfile, error) {
	excluded := map[string]bool{}
	affected := make([]ConversationPresentationProfile, 0)
	for _, presentation := range presentations {
		profile := presentation.Profile
		if !presentation.NarratorActive ||
			profile.NarratorVoiceSelection != speech.VoiceSelectionAutoDistinct ||
			profile.ResolvedNarratorVoiceID == nil ||
			*profile.ResolvedNarratorVoiceID != directorVoiceID {
			continue
		}
		excluded[profile.ConversationID] = true
		affected = append(affected, profile)
	}
	assignments := narratorVoiceAssignments(presentations, excluded)
	updates := make([]ConversationPresentationProfile, 0, len(affected))
	for _, profile := range affected {
		allocation, err := speech.AllocateNarratorVoice(directorVoiceID, assignments)
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

func directorVoiceReuseAfterNarratorUpdates(
	presentations []activeConversationPresentation,
	updates []ConversationPresentationProfile,
	directorVoiceID speech.SpeechVoiceID,
) *speech.VoiceReuse {
	updatedByConversationID := make(map[string]ConversationPresentationProfile, len(updates))
	for _, update := range updates {
		updatedByConversationID[update.ConversationID] = update
	}
	final := make([]activeConversationPresentation, 0, len(presentations))
	for _, presentation := range presentations {
		if update, ok := updatedByConversationID[presentation.Profile.ConversationID]; ok {
			presentation = presentation.withProfile(update)
		}
		final = append(final, presentation)
	}
	return speech.VoiceReuseForAssignments(directorVoiceID, narratorVoiceAssignments(final, nil))
}

type directorVoiceSelectionQuery interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func inspectDirectorVoiceSelectionState(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (speech.DirectorVoiceSelection, bool, bool, error) {
	selection, selectionFound, err := findDirectorVoiceSelectionRow(ctx, query, dbPath)
	if err != nil {
		return speech.DirectorVoiceSelection{}, false, false, err
	}
	markerFound, err := findDirectorVoiceSelectionInitialization(ctx, query, dbPath)
	if err != nil {
		return speech.DirectorVoiceSelection{}, false, false, err
	}
	return selection, selectionFound, markerFound, nil
}

func resolveDirectorVoiceSelectionState(
	selection speech.DirectorVoiceSelection,
	selectionFound bool,
	markerFound bool,
	dbPath string,
) (*speech.DirectorVoiceSelection, error) {
	switch {
	case selectionFound && markerFound:
		return &selection, nil
	case selectionFound:
		return nil, corruptDirectorVoiceConfiguration(
			dbPath,
			"director voice selection initialization event is missing",
		)
	case markerFound:
		return nil, corruptDirectorVoiceConfiguration(
			dbPath,
			"director voice selection is missing after initialization",
		)
	default:
		return nil, nil
	}
}

func findDirectorVoiceSelectionRow(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (speech.DirectorVoiceSelection, bool, error) {
	var selection speech.DirectorVoiceSelection
	var requestedVoiceID sql.NullString
	var resolvedVoiceID sql.NullString
	var reuseJSON sql.NullString
	err := query.QueryRowContext(ctx, `
SELECT selection, requested_voice_id, resolved_voice_id, reuse_json, updated_at
FROM director_voice_selection
WHERE singleton = 1
`).Scan(
		&selection.Selection,
		&requestedVoiceID,
		&resolvedVoiceID,
		&reuseJSON,
		&selection.UpdatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return speech.DirectorVoiceSelection{}, false, nil
	}
	if err != nil {
		return speech.DirectorVoiceSelection{}, false, err
	}
	selection.RequestedVoiceID = scannedSpeechVoiceID(requestedVoiceID)
	selection.ResolvedVoiceID = scannedSpeechVoiceID(resolvedVoiceID)
	if err := decodeOptionalJSON("director voice reuse", reuseJSON, &selection.Reuse); err != nil {
		return speech.DirectorVoiceSelection{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  err,
		}
	}
	if err := selection.Validate(); err != nil {
		return speech.DirectorVoiceSelection{}, false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode director voice selection: %w", err),
		}
	}
	return selection, true, nil
}

func findDirectorVoiceSelectionInitialization(
	ctx context.Context,
	query directorVoiceSelectionQuery,
	dbPath string,
) (bool, error) {
	var event CommittedEvent
	var payloadJSON string
	err := query.QueryRowContext(ctx, `
SELECT commit_sequence, id, stream_id, stream_sequence, kind, payload_json, committed_at
FROM committed_events
WHERE id = ?
`, speech.DirectorVoiceSelectionInitializedEventID).Scan(
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
			Err:  fmt.Errorf("director voice selection initialization event: %w", err),
		}
	}
	if event.StreamID != speech.DirectorVoiceSelectionStreamID || event.StreamSequence != 1 ||
		event.Kind != speech.DirectorVoiceSelectionInitializedEventKind {
		return false, corruptDirectorVoiceConfiguration(
			dbPath,
			"director voice selection initialization event has invalid identity",
		)
	}
	var initialization speech.DirectorVoiceSelectionInitialization
	decoder := json.NewDecoder(bytes.NewBufferString(payloadJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&initialization); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("decode director voice selection initialization event: %w", err),
		}
	}
	if err := initialization.Validate(); err != nil {
		return false, &CorruptStateError{
			Path: dbPath,
			Err:  fmt.Errorf("validate director voice selection initialization event: %w", err),
		}
	}
	if event.CommittedAt != initialization.Selection.UpdatedAt {
		return false, corruptDirectorVoiceConfiguration(
			dbPath,
			"director voice selection initialization event timestamp does not match its selection",
		)
	}
	return true, nil
}

func appendDirectorVoiceSelectionInitialization(
	ctx context.Context,
	tx *sql.Tx,
	selection speech.DirectorVoiceSelection,
) error {
	transaction := &WriteTransaction{ctx: ctx, tx: tx, active: true}
	defer func() {
		transaction.active = false
	}()
	if err := transaction.recordStateMutation(); err != nil {
		return err
	}
	initialization := speech.NewDirectorVoiceSelectionInitialization(selection)
	if err := initialization.Validate(); err != nil {
		return err
	}
	if _, err := transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:          speech.DirectorVoiceSelectionInitializedEventID,
		StreamID:    speech.DirectorVoiceSelectionStreamID,
		Kind:        speech.DirectorVoiceSelectionInitializedEventKind,
		Payload:     initialization,
		CommittedAt: selection.UpdatedAt,
	}); err != nil {
		return err
	}
	return validateWriteTransactionResult(transaction)
}

func corruptDirectorVoiceConfiguration(dbPath string, message string) error {
	return &CorruptStateError{Path: dbPath, Err: errors.New(message)}
}

func scannedSpeechVoiceID(value sql.NullString) *speech.SpeechVoiceID {
	if !value.Valid {
		return nil
	}
	result := speech.SpeechVoiceID(value.String)
	return &result
}
