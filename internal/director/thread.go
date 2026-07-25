package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/conversation"
)

// The Director's persistent Codex conversation.
//
// The Director is one long-running thread the user talks to, not a fresh
// classifier turn per request. It keeps its history, it answers in prose when
// prose is the right answer, and it changes the app by calling `setta` tools.
// That is the whole product model: Setta supplies authority and durability,
// Codex supplies the conversation.
//
// Setta owns the history rather than the provider. Codex attaches dynamic tools
// when a thread starts and does not carry them into a resumed thread, so a
// Director resumed after a restart would come back able to talk and unable to
// act. Setta therefore keeps every Director turn durably and re-establishes the
// provider thread from that history on the first turn of each app run, which is
// also the only way the tools are guaranteed to be attached.
//
// One turn runs at a time. Tool calls inside a turn commit durable facts and
// mutate app-wide selection, so two Director turns interleaving would let the
// second act on state the first had not finished writing.

// MaxDirectorReplayEntries bounds how much of the Director conversation one new
// provider thread is re-established with. It is a product bound rather than a
// storage one: the Director needs recent continuity, not a transcript that
// grows with the profile forever.
const MaxDirectorReplayEntries = 200

// MaxDirectorReplyBytes bounds what the Director says in one turn. The reply is
// conversation rather than a durable app action, so its bound belongs here
// beside the turn that produces it.
const MaxDirectorReplyBytes = 64 * 1024

// DirectorProviderThread is the provider thread now carrying the Director
// conversation.
type DirectorProviderThread struct {
	ThreadID string
	Model    string
}

// DirectorThreadHistoryItem is one line of Director history replayed into a new
// provider thread.
type DirectorThreadHistoryItem struct {
	// TurnID keeps replay trimming atomic: when the role's input budget drops
	// old history, it drops a whole turn rather than leaving a receipt or reply
	// without the user request it belongs to.
	TurnID string
	// Assistant reports whether the Director said it. Everything else — the
	// user's words and Setta's own tool receipts — is replayed as user input,
	// because that is what the Director was responding to.
	Assistant bool
	Text      string
}

// DirectorThreadStart is one request to establish the Director provider thread.
type DirectorThreadStart struct {
	Instructions string
	Tools        []SettaTool
	History      []DirectorThreadHistoryItem
}

// DirectorTurnRequest is one user turn on the established thread.
type DirectorTurnRequest struct {
	ThreadID string
	TurnID   string
	Text     string
	Tools    []SettaTool
}

// DirectorThreadPort is the consumer-owned half of the Director's provider
// boundary. Provider identity, credentials, models, and accounting stay behind
// it; what crosses is a tool catalog the Director owns and the text of one
// turn.
type DirectorThreadPort interface {
	StartDirectorThread(context.Context, DirectorThreadStart) (DirectorProviderThread, error)
	// RunDirectorTurn runs one turn to completion and returns the assistant
	// text it produced. Tool calls reach their handlers during the turn.
	RunDirectorTurn(context.Context, DirectorTurnRequest) (string, error)
}

// DirectorConversationStore is the durable home of the Director conversation.
type DirectorConversationStore interface {
	ReadDirectorThread(context.Context) (conversation.DirectorThreadRecord, bool, error)
	BindDirectorThread(context.Context, conversation.DirectorThreadRecord) error
	AppendDirectorConversation(context.Context, []conversation.DirectorConversationEntry) error
	ReadRecentDirectorConversation(context.Context, int) ([]conversation.DirectorConversationEntry, error)
}

// DirectorToolCall is one Setta tool the Director called during a turn, and
// what it reported back.
type DirectorToolCall struct {
	Tool      string `json:"tool"`
	Succeeded bool   `json:"succeeded"`
	// Summary is the public sentence the call produced, or the specific reason
	// it could not run. Both are text the Director may repeat to the user.
	Summary              string  `json:"summary"`
	WorkstreamID         *string `json:"workstreamId"`
	SelectedWorkstreamID *string `json:"selectedWorkstreamId"`
}

