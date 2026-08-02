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

// The Director's persistent Setta conversation.
//
// The Director is one long-running conversation the user talks to, not a fresh
// classifier turn per request. It keeps its history, it answers in prose when
// prose is the right answer, and it changes the app by calling `setta` tools.
// That is the whole product model: Setta supplies authority and durability,
// Codex supplies the conversation.
//
// Setta owns the history rather than the provider. The Director runs on an
// ephemeral carrier out of the shared carrier registry, exactly like every
// workstream conversation: the carrier is process-local, and Codex attaches
// dynamic tools when a thread starts and does not carry them into a resumed
// thread, so a Director that resumed a provider thread would come back able to
// talk and unable to act. Setta therefore keeps every Director turn durably and
// replays that history into a fresh carrier on the first turn of each app run.
//
// One turn runs at a time. Tool calls inside a turn commit durable facts and
// mutate app-wide selection, so two Director turns interleaving would let the
// second act on state the first had not finished writing.

// DirectorConversationID is the Director conversation's Setta identity. It is a
// constant because there is exactly one Director conversation per app profile:
// it keys the Director's carrier in the shared registry and names the Director
// in the provider runtime, so both agree on which conversation is running.
const DirectorConversationID = "director"

// MaxDirectorReplayEntries bounds how much of the Director conversation one new
// carrier is replayed with. It is a product bound rather than a storage one: the
// Director needs recent continuity, not a transcript that grows with the profile
// forever.
const MaxDirectorReplayEntries = 200

// MaxDirectorReplyBytes bounds what the Director says in one turn. The reply is
// conversation rather than a durable app action, so its bound belongs here
// beside the turn that produces it.
const MaxDirectorReplyBytes = 64 * 1024

// ErrDirectorCarrierLost reports that the provider no longer has the thread the
// Director was running on. The port classifies it, because which provider
// failures mean "this carrier is gone" is provider knowledge; what Setta does
// about it — drop the carrier so the next turn starts a fresh one — is not.
var ErrDirectorCarrierLost = errors.New("director carrier is no longer available")

