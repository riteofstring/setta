package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
	handler := NewHandler(HandlerConfig{
		AuthToken:           testAuthToken,
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
	handler := NewHandler(HandlerConfig{AuthToken: testAuthToken, Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	response := getJSON[ErrorResponse](t, handler, "/codex/account", http.StatusServiceUnavailable)
	if response.Error.Code != "codex_account_service_unavailable" {
		t.Fatalf("error code = %q, want codex_account_service_unavailable", response.Error.Code)
	}
}

type fakeCodexAccountService struct {
	state codexaccount.CodexAccountState
}

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

func getJSON[T any](t *testing.T, handler http.Handler, path string, wantStatus int) T {
	t.Helper()

	request := httptest.NewRequest(http.MethodGet, path, nil)
	authorizeTestRequest(request)
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
