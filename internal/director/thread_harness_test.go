package director

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"

	"setta/internal/conversation"
)

// A Director conversation whose provider is scripted.
//
// The double runs the real handlers: a scripted call names a tool and its
// arguments, and the turn dispatches it exactly as Codex would, so the tests
// exercise argument decoding, authorization, and execution rather than a
// rehearsal of them.

type scriptedDirectorToolCall struct {
	tool      string
	arguments map[string]any
	// rawArguments overrides arguments when a test needs to send something the
	// schema does not describe.
	rawArguments json.RawMessage
}

type ranDirectorTurn struct {
	ThreadID string
	TurnID   string
	Text     string
	Tools    []SettaTool
}

type scriptedDirectorProvider struct {
	reply string
	calls []scriptedDirectorToolCall
	err   error

	started []DirectorThreadStart
	turns   []ranDirectorTurn
	// receipts are what the scripted calls reported back, in order.
	receipts []SettaToolReceipt
}

func (provider *scriptedDirectorProvider) StartDirectorThread(
	_ context.Context,
	request DirectorThreadStart,
) (DirectorProviderThread, error) {
	if provider.err != nil {
		return DirectorProviderThread{}, provider.err
	}
	provider.started = append(provider.started, request)
	return DirectorProviderThread{
		ThreadID: fmt.Sprintf("provider-thread-%d", len(provider.started)),
		Model:    "gpt-test",
	}, nil
}

func (provider *scriptedDirectorProvider) RunDirectorTurn(
	ctx context.Context,
	request DirectorTurnRequest,
) (string, error) {
	if provider.err != nil {
		return "", provider.err
	}
	provider.turns = append(provider.turns, ranDirectorTurn{
		ThreadID: request.ThreadID,
		TurnID:   request.TurnID,
		Text:     request.Text,
		Tools:    request.Tools,
	})
	for _, call := range provider.calls {
		receipt, err := provider.dispatch(ctx, request.Tools, call)
		if err != nil {
			return "", err
		}
		provider.receipts = append(provider.receipts, receipt)
	}
	return provider.reply, nil
}

func (provider *scriptedDirectorProvider) dispatch(
	ctx context.Context,
	tools []SettaTool,
	call scriptedDirectorToolCall,
) (SettaToolReceipt, error) {
	arguments := call.rawArguments
	if arguments == nil {
		encoded, err := json.Marshal(call.arguments)
		if err != nil {
			return SettaToolReceipt{}, err
		}
		arguments = encoded
	}
	for _, tool := range tools {
		if tool.Name != call.tool {
			continue
		}
		return tool.Handler(ctx, arguments)
	}
	return SettaToolReceipt{}, fmt.Errorf("scripted director called unknown tool %q", call.tool)
}

// memoryDirectorConversationStore keeps the Director conversation in memory so
// a test can assert what one turn made durable without a database.
type memoryDirectorConversationStore struct {
	mutex   sync.Mutex
	thread  *conversation.DirectorThreadRecord
	entries []conversation.DirectorConversationEntry
}

func newDirectorConversationStoreForTest() *memoryDirectorConversationStore {
	return &memoryDirectorConversationStore{}
}

func (store *memoryDirectorConversationStore) ReadDirectorThread(
	context.Context,
) (conversation.DirectorThreadRecord, bool, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if store.thread == nil {
		return conversation.DirectorThreadRecord{}, false, nil
	}
	return *store.thread, true, nil
}

func (store *memoryDirectorConversationStore) BindDirectorThread(
	_ context.Context,
	record conversation.DirectorThreadRecord,
) error {
	if err := record.Validate(); err != nil {
		return err
	}
	store.mutex.Lock()
	defer store.mutex.Unlock()
	store.thread = &record
	return nil
}

func (store *memoryDirectorConversationStore) AppendDirectorConversation(
	_ context.Context,
	entries []conversation.DirectorConversationEntry,
) error {
	if len(entries) == 0 {
		return errors.New("director conversation append requires at least one entry")
	}
	store.mutex.Lock()
	defer store.mutex.Unlock()
	for _, entry := range entries {
		if err := entry.Validate(); err != nil {
			return err
		}
		store.entries = append(store.entries, entry)
	}
	return nil
}

func (store *memoryDirectorConversationStore) ReadRecentDirectorConversation(
	_ context.Context,
	limit int,
) ([]conversation.DirectorConversationEntry, error) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	if len(store.entries) <= limit {
		return append([]conversation.DirectorConversationEntry{}, store.entries...), nil
	}
	return append([]conversation.DirectorConversationEntry{}, store.entries[len(store.entries)-limit:]...), nil
}

func (store *memoryDirectorConversationStore) kinds() []conversation.DirectorConversationEntryKind {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	kinds := make([]conversation.DirectorConversationEntryKind, 0, len(store.entries))
	for _, entry := range store.entries {
		kinds = append(kinds, entry.Kind)
	}
	return kinds
}

func newDirectorThreadForTest(
	t *testing.T,
	harness *registryHarness,
	registry *Registry,
	provider DirectorThreadPort,
	execution WorkstreamExecution,
	store DirectorConversationStore,
) *DirectorThread {
	t.Helper()
	thread, err := NewDirectorThread(
		registry,
		newExecutorForTest(t, harness, registry, execution),
		store,
		provider,
		WithDirectorThreadClock(harness.clock),
		WithDirectorThreadIdentity(harness.identity),
	)
	if err != nil {
		t.Fatalf("NewDirectorThread: %v", err)
	}
	return thread
}
