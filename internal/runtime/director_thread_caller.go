package runtime

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"

	"setta/internal/agent"
	"setta/internal/conversation"
	"setta/internal/director"
)

// The Director conversation's provider half.
//
// The Director owns what its tools mean; this owns how they reach Codex. It
// holds provider identity, the resolved role, the isolated directory the thread
// runs in, and the translation between Setta's tool catalog and the app-server's
// dynamic-tool wire shape — and it holds nothing about what a tool call does.
//
// The Director thread is read-only and approval-free at the provider level. It
// coordinates workstreams; the work itself runs in workstream threads with their
// own permissions, so a Director that could edit files or run commands would be
// authority the product never asked for.

// directorRoleResolver resolves the app-global Director role. The Director does
// not choose its own model, effort, permissions, or input budget.
type directorRoleResolver interface {
	ResolveDirectorRoleConfiguration(context.Context) (conversation.DirectorRoleConfiguration, error)
}

// directorProviderRuntime is the Codex surface one Director conversation needs.
type directorProviderRuntime interface {
	StartThread(context.Context, agent.StartThreadRequest) (agent.Thread, error)
	InjectItems(context.Context, string, []agent.InjectedTextItem) error
	RunTurn(context.Context, agent.TurnRequest, agent.EventSink) (agent.TurnResult, error)
}

// directorThreadCaller runs the Director conversation against Codex.
type directorThreadCaller struct {
	roles         directorRoleResolver
	provider      directorProviderRuntime
	workspaceRoot string
	// conversationID names the Director in the provider runtime's active-turn
	// map. It is a constant because there is exactly one Director conversation
	// per app profile, and the runtime uses it to refuse a second concurrent
	// turn on the same conversation.
	conversationID string
	newID          func(string) (string, error)
}

// directorProviderConversationID is the Director's identity in the agent
// runtime. It is not a Setta conversation id: the Director is not a workstream,
// and nothing in the conversation store is keyed by it.
const directorProviderConversationID = "director"

func newDirectorThreadCaller(
	roles directorRoleResolver,
	provider directorProviderRuntime,
	workspaceRoot string,
) (*directorThreadCaller, error) {
	if roles == nil || provider == nil {
		return nil, errors.New("director thread caller requires a role resolver and a provider runtime")
	}
	if workspaceRoot == "" || !filepath.IsAbs(workspaceRoot) {
		return nil, fmt.Errorf("director thread workspace root must be absolute: %s", workspaceRoot)
	}
	return &directorThreadCaller{
		roles:          roles,
		provider:       provider,
		workspaceRoot:  filepath.Clean(workspaceRoot),
		conversationID: directorProviderConversationID,
		newID:          randomDirectorRequestID,
	}, nil
}

// randomDirectorRequestID names one provider call. It is provider-facing
// correlation only.
func randomDirectorRequestID(prefix string) (string, error) {
	var data [16]byte
	if _, err := rand.Read(data[:]); err != nil {
		return "", fmt.Errorf("generate %s id: %w", prefix, err)
	}
	return prefix + "_" + hex.EncodeToString(data[:]), nil
}

// StartDirectorThread opens the provider thread the Director conversation runs
// on and replays the durable history into it.
//
// Codex attaches dynamic tools at thread start and does not carry them into a
// resumed thread, so this always starts. The Director's continuity comes from
// the durable history Setta injects here, which is why losing the provider
// thread across a restart costs the Director nothing it needs.
func (caller *directorThreadCaller) StartDirectorThread(
	ctx context.Context,
	request director.DirectorThreadStart,
) (director.DirectorProviderThread, error) {
	if caller == nil || caller.roles == nil || caller.provider == nil {
		return director.DirectorProviderThread{}, errors.New("director thread caller is unavailable")
	}
	if ctx == nil {
		return director.DirectorProviderThread{}, errors.New("director thread context is required")
	}
	invocation, maxInputBytes, err := caller.invocation(ctx)
	if err != nil {
		return director.DirectorProviderThread{}, err
	}
	tools, err := directorDynamicTools(request.Tools)
	if err != nil {
		return director.DirectorProviderThread{}, err
	}
	thread, err := caller.provider.StartThread(ctx, agent.StartThreadRequest{
		WorkspaceRoot:         caller.workspaceRoot,
		Invocation:            invocation,
		Ephemeral:             true,
		DeveloperInstructions: request.Instructions,
		DynamicTools:          tools,
	})
	if err != nil {
		return director.DirectorProviderThread{}, fmt.Errorf("start director thread: %w", err)
	}
	if err := caller.replay(
		ctx,
		thread.ID,
		directorHistoryWithinBudget(request.History, maxInputBytes),
	); err != nil {
		return director.DirectorProviderThread{}, err
	}
	return director.DirectorProviderThread{ThreadID: thread.ID, Model: thread.Model}, nil
}

