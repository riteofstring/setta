package provideraccounts

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"setta/internal/chat"
	"setta/internal/jsonio"
)

const (
	SchemaVersion = 1

	ProviderCodex      = "codex"
	AuthModeChatGPT    = "chatgpt"
	accountsFileName   = "provider-accounts.json"
	defaultChatGPTPlan = "unknown"
)

type ProviderAccounts struct {
	Accounts []ProviderAccountSummary `json:"accounts"`
}

type ProviderAccountSummary struct {
	Provider   string `json:"provider"`
	AuthMode   string `json:"authMode"`
	Configured bool   `json:"configured"`
	AccountID  string `json:"accountId"`
	PlanType   string `json:"planType"`
	UpdatedAt  string `json:"updatedAt"`
	Diagnostic string `json:"diagnostic"`
}

type SaveChatGPTAuthRequest struct {
	AccessToken string `json:"accessToken"`
	AccountID   string `json:"accountId"`
	PlanType    string `json:"planType"`
}

type ClearChatGPTAuthRequest struct{}

type State struct {
	SchemaVersion    int               `json:"schemaVersion"`
	CodexChatGPTAuth *ChatGPTAuthState `json:"codexChatgptAuth"`
}

type ChatGPTAuthState struct {
	AccessToken string `json:"accessToken"`
	AccountID   string `json:"accountId"`
	PlanType    string `json:"planType"`
	UpdatedAt   string `json:"updatedAt"`
}

type Store struct {
	appDataDir string
	clock      func() time.Time
	path       string
	mu         sync.Mutex
}

type Service struct {
	store *Store
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed provider account state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	appDataDir = filepath.Clean(appDataDir)
	return &Store{
		appDataDir: appDataDir,
		clock:      time.Now,
		path:       filepath.Join(appDataDir, accountsFileName),
	}, nil
}

func NewService(store *Store) (*Service, error) {
	if store == nil {
		return nil, errors.New("provider account store is required")
	}
	return &Service{store: store}, nil
}

func EmptyState() State {
	return State{
		SchemaVersion:    SchemaVersion,
		CodexChatGPTAuth: nil,
	}
}

func (service *Service) ListProviderAccounts() (ProviderAccounts, error) {
	state, err := service.store.Load()
	if err != nil {
		return ProviderAccounts{}, err
	}
	return providerAccountsFromState(state), nil
}

func (service *Service) SaveChatGPTAuth(request SaveChatGPTAuthRequest) (ProviderAccounts, error) {
	state, err := service.store.SaveChatGPTAuth(request)
	if err != nil {
		return ProviderAccounts{}, err
	}
	return providerAccountsFromState(state), nil
}

func (service *Service) ClearChatGPTAuth() (ProviderAccounts, error) {
	state, err := service.store.ClearChatGPTAuth()
	if err != nil {
		return ProviderAccounts{}, err
	}
	return providerAccountsFromState(state), nil
}

func (service *Service) RefreshChatGPTAuthTokens(context.Context, chat.ChatGPTAuthRefreshRequest) (chat.ChatGPTAuthTokens, error) {
	state, err := service.store.Load()
	if err != nil {
		return chat.ChatGPTAuthTokens{}, err
	}
	if state.CodexChatGPTAuth == nil {
		return chat.ChatGPTAuthTokens{}, &chat.ChatGPTAuthUnavailableError{Message: "ChatGPT auth is not configured in Setta"}
	}
	return chat.ChatGPTAuthTokens{
		AccessToken:      state.CodexChatGPTAuth.AccessToken,
		ChatGPTAccountID: state.CodexChatGPTAuth.AccountID,
		ChatGPTPlanType:  state.CodexChatGPTAuth.PlanType,
	}, nil
}

func (store *Store) Load() (State, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	return store.loadLocked()
}

