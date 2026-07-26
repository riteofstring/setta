package runtime

import (
	"context"
	"fmt"
	"testing"
	"time"

	"setta/internal/agent"
)

const liveCarrierIsolationTimeout = time.Minute

// A Setta conversation runs on an ephemeral carrier, so the words it said to a
// model stop existing when the process that ran them does. A live test proves
// that from outside the app: it stamps the prompts it submits with one tracking
// token, and afterwards asks the provider to find that token. A durable thread
// would answer — with a list entry, a search snippet, and a ChatGPT sidebar
// conversation the test left behind.
type liveCarrierIsolation struct {
	token string
}

// newLiveCarrierIsolation registers the discovery check as test cleanup, so a
// live test cannot pass by returning early before asking the provider what it
// remembers.
func newLiveCarrierIsolation(t *testing.T, name string) liveCarrierIsolation {
	t.Helper()
	isolation := liveCarrierIsolation{
		token: fmt.Sprintf("settalivecarrier%s%d", name, time.Now().UnixNano()),
	}
	t.Cleanup(func() {
		isolation.assertProviderRemembersNothing(t)
	})
	return isolation
}

// prompt stamps live prompt text with the tracking token. The token is context
// the carrier receives and never repeats, so exact-answer assertions stay
// exact.
func (isolation liveCarrierIsolation) prompt(text string) string {
	return text + " Conversation tracking label, context only, never repeat it: " + isolation.token + "."
}

func (isolation liveCarrierIsolation) assertProviderRemembersNothing(t *testing.T) {
	t.Helper()
	provider := agent.NewRuntime(agent.Config{
		ExcludedEnv: []string{"OPENAI_API_KEY"},
		Version:     "live-carrier-isolation",
	})
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), liveCarrierIsolationTimeout)
		defer cancel()
		if err := provider.Shutdown(shutdownCtx); err != nil {
			t.Errorf("shutdown live carrier isolation provider: %v", err)
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), liveCarrierIsolationTimeout)
	defer cancel()
	listed, err := provider.ListThreads(ctx, agent.ListThreadsRequest{
		Limit:      agent.MaxThreadPageSize,
		SearchTerm: &isolation.token,
	})
	if err != nil {
		t.Fatalf("list provider threads for %s: %v", isolation.token, err)
	}
	if len(listed.Data) != 0 {
		t.Fatalf("provider thread list found live prompt token %q: %+v", isolation.token, listed)
	}
	searched, err := provider.SearchThreads(ctx, agent.SearchThreadsRequest{
		Limit:      agent.MaxThreadPageSize,
		SearchTerm: isolation.token,
	})
	if err != nil {
		t.Fatalf("search provider threads for %s: %v", isolation.token, err)
	}
	if len(searched.Data) != 0 {
		t.Fatalf("provider thread search found live prompt token %q: %+v", isolation.token, searched)
	}
}
