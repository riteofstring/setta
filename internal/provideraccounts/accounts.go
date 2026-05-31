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

	ProviderCodex   ProviderAccountProvider = "codex"
	AuthModeChatGPT ProviderAccountAuthMode = "chatgpt"

	ChatGPTPlanBusiness                   ChatGPTPlanType = "business"
	ChatGPTPlanEdu                        ChatGPTPlanType = "edu"
	ChatGPTPlanEnterprise                 ChatGPTPlanType = "enterprise"
	ChatGPTPlanEnterpriseCBPUsageBased    ChatGPTPlanType = "enterprise_cbp_usage_based"
	ChatGPTPlanFree                       ChatGPTPlanType = "free"
	ChatGPTPlanGo                         ChatGPTPlanType = "go"
	ChatGPTPlanPlus                       ChatGPTPlanType = "plus"
	ChatGPTPlanPro                        ChatGPTPlanType = "pro"
	ChatGPTPlanProLite                    ChatGPTPlanType = "prolite"
	ChatGPTPlanSelfServeBusinessUsageBase ChatGPTPlanType = "self_serve_business_usage_based"
	ChatGPTPlanTeam                       ChatGPTPlanType = "team"
	ChatGPTPlanUnknown                    ChatGPTPlanType = "unknown"

	accountsFileName = "provider-accounts.json"
)

type ProviderAccountProvider string
type ProviderAccountAuthMode string
type ChatGPTPlanType string

var (
	providerAccountProviderValues = []ProviderAccountProvider{ProviderCodex}
	providerAccountAuthModeValues = []ProviderAccountAuthMode{AuthModeChatGPT}
	chatGPTPlanTypeValues         = []ChatGPTPlanType{
		ChatGPTPlanBusiness,
		ChatGPTPlanEdu,
		ChatGPTPlanEnterprise,
		ChatGPTPlanEnterpriseCBPUsageBased,
		ChatGPTPlanFree,
		ChatGPTPlanGo,
		ChatGPTPlanPlus,
		ChatGPTPlanPro,
		ChatGPTPlanProLite,
		ChatGPTPlanSelfServeBusinessUsageBase,
		ChatGPTPlanTeam,
		ChatGPTPlanUnknown,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "ProviderAccountProvider", Values: stringValues(providerAccountProviderValues)},
		{Name: "ProviderAccountAuthMode", Values: stringValues(providerAccountAuthModeValues)},
		{Name: "ChatGPTPlanType", Values: stringValues(chatGPTPlanTypeValues)},
	}
}

type ProviderAccounts struct {
	Accounts []ProviderAccountSummary `json:"accounts"`
}

type ProviderAccountSummary struct {
	Provider   ProviderAccountProvider `json:"provider"`
	AuthMode   ProviderAccountAuthMode `json:"authMode"`
	Configured bool                    `json:"configured"`
	AccountID  string                  `json:"accountId"`
	PlanType   *ChatGPTPlanType        `json:"planType"`
	UpdatedAt  string                  `json:"updatedAt"`
	Diagnostic string                  `json:"diagnostic"`
}

type SaveChatGPTAuthRequest struct {
	AccessToken string          `json:"accessToken"`
	AccountID   string          `json:"accountId"`
	PlanType    ChatGPTPlanType `json:"planType"`
}

type ClearChatGPTAuthRequest struct{}

type State struct {
	SchemaVersion    int               `json:"schemaVersion"`
	CodexChatGPTAuth *ChatGPTAuthState `json:"codexChatgptAuth"`
}

type ChatGPTAuthState struct {
	AccessToken string          `json:"accessToken"`
	AccountID   string          `json:"accountId"`
	PlanType    ChatGPTPlanType `json:"planType"`
	UpdatedAt   string          `json:"updatedAt"`
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
		ChatGPTPlanType:  string(state.CodexChatGPTAuth.PlanType),
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
	state.CodexChatGPTAuth = &ChatGPTAuthState{
		AccessToken: request.AccessToken,
		AccountID:   request.AccountID,
		PlanType:    request.PlanType,
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
		planType := state.CodexChatGPTAuth.PlanType
		summary.Configured = true
		summary.AccountID = state.CodexChatGPTAuth.AccountID
		summary.PlanType = &planType
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
	if request.PlanType == "" {
		return errors.New("plan type is required")
	}
	if !validChatGPTPlanType(request.PlanType) {
		return fmt.Errorf("unsupported plan type: %s", request.PlanType)
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
		if !validChatGPTPlanType(state.CodexChatGPTAuth.PlanType) {
			return corruptStateErrorf(path, "codex ChatGPT plan type is unsupported: %s", state.CodexChatGPTAuth.PlanType)
		}
		if _, err := time.Parse(time.RFC3339Nano, state.CodexChatGPTAuth.UpdatedAt); err != nil {
			return corruptStateError(path, fmt.Errorf("codex ChatGPT updatedAt must be RFC3339: %w", err))
		}
	}
	return nil
}

func validChatGPTPlanType(planType ChatGPTPlanType) bool {
	for _, value := range chatGPTPlanTypeValues {
		if planType == value {
			return true
		}
	}
	return false
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