// DirectorTurnReceipt is what one Director turn produced. The durable changes
// reach the shell on the pushed stream like every other change, so the receipt
// carries only the conversation: what the Director said, and which Setta tools
// it called saying it.
type DirectorTurnReceipt struct {
	IntentID  string             `json:"intentId"`
	ReplyText string             `json:"replyText"`
	ToolCalls []DirectorToolCall `json:"toolCalls"`
}

// Validate proves the receipt describes a turn that actually happened.
func (receipt DirectorTurnReceipt) Validate() error {
	if err := validateIdentifier("director turn intent id", receipt.IntentID); err != nil {
		return err
	}
	if receipt.ToolCalls == nil {
		return errors.New("director turn tool calls must be an array")
	}
	if receipt.ReplyText == "" && len(receipt.ToolCalls) == 0 {
		return fmt.Errorf("director turn %s neither answered nor acted", receipt.IntentID)
	}
	if receipt.ReplyText != "" && len(receipt.ReplyText) > MaxDirectorReplyBytes {
		return fmt.Errorf("director reply exceeds %d bytes", MaxDirectorReplyBytes)
	}
	for index, call := range receipt.ToolCalls {
		if err := validateIdentifier("director tool call name", call.Tool); err != nil {
			return fmt.Errorf("director turn tool call[%d]: %w", index, err)
		}
		if err := validateTrimmedText("director tool call summary", call.Summary); err != nil {
			return fmt.Errorf("director turn tool call[%d]: %w", index, err)
		}
	}
	return nil
}

// DirectorThread runs the Director conversation.
type DirectorThread struct {
	toolbox  *SettaToolbox
	store    DirectorConversationStore
	provider DirectorThreadPort
	now      func() time.Time
	newID    func(string) (string, error)

	// turnMutex serializes Director turns. established is written under it, so
	// the provider thread is established exactly once per app run.
	turnMutex   sync.Mutex
	established *conversation.DirectorThreadRecord
}

// DirectorThreadOption configures the Director conversation.
type DirectorThreadOption func(*DirectorThread) error

// WithDirectorThreadClock replaces the clock durable Director entries are
// stamped with.
func WithDirectorThreadClock(now func() time.Time) DirectorThreadOption {
	return func(thread *DirectorThread) error {
		if now == nil {
			return errors.New("director thread clock must not be nil")
		}
		thread.now = now
		return nil
	}
}

// WithDirectorThreadIdentity replaces the generator that mints durable entry
// ids.
func WithDirectorThreadIdentity(newID func(string) (string, error)) DirectorThreadOption {
	return func(thread *DirectorThread) error {
		if newID == nil {
			return errors.New("director thread identity generator must not be nil")
		}
		thread.newID = newID
		return nil
	}
}

// NewDirectorThread builds the Director conversation over trusted state, the
// durable store, and the provider port.
func NewDirectorThread(
	registry *Registry,
	executor *DecisionExecutor,
	store DirectorConversationStore,
	provider DirectorThreadPort,
	options ...DirectorThreadOption,
) (*DirectorThread, error) {
	if registry == nil || executor == nil || store == nil || provider == nil {
		return nil, errors.New(
			"director thread requires the registry, the executor, the durable store, and the provider port",
		)
	}
	toolbox, err := NewSettaToolbox(registry, executor)
	if err != nil {
		return nil, err
	}
	thread := &DirectorThread{
		toolbox:  toolbox,
		store:    store,
		provider: provider,
		now:      time.Now,
		newID:    randomDirectorFactID,
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("director thread option must not be nil")
		}
		if err := option(thread); err != nil {
			return nil, err
		}
	}
	return thread, nil
}