// replay seeds the new provider thread with the Director conversation Setta
// already owns. A thread with no history is materialized with the marker turn
// the agent runtime uses everywhere else, because a Codex thread that has never
// received an item is not durable yet.
func (caller *directorThreadCaller) replay(
	ctx context.Context,
	threadID string,
	history []director.DirectorThreadHistoryItem,
) error {
	if len(history) == 0 {
		return caller.provider.InjectItems(ctx, threadID, []agent.InjectedTextItem{{
			Role: "user",
			Text: directorThreadInitialization,
		}})
	}
	items := make([]agent.InjectedTextItem, 0, len(history))
	for _, entry := range history {
		role := "user"
		if entry.Assistant {
			role = "assistant"
		}
		items = append(items, agent.InjectedTextItem{Role: role, Text: entry.Text})
	}
	return caller.provider.InjectItems(ctx, threadID, items)
}

// directorHistoryWithinBudget keeps the newest complete turns that fit the
// Director role's input budget. Setta history is append-only and can outgrow a
// provider request; dropping a whole oldest turn preserves causal replay.
func directorHistoryWithinBudget(
	history []director.DirectorThreadHistoryItem,
	maxInputBytes int,
) []director.DirectorThreadHistoryItem {
	total := 0
	for _, entry := range history {
		total += len(entry.Text)
	}
	first := 0
	for first < len(history) && total > maxInputBytes {
		turnID := history[first].TurnID
		for first < len(history) && history[first].TurnID == turnID {
			total -= len(history[first].Text)
			first++
		}
	}
	return append([]director.DirectorThreadHistoryItem{}, history[first:]...)
}

const directorThreadInitialization = "Setta started this Director conversation. This is an inert history marker, not a request. Respond only to later user turns."

// RunDirectorTurn runs one Director turn and returns the assistant text it
// produced. Tool calls reach their Setta handlers while the turn runs, so by
// the time this returns the app has already changed.
func (caller *directorThreadCaller) RunDirectorTurn(
	ctx context.Context,
	request director.DirectorTurnRequest,
) (string, error) {
	if caller == nil || caller.roles == nil || caller.provider == nil {
		return "", errors.New("director thread caller is unavailable")
	}
	if ctx == nil {
		return "", errors.New("director turn context is required")
	}
	invocation, maxInputBytes, err := caller.invocation(ctx)
	if err != nil {
		return "", err
	}
	if len(request.Text) > maxInputBytes {
		return "", fmt.Errorf(
			"%w: the submitted request needs %d bytes, and the Director role allows %d",
			director.ErrDirectorIntentRejected,
			len(request.Text),
			maxInputBytes,
		)
	}
	tools, err := directorDynamicTools(request.Tools)
	if err != nil {
		return "", err
	}
	clientInputID, err := caller.newID("director_turn")
	if err != nil {
		return "", err
	}
	sink := &directorTurnSink{}
	result, err := caller.provider.RunTurn(ctx, agent.TurnRequest{
		ConversationID:   caller.conversationID,
		TurnID:           request.TurnID,
		ProviderThreadID: request.ThreadID,
		ClientInputID:    clientInputID,
		Text:             request.Text,
		WorkspaceRoot:    caller.workspaceRoot,
		Invocation:       invocation,
		DynamicTools:     tools,
	}, sink)
	if err != nil {
		return "", fmt.Errorf("run director turn %s: %w", request.TurnID, err)
	}
	if result.Outcome != agent.TurnOutcomeCompleted {
		return "", fmt.Errorf("director turn %s ended as %s", request.TurnID, result.Outcome)
	}
	return sink.replyText(), nil
}

