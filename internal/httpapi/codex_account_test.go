package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/codexaccount"
)

func TestCodexAccountEndpointsReadAndLogin(t *testing.T) {
	service := &fakeCodexAccountService{
		state: codexaccount.CodexAccountState{
			Status:             codexaccount.AccountStatusUnauthenticated,
			RequiresOpenAIAuth: true,
		},
	}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
		CodexAccountService: service,
	})

	initial := getJSON[codexaccount.CodexAccountState](t, handler, "/codex/account", http.StatusOK)
	if initial.Status != codexaccount.AccountStatusUnauthenticated || !initial.RequiresOpenAIAuth {
		t.Fatalf("initial state = %+v, want unauthenticated Codex account", initial)
	}

	started := postJSON[codexaccount.StartCodexLoginResponse](t, handler, "/codex/account/login/start", codexaccount.StartCodexLoginRequest{
		Type: codexaccount.LoginTypeChatGPT,
	}, http.StatusOK)
	if started.Login.Status != codexaccount.LoginStatusInProgress || started.Login.AuthURL == "" {
		t.Fatalf("started login = %+v, want pending browser login", started.Login)
	}

	loggedOut := postJSON[codexaccount.CodexAccountState](t, handler, "/codex/account/logout", codexaccount.LogoutCodexAccountRequest{}, http.StatusOK)
	if loggedOut.Status != codexaccount.AccountStatusUnauthenticated {
		t.Fatalf("logged out state = %+v, want unauthenticated", loggedOut)
	}
}

func TestCodexAccountEndpointsRequireService(t *testing.T) {
	handler := newAuthenticatedTestHandler(t, HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	response := getJSON[ErrorResponse](t, handler, "/codex/account", http.StatusServiceUnavailable)
	if response.Error.Code != "codex_account_service_unavailable" {
		t.Fatalf("error code = %q, want codex_account_service_unavailable", response.Error.Code)
	}
}

func TestCodexAccountEventStreamForwardsTypedChanges(t *testing.T) {
	changes := make(chan codexaccount.CodexAccountChangeEvent, 1)
	service := &fakeCodexAccountService{changes: changes}
	handler := newAuthenticatedTestHandler(t, HandlerConfig{
		Metadata:            BackendMetadata{Name: BackendName, Version: "test"},
		CodexAccountService: service,
	})
	server := httptest.NewServer(handler)
	defer server.Close()

	response, err := server.Client().Get(server.URL + "/codex/account/events")
	if err != nil {
		t.Fatalf("open Codex account event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	event := codexaccount.CodexAccountChangeEvent{
		StreamID: "codex-account-test",
		Sequence: 3,
		Reason:   codexaccount.AccountChangeLoginCompleted,
	}
	changes <- event

	reader := bufio.NewReader(response.Body)
	assertSSELine(t, reader, "id: codex-account-test:3")
	assertSSELine(t, reader, "event: codex.account.changed")
	data := assertSSELinePrefix(t, reader, "data: ")
	var decoded codexaccount.CodexAccountChangeEvent
	if err := json.Unmarshal([]byte(data), &decoded); err != nil {
		t.Fatalf("decode Codex account event: %v", err)
	}
	if decoded != event {
		t.Fatalf("event = %+v, want %+v", decoded, event)
	}
	assertSSELine(t, reader, "")
}

type fakeCodexAccountService struct {
	changes <-chan codexaccount.CodexAccountChangeEvent
	state   codexaccount.CodexAccountState
}

func (service *fakeCodexAccountService) SubscribeChanges() codexaccount.CodexAccountChangeSubscription {
	if service.changes != nil {
		return fakeCodexAccountChangeSubscription{events: service.changes}
	}
	closed := make(chan codexaccount.CodexAccountChangeEvent)
	close(closed)
	return fakeCodexAccountChangeSubscription{events: closed}
}

type fakeCodexAccountChangeSubscription struct {
	events <-chan codexaccount.CodexAccountChangeEvent
}

func (subscription fakeCodexAccountChangeSubscription) Events() <-chan codexaccount.CodexAccountChangeEvent {
	return subscription.events
}

func (fakeCodexAccountChangeSubscription) Unsubscribe() {}

func (service *fakeCodexAccountService) Read(context.Context) (codexaccount.CodexAccountState, error) {
	return service.state, nil
}

func (service *fakeCodexAccountService) Refresh(context.Context, codexaccount.RefreshCodexAccountRequest) (codexaccount.CodexAccountState, error) {
	return service.state, nil
}

func (service *fakeCodexAccountService) StartLogin(context.Context, codexaccount.StartCodexLoginRequest) (codexaccount.StartCodexLoginResponse, error) {
	login := codexaccount.CodexLoginState{
		Status:  codexaccount.LoginStatusInProgress,
		Type:    codexaccount.LoginTypeChatGPT,
		LoginID: "login_fake",
		AuthURL: "https://chatgpt.com/login/fake",
	}
	service.state.Status = codexaccount.AccountStatusLoginInProgress
	service.state.Login = &login
	return codexaccount.StartCodexLoginResponse{State: service.state, Login: login}, nil
}

func (service *fakeCodexAccountService) CancelLogin(context.Context, codexaccount.CancelCodexLoginRequest) (codexaccount.CodexAccountState, error) {
	service.state.Status = codexaccount.AccountStatusUnauthenticated
	service.state.Login = nil
	return service.state, nil
}

func (service *fakeCodexAccountService) Logout(context.Context, codexaccount.LogoutCodexAccountRequest) (codexaccount.CodexAccountState, error) {
	service.state.Status = codexaccount.AccountStatusUnauthenticated
	service.state.Account = nil
	service.state.Login = nil
	return service.state, nil
}

func assertSSELine(t *testing.T, reader *bufio.Reader, want string) {
	t.Helper()
	got := assertSSELinePrefix(t, reader, "")
	if got != want {
		t.Fatalf("SSE line = %q, want %q", got, want)
	}
}

func assertSSELinePrefix(t *testing.T, reader *bufio.Reader, prefix string) string {
	t.Helper()
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("read SSE line: %v", err)
	}
	line = strings.TrimSuffix(line, "\n")
	line = strings.TrimSuffix(line, "\r")
	if !strings.HasPrefix(line, prefix) {
		t.Fatalf("SSE line = %q, want prefix %q", line, prefix)
	}
	return strings.TrimPrefix(line, prefix)
}

func getJSON[T any](t *testing.T, handler http.Handler, path string, wantStatus int) T {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, path, nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != wantStatus {
		t.Fatalf("%s status = %d, want %d, body: %s", path, response.Code, wantStatus, response.Body.String())
	}
	var decoded T
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode response %s: %v", path, err)
	}
	return decoded
}