// Submit runs one user request as a turn of the Director conversation.
func (thread *DirectorThread) Submit(
	ctx context.Context,
	intent SubmittedIntent,
) (DirectorTurnReceipt, error) {
	if thread == nil || thread.provider == nil || thread.store == nil {
		return DirectorTurnReceipt{}, ErrDirectorUnavailable
	}
	if ctx == nil {
		return DirectorTurnReceipt{}, errors.New("director turn context is required")
	}
	if err := validateSubmittedIntent(intent); err != nil {
		return DirectorTurnReceipt{}, fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
	}
	thread.turnMutex.Lock()
	defer thread.turnMutex.Unlock()
	tools, err := thread.toolbox.Tools(intent)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	recorder := &directorToolRecorder{
		persistence: directorToolPersistence{
			begin: func(callContext context.Context, tool string, arguments json.RawMessage) (string, error) {
				return thread.persistToolCall(context.WithoutCancel(callContext), intent, tool, arguments)
			},
			finish: func(
				callContext context.Context,
				callID string,
				receipt SettaToolReceipt,
				succeeded bool,
			) error {
				return thread.persistToolReceipt(
					context.WithoutCancel(callContext),
					intent,
					callID,
					receipt,
					succeeded,
				)
			},
		},
	}
	recorded := recorder.instrument(tools)
	record, err := thread.establish(ctx, recorded)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	if err := thread.persistUserTurn(ctx, intent); err != nil {
		return DirectorTurnReceipt{}, err
	}
	reply, err := thread.provider.RunDirectorTurn(ctx, DirectorTurnRequest{
		ThreadID: record.ThreadID,
		TurnID:   intent.ID,
		Text:     intent.Text,
		Tools:    recorded,
	})
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	return thread.finishTurn(ctx, intent, record, strings.TrimSpace(reply), recorder)
}

// finishTurn makes the Director's reply durable and reports the turn. The reply
// is a conversation entry and nothing else: it is what the next turn is
// re-established from, what the graph draws as the Director's answer, and what
// the spoken reply is read out of, so a second durable record of the same
// sentence could only disagree with it.
func (thread *DirectorThread) finishTurn(
	ctx context.Context,
	intent SubmittedIntent,
	record conversation.DirectorThreadRecord,
	reply string,
	recorder *directorToolRecorder,
) (DirectorTurnReceipt, error) {
	receipt := DirectorTurnReceipt{
		IntentID:  intent.ID,
		ReplyText: reply,
		ToolCalls: recorder.calls(),
	}
	if err := receipt.Validate(); err != nil {
		return DirectorTurnReceipt{}, err
	}
	if reply == "" {
		return receipt, nil
	}
	entry, err := thread.textEntry(
		conversation.DirectorConversationAssistantText,
		intent.ID,
		thread.now().UTC().Format(time.RFC3339Nano),
		reply,
	)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	entry.Text.Model = &conversation.DirectorConversationModel{
		Provider: record.Provider,
		Model:    record.Model,
		ThreadID: record.ThreadID,
	}
	if err := thread.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry}); err != nil {
		return DirectorTurnReceipt{}, err
	}
	return receipt, nil
}

// persistUserTurn records the request before the provider is asked to serve it.
// The user said it first, so the conversation says so first: a provider failure
// then leaves a request nothing answered rather than erasing that it was made.
func (thread *DirectorThread) persistUserTurn(ctx context.Context, intent SubmittedIntent) error {
	entry, err := thread.textEntry(
		conversation.DirectorConversationUserTurn,
		intent.ID,
		thread.now().UTC().Format(time.RFC3339Nano),
		intent.Text,
	)
	if err != nil {
		return err
	}
	return thread.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry})
}

// persistToolCall commits a call before its handler runs and returns the entry
// id its receipt answers.
func (thread *DirectorThread) persistToolCall(
	ctx context.Context,
	intent SubmittedIntent,
	tool string,
	arguments json.RawMessage,
) (string, error) {
	entry, err := thread.newEntry(
		conversation.DirectorConversationToolCall,
		intent.ID,
		thread.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return "", err
	}
	entry.Tool = &conversation.DirectorConversationToolActivity{
		Tool:    tool,
		Payload: arguments,
	}
	if err := thread.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry}); err != nil {
		return "", err
	}
	return entry.ID, nil
}

// persistToolReceipt commits what the call reported, verbatim. Replaying the
// conversation reproduces what the Director was actually told rather than a
// re-rendered summary of it.
func (thread *DirectorThread) persistToolReceipt(
	ctx context.Context,
	intent SubmittedIntent,
	callID string,
	receipt SettaToolReceipt,
	succeeded bool,
) error {
	encoded, err := json.Marshal(receipt)
	if err != nil {
		return fmt.Errorf("encode setta tool receipt %s: %w", receipt.Tool, err)
	}
	entry, err := thread.newEntry(
		conversation.DirectorConversationToolReceipt,
		intent.ID,
		thread.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return err
	}
	entry.Tool = &conversation.DirectorConversationToolActivity{
		Tool:      receipt.Tool,
		Payload:   encoded,
		Succeeded: succeeded,
		CallID:    &callID,
	}
	return thread.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry})
}