// DirectorHistoryItem is one line of Director history replayed into a new
// carrier.
type DirectorHistoryItem struct {
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

// DirectorCarrierRequest is one request to start the Director's carrier.
type DirectorCarrierRequest struct {
	Instructions string
	Tools        []SettaTool
	History      []DirectorHistoryItem
}

// DirectorTurnRequest is one user turn on the established carrier. Carrier
// names both halves the provider call needs: the Setta conversation the turn
// belongs to, and the provider thread it currently runs on.
type DirectorTurnRequest struct {
	Carrier conversation.Carrier
	TurnID  string
	Text    string
	Tools   []SettaTool
}

// DirectorProviderTurn is the provider-authored result of one turn. The
// resolved invocation is minted before provider work starts and completed with
// the provider turn reference, so eval accounting and durable provenance name
// the same call even when one submitted intent needs a tool-use review turn.
type DirectorProviderTurn struct {
	ReplyText  string
	Invocation conversation.ResolvedInvocation
}

type submittedDirectorTurn struct {
	ReplyText   string
	Invocations []conversation.ResolvedInvocation
}

// DirectorCarrierPort is the consumer-owned half of the Director's provider
// boundary. Provider identity, credentials, models, and accounting stay behind
// it; what crosses is a tool catalog the Director owns and the text of one
// turn.
type DirectorCarrierPort interface {
	// StartDirectorCarrier starts the ephemeral provider thread this app run's
	// Director turns run on, replays the supplied history into it, and returns
	// its provider id. The id is runtime correlation only: Setta records which
	// conversation is running, never which thread carried it.
	StartDirectorCarrier(context.Context, DirectorCarrierRequest) (string, error)
	// RunDirectorTurn runs one turn to completion and returns the assistant
	// text and resolved invocation that produced it. Tool calls reach their
	// handlers during the turn.
	RunDirectorTurn(context.Context, DirectorTurnRequest) (DirectorProviderTurn, error)
}

// DirectorConversationStore is the durable home of the Director conversation.
// It keeps the conversation and nothing about the carrier running it.
type DirectorConversationStore interface {
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
	IntentID            string                            `json:"intentId"`
	ReplyText           string                            `json:"replyText"`
	ToolCalls           []DirectorToolCall                `json:"toolCalls"`
	ResolvedInvocations []conversation.ResolvedInvocation `json:"resolvedInvocations"`
}

// Validate proves the receipt describes a turn that actually happened.
func (receipt DirectorTurnReceipt) Validate() error {
	if err := validateIdentifier("director turn intent id", receipt.IntentID); err != nil {
		return err
	}
	if receipt.ToolCalls == nil {
		return errors.New("director turn tool calls must be an array")
	}
	if err := validateDirectorTurnInvocations(receipt.ResolvedInvocations); err != nil {
		return err
	}
	if err := validateDirectorTurnReply(receipt); err != nil {
		return err
	}
	return validateDirectorToolCalls(receipt.ToolCalls)
}

func validateDirectorTurnInvocations(invocations []conversation.ResolvedInvocation) error {
	if len(invocations) == 0 {
		return errors.New("director turn resolved invocations must be a non-empty array")
	}
	if len(invocations) > 2 {
		return errors.New("director turn may contain only the submitted call and one tool-use review call")
	}
	seenInvocations := map[string]bool{}
	seenProviderTurns := map[string]bool{}
	for index, invocation := range invocations {
		providerTurnID, err := validateDirectorTurnInvocation(index, invocation)
		if err != nil {
			return err
		}
		if seenInvocations[invocation.ID] {
			return fmt.Errorf("director turn resolved invocation id %s is duplicated", invocation.ID)
		}
		if seenProviderTurns[providerTurnID] {
			return fmt.Errorf("director provider turn id %s is duplicated", providerTurnID)
		}
		seenInvocations[invocation.ID] = true
		seenProviderTurns[providerTurnID] = true
	}
	return nil
}

func validateDirectorTurnInvocation(
	index int,
	invocation conversation.ResolvedInvocation,
) (string, error) {
	if err := invocation.Validate(); err != nil {
		return "", fmt.Errorf("director turn resolved invocation[%d]: %w", index, err)
	}
	if invocation.Role != conversation.RoleDirector ||
		invocation.Outcome != conversation.InvocationOutcomeSucceeded ||
		invocation.ProviderReferences.TurnID == nil {
		return "", fmt.Errorf("director turn resolved invocation[%d] is not a successful Director provider turn", index)
	}
	return *invocation.ProviderReferences.TurnID, nil
}

func validateDirectorTurnReply(receipt DirectorTurnReceipt) error {
	if receipt.ReplyText == "" && len(receipt.ToolCalls) == 0 {
		return fmt.Errorf("director turn %s neither answered nor acted", receipt.IntentID)
	}
	if receipt.ReplyText != "" && len(receipt.ReplyText) > MaxDirectorReplyBytes {
		return fmt.Errorf("director reply exceeds %d bytes", MaxDirectorReplyBytes)
	}
	return nil
}

func validateDirectorToolCalls(toolCalls []DirectorToolCall) error {
	for index, call := range toolCalls {
		if err := validateIdentifier("director tool call name", call.Tool); err != nil {
			return fmt.Errorf("director turn tool call[%d]: %w", index, err)
		}
		if err := validateTrimmedText("director tool call summary", call.Summary); err != nil {
			return fmt.Errorf("director turn tool call[%d]: %w", index, err)
		}
	}
	return nil
}

// DirectorConversation runs the Director conversation.
type DirectorConversation struct {
	toolbox  *SettaToolbox
	store    DirectorConversationStore
	carriers *conversation.CarrierRegistry
	provider DirectorCarrierPort
	now      func() time.Time
	newID    func(string) (string, error)

	// turnMutex serializes Director turns. The carrier is established under it,
	// so one app run starts exactly one Director carrier.
	turnMutex sync.Mutex
}

// DirectorConversationOption configures the Director conversation.
type DirectorConversationOption func(*DirectorConversation) error

// WithDirectorConversationClock replaces the clock durable Director entries are
// stamped with.
func WithDirectorConversationClock(now func() time.Time) DirectorConversationOption {
	return func(director *DirectorConversation) error {
		if now == nil {
			return errors.New("director conversation clock must not be nil")
		}
		director.now = now
		return nil
	}
}

// WithDirectorConversationIdentity replaces the generator that mints durable
// entry ids.
func WithDirectorConversationIdentity(newID func(string) (string, error)) DirectorConversationOption {
	return func(director *DirectorConversation) error {
		if newID == nil {
			return errors.New("director conversation identity generator must not be nil")
		}
		director.newID = newID
		return nil
	}
}

// NewDirectorConversation builds the Director conversation over trusted state,
// the durable store, the app run's carrier registry, and the provider port.
func NewDirectorConversation(
	registry *Registry,
	executor *DecisionExecutor,
	store DirectorConversationStore,
	carriers *conversation.CarrierRegistry,
	provider DirectorCarrierPort,
	narrator DirectorNarratorPort,
	options ...DirectorConversationOption,
) (*DirectorConversation, error) {
	if registry == nil || executor == nil || store == nil || carriers == nil || provider == nil ||
		narrator == nil {
		return nil, errors.New(
			"director conversation requires the registry, the executor, the durable store, the carrier registry, the provider port, and the narrator port",
		)
	}
	toolbox, err := NewSettaToolbox(registry, executor, narrator)
	if err != nil {
		return nil, err
	}
	director := &DirectorConversation{
		toolbox:  toolbox,
		store:    store,
		carriers: carriers,
		provider: provider,
		now:      time.Now,
		newID:    randomDirectorFactID,
	}
	for _, option := range options {
		if option == nil {
			return nil, errors.New("director conversation option must not be nil")
		}
		if err := option(director); err != nil {
			return nil, err
		}
	}
	return director, nil
}

// Submit runs one user request as a turn of the Director conversation.
func (director *DirectorConversation) Submit(
	ctx context.Context,
	intent SubmittedIntent,
) (DirectorTurnReceipt, error) {
	if err := validateDirectorSubmission(director, ctx, intent); err != nil {
		return DirectorTurnReceipt{}, err
	}
	director.turnMutex.Lock()
	defer director.turnMutex.Unlock()
	recorder, recorded, err := director.recordedTools(intent)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	carrier, err := director.establish(ctx, recorded)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	if err := director.persistUserTurn(ctx, intent); err != nil {
		return DirectorTurnReceipt{}, err
	}
	providerTurn, err := director.runSubmittedIntent(ctx, intent, carrier, recorded, recorder)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	return director.finishTurn(
		ctx,
		intent,
		providerTurn,
		recorder,
	)
}

func validateDirectorSubmission(
	director *DirectorConversation,
	ctx context.Context,
	intent SubmittedIntent,
) error {
	if director == nil || director.provider == nil || director.store == nil {
		return ErrDirectorUnavailable
	}
	if ctx == nil {
		return errors.New("director turn context is required")
	}
	if err := validateSubmittedIntent(intent); err != nil {
		return fmt.Errorf("%w: %w", ErrDirectorIntentRejected, err)
	}
	return nil
}

func (director *DirectorConversation) recordedTools(
	intent SubmittedIntent,
) (*directorToolRecorder, []SettaTool, error) {
	tools, err := director.toolbox.Tools(intent)
	if err != nil {
		return nil, nil, err
	}
	recorder := &directorToolRecorder{
		persistence: directorToolPersistence{
			begin: func(callContext context.Context, tool string, arguments json.RawMessage) (string, error) {
				return director.persistToolCall(context.WithoutCancel(callContext), intent, tool, arguments)
			},
			finish: func(
				callContext context.Context,
				callID string,
				receipt SettaToolReceipt,
				succeeded bool,
			) error {
				return director.persistToolReceipt(
					context.WithoutCancel(callContext),
					intent,
					callID,
					receipt,
					succeeded,
				)
			},
		},
	}
	assessed, err := assessDirectorTurnTools(recorder.instrument(tools))
	if err != nil {
		return nil, nil, err
	}
	return recorder, assessed, nil
}

func (director *DirectorConversation) runSubmittedIntent(
	ctx context.Context,
	intent SubmittedIntent,
	carrier conversation.Carrier,
	tools []SettaTool,
	recorder *directorToolRecorder,
) (submittedDirectorTurn, error) {
	providerTurn, err := director.runTurn(ctx, DirectorTurnRequest{
		Carrier: carrier,
		TurnID:  intent.ID,
		Text:    intent.Text,
		Tools:   tools,
	})
	if err != nil {
		return submittedDirectorTurn{}, err
	}
	invocations := []conversation.ResolvedInvocation{providerTurn.Invocation}
	// A prose-only answer may be exactly right, or it may be the failure mode
	// this product replaced: answering an app-control request without acting.
	// Setta does not guess from keywords. It asks the same Director conversation
	// to review the turn against its tool contract, act now when action was
	// required, or repeat the conversational answer when it was not.
	if len(recorder.recorded) == 0 {
		providerTurn, err = director.runTurn(ctx, DirectorTurnRequest{
			Carrier: carrier,
			TurnID:  intent.ID,
			Text:    directorToolUseReview,
			Tools:   tools,
		})
		if err != nil {
			return submittedDirectorTurn{}, err
		}
		invocations = append(invocations, providerTurn.Invocation)
	}
	return submittedDirectorTurn{
		ReplyText:   providerTurn.ReplyText,
		Invocations: invocations,
	}, nil
}

// finishTurn makes the Director's reply durable and reports the turn. The reply
// is a conversation entry and nothing else: it is what the next turn is
// re-established from, what the graph draws as the Director's answer, and what
// the spoken reply is read out of, so a second durable record of the same
// sentence could only disagree with it.
func (director *DirectorConversation) finishTurn(
	ctx context.Context,
	intent SubmittedIntent,
	providerTurn submittedDirectorTurn,
	recorder *directorToolRecorder,
) (DirectorTurnReceipt, error) {
	reply := strings.TrimSpace(providerTurn.ReplyText)
	receipt := DirectorTurnReceipt{
		IntentID:            intent.ID,
		ReplyText:           reply,
		ToolCalls:           recorder.calls(),
		ResolvedInvocations: append([]conversation.ResolvedInvocation{}, providerTurn.Invocations...),
	}
	if err := receipt.Validate(); err != nil {
		return DirectorTurnReceipt{}, err
	}
	if reply == "" {
		return receipt, nil
	}
	model := directorInvocationModel(receipt.ResolvedInvocations[len(receipt.ResolvedInvocations)-1])
	entry, err := director.textEntry(
		conversation.DirectorConversationAssistantText,
		intent.ID,
		director.now().UTC().Format(time.RFC3339Nano),
		reply,
	)
	if err != nil {
		return DirectorTurnReceipt{}, err
	}
	entry.Text.Model = &conversation.DirectorConversationModel{
		Provider: conversation.ProviderCodex,
		Model:    model,
	}
	if err := director.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry}); err != nil {
		return DirectorTurnReceipt{}, err
	}
	return receipt, nil
}

