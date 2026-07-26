package conversation

import (
	"context"
	"fmt"
	"testing"
	"time"

	"setta/internal/agent"
)

const liveCarrierIsolationTimeout = time.Minute

// A conversation's carriers are ephemeral, so the prompts a live test sends
// through the service should be unfindable once the runs that carried them are
// over. The test stamps its prompts with one tracking token and then asks the
// provider to find it: a durable thread would answer with a list entry, a
// search snippet, and a ChatGPT sidebar conversation the test left behind.
type liveCarrierIsolation struct {
	provider *agent.Runtime
	token    string
}

// newLiveCarrierIsolation registers the discovery check as test cleanup, so a
// live test cannot pass by failing before it asks the provider what it
// remembers. Register it after the provider's own shutdown cleanup: cleanups
// run last-registered first, so the provider is still running for the check.
func newLiveCarrierIsolation(t *testing.T, provider *agent.Runtime, name string) liveCarrierIsolation {
	t.Helper()
	isolation := liveCarrierIsolation{
		provider: provider,
		token:    fmt.Sprintf("settalivecarrier%s%d", name, time.Now().UnixNano()),
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
	ctx, cancel := context.WithTimeout(context.Background(), liveCarrierIsolationTimeout)
	defer cancel()
	listed, err := isolation.provider.ListThreads(ctx, agent.ListThreadsRequest{
		Limit:      agent.MaxThreadPageSize,
		SearchTerm: &isolation.token,
	})
	if err != nil {
		t.Fatalf("list provider threads for %s: %v", isolation.token, err)
	}
	if len(listed.Data) != 0 {
		t.Fatalf("provider thread list found live prompt token %q: %+v", isolation.token, listed)
	}
	searched, err := isolation.provider.SearchThreads(ctx, agent.SearchThreadsRequest{
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
