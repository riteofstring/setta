package codexaccount

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"

	"setta/internal/codexapp"
)

type CodexAccountStatus string
type CodexAccountType string
type CodexLoginType string
type CodexLoginStatus string
type CodexChatGPTPlanType string
type CodexAccountChangeReason string

const (
	AccountStatusSignedIn        CodexAccountStatus = "signed_in"
	AccountStatusUnauthenticated CodexAccountStatus = "unauthenticated"
	AccountStatusUnavailable     CodexAccountStatus = "unavailable"
	AccountStatusLoginInProgress CodexAccountStatus = "login_in_progress"

	AccountTypeAPIKey            CodexAccountType = "apiKey"
	AccountTypeChatGPT           CodexAccountType = "chatgpt"
	AccountTypeChatGPTAuthTokens CodexAccountType = "chatgptAuthTokens"

	LoginTypeAPIKey            CodexLoginType = "apiKey"
	LoginTypeChatGPT           CodexLoginType = "chatgpt"
	LoginTypeChatGPTDeviceCode CodexLoginType = "chatgptDeviceCode"

	LoginStatusInProgress CodexLoginStatus = "in_progress"
	LoginStatusSucceeded  CodexLoginStatus = "succeeded"
	LoginStatusFailed     CodexLoginStatus = "failed"
	LoginStatusCancelled  CodexLoginStatus = "cancelled"

	ChatGPTPlanBusiness                   CodexChatGPTPlanType = "business"
	ChatGPTPlanEdu                        CodexChatGPTPlanType = "edu"
	ChatGPTPlanEnterprise                 CodexChatGPTPlanType = "enterprise"
	ChatGPTPlanEnterpriseCBPUsageBased    CodexChatGPTPlanType = "enterprise_cbp_usage_based"
	ChatGPTPlanFree                       CodexChatGPTPlanType = "free"
	ChatGPTPlanGo                         CodexChatGPTPlanType = "go"
	ChatGPTPlanPlus                       CodexChatGPTPlanType = "plus"
	ChatGPTPlanPro                        CodexChatGPTPlanType = "pro"
	ChatGPTPlanProLite                    CodexChatGPTPlanType = "prolite"
	ChatGPTPlanSelfServeBusinessUsageBase CodexChatGPTPlanType = "self_serve_business_usage_based"
	ChatGPTPlanTeam                       CodexChatGPTPlanType = "team"
	ChatGPTPlanUnknown                    CodexChatGPTPlanType = "unknown"

	AccountChangeSnapshotRequired CodexAccountChangeReason = "snapshot_required"
	AccountChangeLoginCompleted   CodexAccountChangeReason = "login_completed"
	AccountChangeLoginMalformed   CodexAccountChangeReason = "login_completed_malformed"
	AccountChangeAccountUpdated   CodexAccountChangeReason = "account_updated"
)

