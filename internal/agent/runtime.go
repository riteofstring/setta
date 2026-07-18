package agent

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"setta/internal/codexapp"
)

type Config struct {
	Command     string
	Args        []string
	Env         []string
	ExcludedEnv []string
	Manager     *codexapp.Manager
	Version     string
}

type Runtime struct {
	manager *codexapp.Manager

	mu      sync.Mutex
	active  map[string]*activeTurn
	pending map[string]pendingApproval
}

type activeTurn struct {
	conversationID   string
	settaTurnID      string
	providerThreadID string
	providerTurnID   string
	session          *codexapp.Session
	dynamicTools     map[dynamicToolKey]DynamicTool
}

type pendingApproval struct {
	conversationID string
	method         string
	message        codexapp.Message
	questions      []ApprovalQuestion
	permissions    map[string]any
}

var ErrConversationTurnActive = errors.New("conversation already has an active provider turn")

func NewRuntime(config Config) *Runtime {
	manager := config.Manager
	if manager == nil {
		command := config.Command
		if command == "" {
			command = "codex"
		}
		args := append([]string{}, config.Args...)
		if len(args) == 0 {
			args = []string{"app-server", "--listen", "stdio://"}
		}
		version := config.Version
		if version == "" {
			version = "dev"
		}
		manager = codexapp.NewManager(codexapp.ManagerConfig{
			Process: codexapp.ProcessConfig{
				Command:     command,
				Args:        args,
				Env:         append([]string{}, config.Env...),
				ExcludedEnv: append([]string{}, config.ExcludedEnv...),
			},
			InitializeParams: initializeParams(version),
		})
	}
	return &Runtime{
		manager: manager,
		active:  map[string]*activeTurn{},
		pending: map[string]pendingApproval{},
	}
}

func (runtime *Runtime) Manager() *codexapp.Manager {
	return runtime.manager
}

func initializeParams(version string) codexapp.InitializeParams {
	title := "Setta"
	experimental := true
	requestAttestation := false
	optOutNotificationMethods := []string{
		codexapp.CodexNotificationThreadStarted,
	}
	return codexapp.InitializeParams{
		ClientInfo: codexapp.ClientInfo{Name: "setta", Title: &title, Version: version},
		Capabilities: &codexapp.InitializeCapabilities{
			ExperimentalApi:           &experimental,
			OptOutNotificationMethods: &optOutNotificationMethods,
			RequestAttestation:        &requestAttestation,
		},
	}
}

func (runtime *Runtime) Shutdown(ctx context.Context) error {
	if runtime == nil || runtime.manager == nil {
		return nil
	}
	return runtime.manager.Shutdown(ctx)
}

func (runtime *Runtime) reserveTurn(request TurnRequest, session *codexapp.Session) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	if _, exists := runtime.active[request.ConversationID]; exists {
		return fmt.Errorf("%w: %s", ErrConversationTurnActive, request.ConversationID)
	}
	runtime.active[request.ConversationID] = &activeTurn{
		conversationID:   request.ConversationID,
		settaTurnID:      request.TurnID,
		providerThreadID: request.ProviderThreadID,
		session:          session,
		dynamicTools:     dynamicToolMap(request.DynamicTools),
	}
	return nil
}

func (runtime *Runtime) setProviderTurnID(conversationID string, providerTurnID string) error {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	active := runtime.active[conversationID]
	if active == nil {
		return fmt.Errorf("active conversation turn %s disappeared", conversationID)
	}
	active.providerTurnID = providerTurnID
	return nil
}

func (runtime *Runtime) releaseTurn(conversationID string) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	delete(runtime.active, conversationID)
	for requestID, pending := range runtime.pending {
		if pending.conversationID == conversationID {
			delete(runtime.pending, requestID)
		}
	}
}

func (runtime *Runtime) activeTurnFor(request TurnControlRequest) (*activeTurn, error) {
	runtime.mu.Lock()
	defer runtime.mu.Unlock()
	active := runtime.active[request.ConversationID]
	if active == nil {
		return nil, fmt.Errorf("conversation %s has no active provider turn", request.ConversationID)
	}
	if active.providerThreadID != request.ProviderThreadID || active.providerTurnID != request.ProviderTurnID {
		return nil, fmt.Errorf("conversation %s active provider turn does not match request", request.ConversationID)
	}
	copy := *active
	return &copy, nil
}