func directorInvocationModel(invocation conversation.ResolvedInvocation) string {
	if len(invocation.ModelReroutes) == 0 {
		return invocation.Resolved.ModelID
	}
	return invocation.ModelReroutes[len(invocation.ModelReroutes)-1].ToModelID
}

// persistUserTurn records the request before the provider is asked to serve it.
// The user said it first, so the conversation says so first: a provider failure
// then leaves a request nothing answered rather than erasing that it was made.
func (director *DirectorConversation) persistUserTurn(ctx context.Context, intent SubmittedIntent) error {
	entry, err := director.textEntry(
		conversation.DirectorConversationUserTurn,
		intent.ID,
		director.now().UTC().Format(time.RFC3339Nano),
		intent.Text,
	)
	if err != nil {
		return err
	}
	return director.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry})
}

// persistToolCall commits a call before its handler runs and returns the entry
// id its receipt answers.
func (director *DirectorConversation) persistToolCall(
	ctx context.Context,
	intent SubmittedIntent,
	tool string,
	arguments json.RawMessage,
) (string, error) {
	entry, err := director.newEntry(
		conversation.DirectorConversationToolCall,
		intent.ID,
		director.now().UTC().Format(time.RFC3339Nano),
	)
	if err != nil {
		return "", err
	}
	entry.Tool = &conversation.DirectorConversationToolActivity{
		Tool:    tool,
		Payload: durableDirectorToolArguments(tool, arguments),
	}
	if err := director.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry}); err != nil {
		return "", err
	}
	return entry.ID, nil
}