var (
	accountStatusValues = []CodexAccountStatus{
		AccountStatusSignedIn,
		AccountStatusUnauthenticated,
		AccountStatusUnavailable,
		AccountStatusLoginInProgress,
	}
	accountTypeValues = []CodexAccountType{
		AccountTypeAPIKey,
		AccountTypeChatGPT,
		AccountTypeChatGPTAuthTokens,
	}
	loginTypeValues = []CodexLoginType{
		LoginTypeAPIKey,
		LoginTypeChatGPT,
		LoginTypeChatGPTDeviceCode,
	}
	loginStatusValues = []CodexLoginStatus{
		LoginStatusInProgress,
		LoginStatusSucceeded,
		LoginStatusFailed,
		LoginStatusCancelled,
	}
	chatGPTPlanTypeValues = []CodexChatGPTPlanType{
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
	accountChangeReasonValues = []CodexAccountChangeReason{
		AccountChangeSnapshotRequired,
		AccountChangeLoginCompleted,
		AccountChangeLoginMalformed,
		AccountChangeAccountUpdated,
	}
)

type ContractValueSet struct {
	Name   string
	Values []string
}

func ContractValueSets() []ContractValueSet {
	return []ContractValueSet{
		{Name: "CodexAccountStatus", Values: stringValues(accountStatusValues)},
		{Name: "CodexAccountType", Values: stringValues(accountTypeValues)},
		{Name: "CodexLoginType", Values: stringValues(loginTypeValues)},
		{Name: "CodexLoginStatus", Values: stringValues(loginStatusValues)},
		{Name: "CodexChatGPTPlanType", Values: stringValues(chatGPTPlanTypeValues)},
		{Name: "CodexAccountChangeReason", Values: stringValues(accountChangeReasonValues)},
	}
}

type CodexAccountState struct {
	Status             CodexAccountStatus `json:"status"`
	Account            *CodexAccount      `json:"account"`
	RequiresOpenAIAuth bool               `json:"requiresOpenaiAuth"`
	Login              *CodexLoginState   `json:"login"`
	Diagnostic         string             `json:"diagnostic"`
}

type CodexAccount struct {
	Type     CodexAccountType      `json:"type"`
	Email    string                `json:"email"`
	PlanType *CodexChatGPTPlanType `json:"planType"`
}

type CodexLoginState struct {
	Status          CodexLoginStatus `json:"status"`
	Type            CodexLoginType   `json:"type"`
	LoginID         string           `json:"loginId"`
	AuthURL         string           `json:"authUrl"`
	VerificationURL string           `json:"verificationUrl"`
	UserCode        string           `json:"userCode"`
	Error           string           `json:"error"`
}

type RefreshCodexAccountRequest struct {
	RefreshToken bool `json:"refreshToken"`
}

type StartCodexLoginRequest struct {
	Type   CodexLoginType `json:"type"`
	APIKey string         `json:"apiKey"`
}

type StartCodexLoginResponse struct {
	State CodexAccountState `json:"state"`
	Login CodexLoginState   `json:"login"`
}

type CancelCodexLoginRequest struct {
	LoginID string `json:"loginId"`
}

type LogoutCodexAccountRequest struct{}

type CodexAccountChangeEvent struct {
	StreamID string                   `json:"streamId"`
	Sequence int                      `json:"sequence"`
	Reason   CodexAccountChangeReason `json:"reason"`
}

func (event CodexAccountChangeEvent) Validate() error {
	if strings.TrimSpace(event.StreamID) == "" || event.StreamID != strings.TrimSpace(event.StreamID) {
		return errors.New("Codex account change stream ID is required without surrounding whitespace")
	}
	if event.Sequence < 0 {
		return errors.New("Codex account change sequence must not be negative")
	}
	for _, reason := range accountChangeReasonValues {
		if event.Reason == reason {
			return nil
		}
	}
	return fmt.Errorf("unsupported Codex account change reason: %s", event.Reason)
}

type CodexAccountChangeSubscription interface {
	Events() <-chan CodexAccountChangeEvent
	Unsubscribe()
}

type codexAccountChangeSubscription struct {
	service *Service
	id      uint64
	events  <-chan CodexAccountChangeEvent
	once    sync.Once
}

func (subscription *codexAccountChangeSubscription) Events() <-chan CodexAccountChangeEvent {
	return subscription.events
}

func (subscription *codexAccountChangeSubscription) Unsubscribe() {
	subscription.once.Do(func() {
		subscription.service.unsubscribeChanges(subscription.id)
	})
}

type Service struct {
	manager *codexapp.Manager

	mu                     sync.Mutex
	login                  *CodexLoginState
	changeStreamID         string
	changeSequence         int
	nextChangeSubscriberID uint64
	changeSubscribers      map[uint64]chan CodexAccountChangeEvent
}

func NewService(manager *codexapp.Manager) (*Service, error) {
	if manager == nil {
		return nil, errors.New("codex app-server manager is required")
	}
	streamID, err := newChangeStreamID()
	if err != nil {
		return nil, fmt.Errorf("create Codex account change stream ID: %w", err)
	}
	service := &Service{
		manager:           manager,
		changeStreamID:    streamID,
		changeSubscribers: map[uint64]chan CodexAccountChangeEvent{},
	}
	manager.RegisterNotificationHandler("account/login/completed", service.handleLoginCompleted)
	manager.RegisterNotificationHandler("account/updated", service.handleAccountUpdated)
	return service, nil
}

func (service *Service) SubscribeChanges() CodexAccountChangeSubscription {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.nextChangeSubscriberID++
	id := service.nextChangeSubscriberID
	events := make(chan CodexAccountChangeEvent, 1)
	events <- service.changeEventLocked(AccountChangeSnapshotRequired)
	service.changeSubscribers[id] = events
	return &codexAccountChangeSubscription{service: service, id: id, events: events}
}

func (service *Service) Read(ctx context.Context) (CodexAccountState, error) {
	return service.read(ctx, false)
}

func (service *Service) Refresh(ctx context.Context, request RefreshCodexAccountRequest) (CodexAccountState, error) {
	return service.read(ctx, request.RefreshToken)
}

func (service *Service) StartLogin(ctx context.Context, request StartCodexLoginRequest) (StartCodexLoginResponse, error) {
	params, err := loginStartParams(request)
	if err != nil {
		return StartCodexLoginResponse{}, err
	}
	raw, err := service.manager.Call(ctx, "account/login/start", params)
	if err != nil {
		return StartCodexLoginResponse{}, fmt.Errorf("start codex account login: %w", err)
	}
	login, err := loginStateFromStartResponse(raw)
	if err != nil {
		return StartCodexLoginResponse{}, err
	}
	service.setLogin(login)
	state, err := service.Read(ctx)
	if err != nil {
		return StartCodexLoginResponse{}, err
	}
	if state.Login == nil {
		state.Login = &login
		if state.Status == AccountStatusUnauthenticated {
			state.Status = AccountStatusLoginInProgress
		}
	}
	return StartCodexLoginResponse{State: state, Login: login}, nil
}

func (service *Service) CancelLogin(ctx context.Context, request CancelCodexLoginRequest) (CodexAccountState, error) {
	if request.LoginID == "" {
		return CodexAccountState{}, errors.New("login ID is required")
	}
	if _, err := service.manager.Call(ctx, "account/login/cancel", map[string]any{"loginId": request.LoginID}); err != nil {
		return CodexAccountState{}, fmt.Errorf("cancel codex account login: %w", err)
	}
	service.updateLogin(CodexLoginState{LoginID: request.LoginID, Status: LoginStatusCancelled})
	return service.Read(ctx)
}

func (service *Service) Logout(ctx context.Context, _ LogoutCodexAccountRequest) (CodexAccountState, error) {
	if _, err := service.manager.Call(ctx, "account/logout", map[string]any{}); err != nil {
		return CodexAccountState{}, fmt.Errorf("logout codex account: %w", err)
	}
	service.clearLogin()
	return service.Read(ctx)
}

func (service *Service) read(ctx context.Context, refreshToken bool) (CodexAccountState, error) {
	raw, err := service.manager.Call(ctx, "account/read", map[string]any{"refreshToken": refreshToken})
	if err != nil {
		return service.unavailableState(err), nil
	}
	state, err := stateFromAccountRead(raw)
	if err != nil {
		return CodexAccountState{}, err
	}
	login := service.currentLogin()
	if login != nil && login.Status == LoginStatusInProgress && state.Account == nil {
		state.Status = AccountStatusLoginInProgress
		state.Login = login
	}
	if login != nil && login.Status != LoginStatusInProgress {
		state.Login = login
	}
	return state, nil
}

func (service *Service) unavailableState(err error) CodexAccountState {
	return CodexAccountState{
		Status:     AccountStatusUnavailable,
		Diagnostic: err.Error(),
	}
}

func (service *Service) handleLoginCompleted(message codexapp.Message) {
	params, err := objectValue(message.Params, "codex account login completed")
	if err != nil {
		service.updateLogin(CodexLoginState{Status: LoginStatusFailed, Error: err.Error()})
		service.emitChanged(AccountChangeLoginMalformed)
		return
	}
	loginID, err := optionalString(params, "loginId", "codex account login completed")
	if err != nil {
		service.updateLogin(CodexLoginState{Status: LoginStatusFailed, Error: err.Error()})
		service.emitChanged(AccountChangeLoginMalformed)
		return
	}
	success, err := requireBool(params, "success", "codex account login completed")
	if err != nil {
		service.updateLogin(CodexLoginState{LoginID: loginID, Status: LoginStatusFailed, Error: err.Error()})
		service.emitChanged(AccountChangeLoginMalformed)
		return
	}
	errorText, err := optionalString(params, "error", "codex account login completed")
	if err != nil {
		service.updateLogin(CodexLoginState{LoginID: loginID, Status: LoginStatusFailed, Error: err.Error()})
		service.emitChanged(AccountChangeLoginMalformed)
		return
	}
	if success {
		service.updateLogin(CodexLoginState{LoginID: loginID, Status: LoginStatusSucceeded})
		service.emitChanged(AccountChangeLoginCompleted)
		return
	}
	status := LoginStatusFailed
	if errorText == "" {
		status = LoginStatusCancelled
	}
	service.updateLogin(CodexLoginState{LoginID: loginID, Status: status, Error: errorText})
	service.emitChanged(AccountChangeLoginCompleted)
}

func (service *Service) handleAccountUpdated(message codexapp.Message) {
	params, err := objectValue(message.Params, "codex account updated")
	if err == nil {
		if _, authErr := optionalString(params, "authMode", "codex account updated"); authErr == nil {
			service.clearLogin()
		}
	}
	service.emitChanged(AccountChangeAccountUpdated)
}

func (service *Service) emitChanged(reason CodexAccountChangeReason) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.changeSequence++
	event := service.changeEventLocked(reason)
	for _, subscriber := range service.changeSubscribers {
		select {
		case subscriber <- event:
		default:
		}
	}
}

