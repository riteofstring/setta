package codexaccount

import (
	"bufio"
	"context"
	"encoding/json"
	"os"
	"testing"
	"time"

	"setta/internal/codexapp"
)

func TestServiceReadsSignedInChatGPTAccount(t *testing.T) {
	service, manager, _ := newTestService(t, "signed-in")
	defer shutdownManager(t, manager)

	state, err := service.Read(context.Background())
	if err != nil {
		t.Fatalf("read account: %v", err)
	}
	if state.Status != AccountStatusSignedIn || state.Account == nil {
		t.Fatalf("state = %+v, want signed-in account", state)
	}
	if state.Account.Type != AccountTypeChatGPT || state.Account.Email != "user@example.com" {
		t.Fatalf("account = %+v, want ChatGPT account", state.Account)
	}
	if state.Account.PlanType == nil || *state.Account.PlanType != ChatGPTPlanPro {
		t.Fatalf("plan = %v, want pro", state.Account.PlanType)
	}
}

func TestServiceReturnsUnavailableStateWhenAppServerCannotStart(t *testing.T) {
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{Command: "/missing/codex-app-server"},
	})
	service, err := NewService(manager)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}

	state, err := service.Read(context.Background())
	if err != nil {
		t.Fatalf("read account: %v", err)
	}
	if state.Status != AccountStatusUnavailable || state.Diagnostic == "" {
		t.Fatalf("state = %+v, want unavailable diagnostic", state)
	}
}

func TestServiceStartsLoginAndPublishesNotificationChanges(t *testing.T) {
	service, manager, changes := newTestService(t, "login")
	defer shutdownManager(t, manager)
	waitForChange(t, changes, AccountChangeSnapshotRequired)

	result, err := service.StartLogin(context.Background(), StartCodexLoginRequest{Type: LoginTypeChatGPT})
	if err != nil {
		t.Fatalf("start login: %v", err)
	}
	if result.Login.Status != LoginStatusInProgress || result.Login.AuthURL == "" {
		t.Fatalf("login = %+v, want pending browser login", result.Login)
	}
	completed := waitForChange(t, changes, AccountChangeLoginCompleted)
	if completed.Sequence < 1 {
		t.Fatalf("login-completed change sequence = %d, want positive", completed.Sequence)
	}

	state, err := service.Read(context.Background())
	if err != nil {
		t.Fatalf("read account: %v", err)
	}
	if state.Status != AccountStatusSignedIn || state.Account == nil || state.Account.Email != "user@example.com" {
		t.Fatalf("state = %+v, want signed-in account after login", state)
	}
}

func TestServiceLogoutClearsAccount(t *testing.T) {
	service, manager, _ := newTestService(t, "signed-in")
	defer shutdownManager(t, manager)

	state, err := service.Logout(context.Background(), LogoutCodexAccountRequest{})
	if err != nil {
		t.Fatalf("logout: %v", err)
	}
	if state.Status != AccountStatusUnauthenticated || state.Account != nil {
		t.Fatalf("state = %+v, want signed-out account", state)
	}
}

func TestCodexAccountFakeAppServer(t *testing.T) {
	mode := os.Getenv("SETTA_CODEXACCOUNT_FAKE")
	if mode == "" {
		return
	}
	runFakeAccountAppServer(mode)
	os.Exit(0)
}

type fakeAccountState struct {
	account map[string]any
}

func newTestService(t *testing.T, mode string) (*Service, *codexapp.Manager, <-chan CodexAccountChangeEvent) {
	t.Helper()
	manager := codexapp.NewManager(codexapp.ManagerConfig{
		Process: codexapp.ProcessConfig{
			Args:    []string{"-test.run=TestCodexAccountFakeAppServer", "--"},
			Command: os.Args[0],
			Env:     []string{"SETTA_CODEXACCOUNT_FAKE=" + mode},
		},
		InitializeParams: map[string]any{"clientInfo": map[string]any{"name": "test"}},
	})
	service, err := NewService(manager)
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	subscription := service.SubscribeChanges()
	t.Cleanup(subscription.Unsubscribe)
	return service, manager, subscription.Events()
}

func shutdownManager(t *testing.T, manager *codexapp.Manager) {
	t.Helper()
	if err := manager.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown manager: %v", err)
	}
}

func waitForChange(
	t *testing.T,
	changes <-chan CodexAccountChangeEvent,
	want CodexAccountChangeReason,
) CodexAccountChangeEvent {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case got := <-changes:
			if err := got.Validate(); err != nil {
				t.Fatalf("invalid account change event: %v", err)
			}
			if got.Reason == want {
				return got
			}
		case <-deadline:
			t.Fatalf("timed out waiting for account change %s", want)
		}
	}
}

func runFakeAccountAppServer(mode string) {
	scanner := bufio.NewScanner(os.Stdin)
	state := fakeAccountState{}
	if mode == "signed-in" {
		state.account = fakeChatGPTAccount()
	}
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		handleFakeAccountMessage(&state, message)
	}
}

func handleFakeAccountMessage(state *fakeAccountState, message map[string]any) {
	switch message["method"] {
	case "initialize":
		writeFakeAccountResponse(message["id"], map[string]any{"ok": true})
	case "initialized":
	case "account/read":
		writeFakeAccountResponse(message["id"], map[string]any{
			"account":            state.account,
			"requiresOpenaiAuth": true,
		})
	case "account/login/start":
		state.account = fakeChatGPTAccount()
		writeFakeAccountResponse(message["id"], map[string]any{
			"authUrl": "https://chatgpt.com/auth/fake",
			"loginId": "login_fake",
			"type":    "chatgpt",
		})
		writeFakeAccountNotification("account/login/completed", map[string]any{
			"error":   nil,
			"loginId": "login_fake",
			"success": true,
		})
		writeFakeAccountNotification("account/updated", map[string]any{
			"authMode": "chatgpt",
			"planType": "pro",
		})
	case "account/logout":
		state.account = nil
		writeFakeAccountResponse(message["id"], map[string]any{})
		writeFakeAccountNotification("account/updated", map[string]any{
			"authMode": nil,
			"planType": nil,
		})
	default:
		writeFakeAccountResponse(message["id"], map[string]any{})
	}
}

func fakeChatGPTAccount() map[string]any {
	return map[string]any{
		"email":    "user@example.com",
		"planType": "pro",
		"type":     "chatgpt",
	}
}

func writeFakeAccountResponse(id any, result any) {
	writeFakeAccountMessage(map[string]any{"id": id, "result": result})
}

func writeFakeAccountNotification(method string, params any) {
	writeFakeAccountMessage(map[string]any{"method": method, "params": params})
}

func writeFakeAccountMessage(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	os.Stdout.Write(append(data, '\n'))
}