const redactedDirectorApprovalArguments = `{"redacted":true}`

// durableDirectorToolArguments keeps typed approval answers out of the
// app-scoped log. The recorder runs before the handler so a call remains visible
// across a crash, which also means it runs before the handler can discover that
// an approval is secret. Redacting every resolve_approval argument envelope is
// the only boundary that cannot accidentally persist a credential supplied in
// a malformed or refused call. The receipt still durably records which approval
// action Setta accepted or refused.
func durableDirectorToolArguments(tool string, arguments json.RawMessage) json.RawMessage {
	if tool == "resolve_approval" {
		return json.RawMessage(redactedDirectorApprovalArguments)
	}
	return append(json.RawMessage{}, arguments...)
}

// persistToolReceipt commits what the call reported, verbatim. Replaying the
// conversation reproduces what the Director was actually told rather than a
// re-rendered summary of it.
func (director *DirectorConversation) persistToolReceipt(
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
	entry, err := director.newEntry(
		conversation.DirectorConversationToolReceipt,
		intent.ID,
		director.now().UTC().Format(time.RFC3339Nano),
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
	return director.store.AppendDirectorConversation(ctx, []conversation.DirectorConversationEntry{entry})
}

// establish returns the ephemeral carrier this app run's Director turns run on,
// starting it from the durable conversation the first time it is needed. The
// carrier lives in the app run's shared registry under the Director's own Setta
// id, exactly like a workstream's: the next app run finds nothing there, starts
// a fresh carrier, and replays the same Setta-owned history into it.
func (director *DirectorConversation) establish(
	ctx context.Context,
	tools []SettaTool,
) (conversation.Carrier, error) {
	if carrier, live := director.carriers.Lookup(DirectorConversationID); live {
		return carrier, nil
	}
	history, err := director.replayHistory(ctx)
	if err != nil {
		return conversation.Carrier{}, err
	}
	threadID, err := director.provider.StartDirectorCarrier(ctx, DirectorCarrierRequest{
		Instructions: DirectorInstructions(),
		Tools:        tools,
		History:      history,
	})
	if err != nil {
		return conversation.Carrier{}, err
	}
	if err := validateIdentifier("director carrier thread id", threadID); err != nil {
		return conversation.Carrier{}, err
	}
	carrier := conversation.Carrier{OwnerID: DirectorConversationID, ThreadID: threadID}
	director.carriers.Remember(carrier)
	return carrier, nil
}

// runTurn runs one turn on the Director's carrier. A carrier the provider has
// lost is dropped rather than retried here: the turn fails with what went
// wrong, and the next one replays the durable conversation into a fresh carrier
// instead of addressing a thread Codex no longer has.
func (director *DirectorConversation) runTurn(
	ctx context.Context,
	request DirectorTurnRequest,
) (DirectorProviderTurn, error) {
	turn, err := director.provider.RunDirectorTurn(ctx, request)
	if errors.Is(err, ErrDirectorCarrierLost) {
		director.carriers.Forget(request.Carrier.OwnerID)
	}
	return turn, err
}

// replayHistory turns the durable Director conversation back into the turns a
// new carrier is started with. Tool calls are replayed as their
// receipts, because what the Director needs to remember is what Setta did, not
// how the call was encoded.
func (director *DirectorConversation) replayHistory(
	ctx context.Context,
) ([]DirectorHistoryItem, error) {
	entries, err := director.store.ReadRecentDirectorConversation(ctx, MaxDirectorReplayEntries)
	if err != nil {
		return nil, err
	}
	// The entry limit may land inside a turn. Drop that incomplete prefix so a
	// new carrier never sees a tool receipt or assistant reply without the user
	// turn it answered.
	for len(entries) > 0 && entries[0].Kind != conversation.DirectorConversationUserTurn {
		entries = entries[1:]
	}
	history := make([]DirectorHistoryItem, 0, len(entries))
	for _, entry := range entries {
		switch entry.Kind {
		case conversation.DirectorConversationUserTurn:
			history = append(history, DirectorHistoryItem{
				TurnID: entry.TurnID,
				Text:   entry.Text.Text,
			})
		case conversation.DirectorConversationAssistantText:
			history = append(history, DirectorHistoryItem{
				TurnID:    entry.TurnID,
				Assistant: true,
				Text:      entry.Text.Text,
			})
		case conversation.DirectorConversationToolReceipt:
			history = append(history, DirectorHistoryItem{
				TurnID: entry.TurnID,
				Text:   fmt.Sprintf("Setta tool %s.%s reported: %s", SettaToolNamespace, entry.Tool.Tool, entry.Tool.Payload),
			})
		case conversation.DirectorConversationToolCall:
			// The call is durable so the app can explain what the Director did;
			// replaying it would tell the carrier to act again.
			continue
		default:
			return nil, fmt.Errorf("unknown director conversation entry kind %q", entry.Kind)
		}
	}
	return history, nil
}

func (director *DirectorConversation) textEntry(
	kind conversation.DirectorConversationEntryKind,
	turnID string,
	recordedAt string,
	text string,
) (conversation.DirectorConversationEntry, error) {
	entry, err := director.newEntry(kind, turnID, recordedAt)
	if err != nil {
		return conversation.DirectorConversationEntry{}, err
	}
	entry.Text = &conversation.DirectorConversationText{Text: text}
	return entry, nil
}

func (director *DirectorConversation) newEntry(
	kind conversation.DirectorConversationEntryKind,
	turnID string,
	recordedAt string,
) (conversation.DirectorConversationEntry, error) {
	id, err := director.newID("director-entry")
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