func (service *Service) changeEventLocked(reason CodexAccountChangeReason) CodexAccountChangeEvent {
	return CodexAccountChangeEvent{
		StreamID: service.changeStreamID,
		Sequence: service.changeSequence,
		Reason:   reason,
	}
}

func (service *Service) unsubscribeChanges(id uint64) {
	service.mu.Lock()
	defer service.mu.Unlock()
	events, ok := service.changeSubscribers[id]
	if !ok {
		return
	}
	delete(service.changeSubscribers, id)
	close(events)
}

func newChangeStreamID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return "codex-account-" + hex.EncodeToString(value[:]), nil
}

func (service *Service) setLogin(login CodexLoginState) {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.login = &login
}

func (service *Service) updateLogin(next CodexLoginState) {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.login != nil {
		if next.Type == "" {
			next.Type = service.login.Type
		}
		if next.AuthURL == "" {
			next.AuthURL = service.login.AuthURL
		}
		if next.VerificationURL == "" {
			next.VerificationURL = service.login.VerificationURL
		}
		if next.UserCode == "" {
			next.UserCode = service.login.UserCode
		}
	}
	service.login = &next
}

func (service *Service) clearLogin() {
	service.mu.Lock()
	defer service.mu.Unlock()
	service.login = nil
}

func (service *Service) currentLogin() *CodexLoginState {
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.login == nil {
		return nil
	}
	login := *service.login
	return &login
}