func (store *Store) SaveChatGPTAuth(request SaveChatGPTAuthRequest) (State, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	state, err := store.loadLocked()
	if err != nil {
		return State{}, err
	}
	if err := validateSaveChatGPTAuthRequest(request); err != nil {
		return State{}, err
	}
	planType := request.PlanType
	if planType == "" {
		planType = defaultChatGPTPlan
	}
	state.CodexChatGPTAuth = &ChatGPTAuthState{
		AccessToken: request.AccessToken,
		AccountID:   request.AccountID,
		PlanType:    planType,
		UpdatedAt:   store.clock().UTC().Format(time.RFC3339Nano),
	}
	if err := store.saveLocked(state); err != nil {
		return State{}, err
	}
	return state, nil
}

func (store *Store) ClearChatGPTAuth() (State, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	state, err := store.loadLocked()
	if err != nil {
		return State{}, err
	}
	state.CodexChatGPTAuth = nil
	if err := store.saveLocked(state); err != nil {
		return State{}, err
	}
	return state, nil
}

func (store *Store) loadLocked() (State, error) {
	file, err := os.Open(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return EmptyState(), nil
		}
		return State{}, &PersistenceError{Operation: "read provider account state", Path: store.path, Err: err}
	}
	defer file.Close()

	var state State
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return State{}, corruptStateError(store.path, err)
	}
	if err := validateState(state, store.path); err != nil {
		return State{}, err
	}
	return state, nil
}

func (store *Store) saveLocked(state State) error {
	if err := validateState(state, store.path); err != nil {
		return err
	}
	if err := os.MkdirAll(store.appDataDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create provider account directory", Path: store.appDataDir, Err: err}
	}

	file, err := os.CreateTemp(store.appDataDir, ".provider-accounts-*.tmp")
	if err != nil {
		return &PersistenceError{Operation: "create provider account temp file", Path: store.appDataDir, Err: err}
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(state); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write provider account temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close provider account temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, store.path); err != nil {
		return &PersistenceError{Operation: "replace provider account state", Path: store.path, Err: err}
	}
	removeTemp = false
	return nil
}

func providerAccountsFromState(state State) ProviderAccounts {
	summary := ProviderAccountSummary{
		Provider:   ProviderCodex,
		AuthMode:   AuthModeChatGPT,
		Configured: false,
		Diagnostic: "ChatGPT auth is not configured",
	}
	if state.CodexChatGPTAuth != nil {
		summary.Configured = true
		summary.AccountID = state.CodexChatGPTAuth.AccountID
		summary.PlanType = state.CodexChatGPTAuth.PlanType
		summary.UpdatedAt = state.CodexChatGPTAuth.UpdatedAt
		summary.Diagnostic = ""
	}
	return ProviderAccounts{Accounts: []ProviderAccountSummary{summary}}
}

func validateSaveChatGPTAuthRequest(request SaveChatGPTAuthRequest) error {
	if request.AccessToken == "" {
		return errors.New("access token is required")
	}
	if request.AccountID == "" {
		return errors.New("account id is required")
	}
	return nil
}

func validateState(state State, path string) error {
	if state.SchemaVersion != SchemaVersion {
		return corruptStateErrorf(path, "unsupported schemaVersion %d", state.SchemaVersion)
	}
	if state.CodexChatGPTAuth != nil {
		if state.CodexChatGPTAuth.AccessToken == "" {
			return corruptStateErrorf(path, "codex ChatGPT access token is required")
		}
		if state.CodexChatGPTAuth.AccountID == "" {
			return corruptStateErrorf(path, "codex ChatGPT account id is required")
		}
		if state.CodexChatGPTAuth.PlanType == "" {
			return corruptStateErrorf(path, "codex ChatGPT plan type is required")
		}
		if _, err := time.Parse(time.RFC3339Nano, state.CodexChatGPTAuth.UpdatedAt); err != nil {
			return corruptStateError(path, fmt.Errorf("codex ChatGPT updatedAt must be RFC3339: %w", err))
		}
	}
	return nil
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