// establish returns the provider thread this app run's Director turns run on,
// starting it from the durable conversation the first time it is needed.
func (thread *DirectorThread) establish(
	ctx context.Context,
	tools []SettaTool,
) (conversation.DirectorThreadRecord, error) {
	if thread.established != nil {
		return *thread.established, nil
	}
	history, err := thread.replayHistory(ctx)
	if err != nil {
		return conversation.DirectorThreadRecord{}, err
	}
	started, err := thread.provider.StartDirectorThread(ctx, DirectorThreadStart{
		Instructions: DirectorThreadInstructions(),
		Tools:        tools,
		History:      history,
	})
	if err != nil {
		return conversation.DirectorThreadRecord{}, err
	}
	record := conversation.DirectorThreadRecord{
		Provider:  conversation.ProviderCodex,
		ThreadID:  started.ThreadID,
		Model:     started.Model,
		StartedAt: thread.now().UTC().Format(time.RFC3339Nano),
	}
	if err := thread.store.BindDirectorThread(ctx, record); err != nil {
		return conversation.DirectorThreadRecord{}, err
	}
	thread.established = &record
	return record, nil
}

// replayHistory turns the durable Director conversation back into the turns a
// new provider thread is started with. Tool calls are replayed as their
// receipts, because what the Director needs to remember is what Setta did, not
// how the call was encoded.
func (thread *DirectorThread) replayHistory(
	ctx context.Context,
) ([]DirectorThreadHistoryItem, error) {
	entries, err := thread.store.ReadRecentDirectorConversation(ctx, MaxDirectorReplayEntries)
	if err != nil {
		return nil, err
	}
	// The entry limit may land inside a turn. Drop that incomplete prefix so a
	// new provider thread never sees a tool receipt or assistant reply without
	// the user turn it answered.
	for len(entries) > 0 && entries[0].Kind != conversation.DirectorConversationUserTurn {
		entries = entries[1:]
	}
	history := make([]DirectorThreadHistoryItem, 0, len(entries))
	for _, entry := range entries {
		switch entry.Kind {
		case conversation.DirectorConversationUserTurn:
			history = append(history, DirectorThreadHistoryItem{
				TurnID: entry.TurnID,
				Text:   entry.Text.Text,
			})
		case conversation.DirectorConversationAssistantText:
			history = append(history, DirectorThreadHistoryItem{
				TurnID:    entry.TurnID,
				Assistant: true,
				Text:      entry.Text.Text,
			})
		case conversation.DirectorConversationToolReceipt:
			history = append(history, DirectorThreadHistoryItem{
				TurnID: entry.TurnID,
				Text:   fmt.Sprintf("Setta tool %s.%s reported: %s", SettaToolNamespace, entry.Tool.Tool, entry.Tool.Payload),
			})
		case conversation.DirectorConversationToolCall:
			// The call is durable so the app can explain what the Director did;
			// replaying it would tell the thread to act again.
			continue
		default:
			return nil, fmt.Errorf("unknown director conversation entry kind %q", entry.Kind)
		}
	}
	return history, nil
}

func (thread *DirectorThread) textEntry(
	kind conversation.DirectorConversationEntryKind,
	turnID string,
	recordedAt string,
	text string,
) (conversation.DirectorConversationEntry, error) {
	entry, err := thread.newEntry(kind, turnID, recordedAt)
	if err != nil {
		return conversation.DirectorConversationEntry{}, err
	}
	entry.Text = &conversation.DirectorConversationText{Text: text}
	return entry, nil
}

func (thread *DirectorThread) newEntry(
	kind conversation.DirectorConversationEntryKind,
	turnID string,
	recordedAt string,
) (conversation.DirectorConversationEntry, error) {
	id, err := thread.newID("director-entry")
	if err != nil {
		return conversation.DirectorConversationEntry{}, err
	}
	return conversation.DirectorConversationEntry{
		ID:         id,
		Kind:       kind,
		TurnID:     turnID,
		RecordedAt: recordedAt,
	}, nil
}