func loginStartParams(request StartCodexLoginRequest) (map[string]any, error) {
	switch request.Type {
	case LoginTypeChatGPT, LoginTypeChatGPTDeviceCode:
		return map[string]any{"type": request.Type}, nil
	case LoginTypeAPIKey:
		if request.APIKey == "" {
			return nil, errors.New("API key is required")
		}
		return map[string]any{"type": request.Type, "apiKey": request.APIKey}, nil
	default:
		return nil, fmt.Errorf("unsupported codex login type: %s", request.Type)
	}
}

func stateFromAccountRead(raw json.RawMessage) (CodexAccountState, error) {
	response, err := objectValue(raw, "codex account read response")
	if err != nil {
		return CodexAccountState{}, err
	}
	requiresOpenAIAuth, err := requireBool(response, "requiresOpenaiAuth", "codex account read response")
	if err != nil {
		return CodexAccountState{}, err
	}
	account, err := accountFromReadResponse(response)
	if err != nil {
		return CodexAccountState{}, err
	}
	status := AccountStatusUnauthenticated
	if account != nil {
		status = AccountStatusSignedIn
	}
	return CodexAccountState{
		Status:             status,
		Account:            account,
		RequiresOpenAIAuth: requiresOpenAIAuth,
	}, nil
}

func accountFromReadResponse(response map[string]any) (*CodexAccount, error) {
	raw, ok := response["account"]
	if !ok || raw == nil {
		return nil, nil
	}
	accountObject, ok := raw.(map[string]any)
	if !ok {
		return nil, errors.New("codex account read response.account must be an object or null")
	}
	typeText, err := requireString(accountObject, "type", "codex account read response account")
	if err != nil {
		return nil, err
	}
	accountType, err := parseAccountType(typeText)
	if err != nil {
		return nil, err
	}
	email, err := optionalString(accountObject, "email", "codex account read response account")
	if err != nil {
		return nil, err
	}
	planType, err := optionalPlanType(accountObject, "planType", "codex account read response account")
	if err != nil {
		return nil, err
	}
	return &CodexAccount{Type: accountType, Email: email, PlanType: planType}, nil
}