// invocation resolves the app-global Director role for one provider call. It is
// resolved per call rather than cached, because the user can change the
// Director's model while the conversation is running.
func (caller *directorThreadCaller) invocation(ctx context.Context) (agent.Invocation, int, error) {
	configuration, err := caller.roles.ResolveDirectorRoleConfiguration(ctx)
	if err != nil {
		return agent.Invocation{}, 0, fmt.Errorf("resolve director role: %w", err)
	}
	invocation, err := configuration.PinnedInvocation()
	if err != nil {
		return agent.Invocation{}, 0, err
	}
	return invocation, configuration.MaxInputBytes, nil
}

// directorTurnSink collects the Director's own words. Everything else the turn
// emits — activity, plans, reasoning — belongs to the graph rather than to the
// reply, and the durable facts the tool calls commit are what carry it there.
type directorTurnSink struct {
	completedText string
	deltaText     string
}

func (sink *directorTurnSink) HandleAgentEvent(event agent.Event) error {
	if event.Text == nil {
		return nil
	}
	switch event.Kind {
	case agent.EventKindAgentTextDelta:
		sink.deltaText += event.Text.Text
	case agent.EventKindAgentTextCompleted:
		if sink.completedText != "" {
			sink.completedText += "\n"
		}
		sink.completedText += event.Text.Text
	}
	return nil
}

// replyText prefers completed provider items, which are the authoritative
// assistant messages. Deltas remain a fallback for a provider that completed a
// turn without publishing its final item.
func (sink *directorTurnSink) replyText() string {
	if sink.completedText != "" {
		return sink.completedText
	}
	return sink.deltaText
}

// directorDynamicTools translates the Setta catalog into the provider's
// dynamic-tool shape. The namespace is applied here rather than in the catalog
// so the Director's tools stay named by what they do.
func directorDynamicTools(tools []director.SettaTool) ([]agent.DynamicTool, error) {
	if len(tools) == 0 {
		return nil, errors.New("director thread requires the setta tool catalog")
	}
	dynamic := make([]agent.DynamicTool, 0, len(tools))
	for _, tool := range tools {
		dynamic = append(dynamic, agent.DynamicTool{
			Namespace:            director.SettaToolNamespace,
			NamespaceDescription: director.SettaToolNamespaceDescription(),
			Name:                 tool.Name,
			Description:          tool.Description,
			InputSchema:          tool.InputSchema,
			Handler:              directorDynamicToolHandler(tool),
		})
	}
	return dynamic, nil
}

// directorDynamicToolHandler adapts one Setta tool to the provider's call
// contract. A handler that returned an error here would fail the whole turn, so
// the Director's own recovery path — being told specifically what went wrong and
// calling again — lives in the Setta handler instead.
func directorDynamicToolHandler(tool director.SettaTool) agent.DynamicToolHandler {
	return func(ctx context.Context, call agent.DynamicToolCall) (agent.DynamicToolResult, error) {
		receipt, err := tool.Handler(ctx, call.Arguments)
		if err != nil {
			return agent.DynamicToolResult{}, err
		}
		encoded, err := json.Marshal(receipt)
		if err != nil {
			return agent.DynamicToolResult{}, fmt.Errorf("encode setta tool receipt %s: %w", tool.Name, err)
		}
		return agent.DynamicToolResult{
			ContentItems: []agent.DynamicToolContentItem{{Type: "inputText", Text: string(encoded)}},
			Success:      true,
		}, nil
	}
}
