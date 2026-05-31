package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"setta/internal/provideraccounts"
)

func TestProviderAccountEndpointsManageChatGPTAuth(t *testing.T) {
	service := newProviderAccountServiceForHTTPTest(t)
	handler := NewHandler(HandlerConfig{
		Metadata:               BackendMetadata{Name: BackendName, Version: "test"},
		ProviderAccountService: service,
	})

	initial := getJSON[provideraccounts.ProviderAccounts](t, handler, "/provider-accounts", http.StatusOK)
	if len(initial.Accounts) != 1 || initial.Accounts[0].Configured {
		t.Fatalf("initial accounts = %+v, want unconfigured account", initial.Accounts)
	}

	configured := postJSON[provideraccounts.ProviderAccounts](t, handler, "/provider-accounts/chatgpt-auth/save", provideraccounts.SaveChatGPTAuthRequest{
		AccessToken: "access_token_fake",
		AccountID:   "account_fake",
		PlanType:    "chatgptPlus",
	}, http.StatusOK)
	if len(configured.Accounts) != 1 || !configured.Accounts[0].Configured || configured.Accounts[0].AccountID != "account_fake" {
		t.Fatalf("configured accounts = %+v, want configured account", configured.Accounts)
	}

	cleared := postJSON[provideraccounts.ProviderAccounts](t, handler, "/provider-accounts/chatgpt-auth/clear", provideraccounts.ClearChatGPTAuthRequest{}, http.StatusOK)
	if len(cleared.Accounts) != 1 || cleared.Accounts[0].Configured {
		t.Fatalf("cleared accounts = %+v, want unconfigured account", cleared.Accounts)
	}
}

func TestProviderAccountEndpointsRequireService(t *testing.T) {
	handler := NewHandler(HandlerConfig{Metadata: BackendMetadata{Name: BackendName, Version: "test"}})
	response := getJSON[ErrorResponse](t, handler, "/provider-accounts", http.StatusServiceUnavailable)
	if response.Error.Code != "provider_account_service_unavailable" {
		t.Fatalf("error code = %q, want provider_account_service_unavailable", response.Error.Code)
	}
}

func newProviderAccountServiceForHTTPTest(t *testing.T) *provideraccounts.Service {
	t.Helper()

	store, err := provideraccounts.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new provider account store: %v", err)
	}
	service, err := provideraccounts.NewService(store)
	if err != nil {
		t.Fatalf("new provider account service: %v", err)
	}
	return service
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