func loginStateFromStartResponse(raw json.RawMessage) (CodexLoginState, error) {
	response, err := objectValue(raw, "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	typeText, err := requireString(response, "type", "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	loginType, err := parseLoginType(typeText)
	if err != nil {
		return CodexLoginState{}, err
	}
	loginID, err := optionalString(response, "loginId", "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	authURL, err := optionalString(response, "authUrl", "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	verificationURL, err := optionalString(response, "verificationUrl", "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	userCode, err := optionalString(response, "userCode", "codex account login start response")
	if err != nil {
		return CodexLoginState{}, err
	}
	status := LoginStatusSucceeded
	if loginID != "" {
		status = LoginStatusInProgress
	}
	return CodexLoginState{
		Status:          status,
		Type:            loginType,
		LoginID:         loginID,
		AuthURL:         authURL,
		VerificationURL: verificationURL,
		UserCode:        userCode,
	}, nil
}

func parseAccountType(value string) (CodexAccountType, error) {
	for _, candidate := range accountTypeValues {
		if string(candidate) == value {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("unsupported codex account type: %s", value)
}

func parseLoginType(value string) (CodexLoginType, error) {
	for _, candidate := range loginTypeValues {
		if string(candidate) == value {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("unsupported codex login type: %s", value)
}

func optionalPlanType(value map[string]any, name string, label string) (*CodexChatGPTPlanType, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return nil, nil
	}
	text, ok := raw.(string)
	if !ok {
		return nil, fmt.Errorf("%s.%s must be a string", label, name)
	}
	for _, candidate := range chatGPTPlanTypeValues {
		if string(candidate) == text {
			planType := candidate
			return &planType, nil
		}
	}
	return nil, fmt.Errorf("unsupported codex ChatGPT plan type: %s", text)
}

func objectValue(raw json.RawMessage, label string) (map[string]any, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("%s is required", label)
	}
	var value map[string]any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("%s must be an object: %w", label, err)
	}
	if value == nil {
		return nil, fmt.Errorf("%s must be an object", label)
	}
	return value, nil
}

func requireString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	if text == "" {
		return "", fmt.Errorf("%s.%s is required", label, name)
	}
	return text, nil
}

func optionalString(value map[string]any, name string, label string) (string, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return "", nil
	}
	text, ok := raw.(string)
	if !ok {
		return "", fmt.Errorf("%s.%s must be a string", label, name)
	}
	return text, nil
}

func requireBool(value map[string]any, name string, label string) (bool, error) {
	raw, ok := value[name]
	if !ok || raw == nil {
		return false, fmt.Errorf("%s.%s is required", label, name)
	}
	flag, ok := raw.(bool)
	if !ok {
		return false, fmt.Errorf("%s.%s must be a boolean", label, name)
	}
	return flag, nil
}

func stringValues[T ~string](values []T) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		result = append(result, string(value))
	}
	return result
}
