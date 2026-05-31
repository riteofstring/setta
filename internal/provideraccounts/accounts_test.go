package provideraccounts

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/chat"
)

func TestServiceManagesChatGPTAuthForCodexRefresh(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	store.clock = func() time.Time {
		return time.Date(2026, 5, 31, 12, 0, 0, 0, time.UTC)
	}
	service, err := NewService(store)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	initial, err := service.ListProviderAccounts()
	if err != nil {
		t.Fatalf("list initial accounts: %v", err)
	}
	if len(initial.Accounts) != 1 || initial.Accounts[0].Configured {
		t.Fatalf("initial accounts = %+v, want unconfigured Codex ChatGPT account", initial.Accounts)
	}

	configured, err := service.SaveChatGPTAuth(SaveChatGPTAuthRequest{
		AccessToken: "access_token_fake",
		AccountID:   "account_fake",
		PlanType:    ChatGPTPlanPro,
	})
	if err != nil {
		t.Fatalf("save chatgpt auth: %v", err)
	}
	if len(configured.Accounts) != 1 || !configured.Accounts[0].Configured || configured.Accounts[0].AccountID != "account_fake" {
		t.Fatalf("configured accounts = %+v, want configured account summary", configured.Accounts)
	}

	tokens, err := service.RefreshChatGPTAuthTokens(context.Background(), chat.ChatGPTAuthRefreshRequest{Reason: "expired"})
	if err != nil {
		t.Fatalf("refresh chatgpt auth: %v", err)
	}
	if tokens.AccessToken != "access_token_fake" || tokens.ChatGPTAccountID != "account_fake" || tokens.ChatGPTPlanType != "pro" {
		t.Fatalf("tokens = %+v, want stored auth tokens", tokens)
	}

	cleared, err := service.ClearChatGPTAuth()
	if err != nil {
		t.Fatalf("clear chatgpt auth: %v", err)
	}
	if len(cleared.Accounts) != 1 || cleared.Accounts[0].Configured {
		t.Fatalf("cleared accounts = %+v, want unconfigured account", cleared.Accounts)
	}
	if _, err := service.RefreshChatGPTAuthTokens(context.Background(), chat.ChatGPTAuthRefreshRequest{Reason: "expired"}); !chat.IsChatGPTAuthUnavailable(err) {
		t.Fatalf("refresh error = %v, want chatgpt auth unavailable", err)
	}
}

func TestServiceRejectsIncompleteChatGPTAuth(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	service, err := NewService(store)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	if _, err := service.SaveChatGPTAuth(SaveChatGPTAuthRequest{AccountID: "account_fake"}); err == nil {
		t.Fatal("save succeeded without access token")
	}
	if _, err := service.SaveChatGPTAuth(SaveChatGPTAuthRequest{AccessToken: "access_token_fake"}); err == nil {
		t.Fatal("save succeeded without account id")
	}
	if _, err := service.SaveChatGPTAuth(SaveChatGPTAuthRequest{AccessToken: "access_token_fake", AccountID: "account_fake"}); err == nil {
		t.Fatal("save succeeded without plan type")
	}
	if _, err := service.SaveChatGPTAuth(SaveChatGPTAuthRequest{AccessToken: "access_token_fake", AccountID: "account_fake", PlanType: "chatgptPlus"}); err == nil {
		t.Fatal("save succeeded with unsupported plan type")
	}
}

func TestStoreRejectsInvalidPersistedChatGPTPlanType(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(store.path), 0o755); err != nil {
		t.Fatalf("create store dir: %v", err)
	}
	raw := `{"schemaVersion":1,"codexChatgptAuth":{"accessToken":"access_token_fake","accountId":"account_fake","planType":"chatgptPlus","updatedAt":"2026-05-31T12:00:00Z"}}`
	if err := os.WriteFile(store.path, []byte(raw), 0o644); err != nil {
		t.Fatalf("write provider account state: %v", err)
	}

	_, err = store.Load()
	if err == nil {
		t.Fatal("load succeeded, want corrupt provider account state")
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
	if !strings.Contains(err.Error(), "codex ChatGPT plan type is unsupported") {
		t.Fatalf("error = %q, want unsupported plan type diagnostic", err)
	}
}
