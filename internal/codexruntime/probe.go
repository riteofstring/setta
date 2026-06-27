package codexruntime

import (
	"context"
	"errors"
	"strings"

	"setta/internal/codexapp"
)

const (
	jsonRPCInvalidRequest = -32600
	jsonRPCMethodNotFound = -32601
	jsonRPCNotFound       = -32004
	startupProbeThreadID  = "00000000-0000-4000-8000-000000000001"
)

func StartupProbe(identity RuntimeIdentity) func(context.Context, *codexapp.Client) error {
	return func(ctx context.Context, client *codexapp.Client) error {
		return Probe(ctx, client, identity)
	}
}

func StartupInitializeError(identity RuntimeIdentity) func(string, error) error {
	return func(message string, cause error) error {
		return incompatibleError(CapabilityStartupProbeInitialize, identity, message, cause)
	}
}

func Probe(ctx context.Context, client *codexapp.Client, identity RuntimeIdentity) error {
	sourceKinds := []codexapp.ThreadSourceKind{codexapp.ThreadSourceKindAppServer}
	limit := 1
	if err := probeSuccessfulMethod(ctx, client, identity, codexapp.CodexMethodThreadList, codexapp.ThreadListParams{
		Limit:       &limit,
		SourceKinds: &sourceKinds,
	}, CapabilityStartupProbeThreadList); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadRead, map[string]any{
		"includeTurns": true,
		"threadId":     startupProbeThreadID,
	}, CapabilityStartupProbeThreadRead); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadTurnsList, map[string]any{
		"itemsView": "summary",
		"limit":     1,
		"threadId":  startupProbeThreadID,
	}, CapabilityStartupProbeTurnsList); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadGoalGet, codexapp.ThreadGoalGetParams{
		ThreadID: startupProbeThreadID,
	}, CapabilityStartupProbeGoalGet); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadGoalSet, codexapp.ThreadGoalSetParams{
		ThreadID: startupProbeThreadID,
	}, CapabilityStartupProbeGoalSet); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadGoalClear, codexapp.ThreadGoalClearParams{
		ThreadID: startupProbeThreadID,
	}, CapabilityStartupProbeGoalClear); err != nil {
		return err
	}
	if err := probeMissingThreadMethod(ctx, client, identity, codexapp.CodexMethodThreadSettingsUpdate, codexapp.ThreadSettingsUpdateParams{
		ThreadID: startupProbeThreadID,
	}, CapabilityStartupProbeSettings); err != nil {
		return err
	}
	return nil
}

func probeSuccessfulMethod(ctx context.Context, client *codexapp.Client, identity RuntimeIdentity, method string, params any, capability string) error {
	if _, err := client.Call(ctx, method, params); err != nil {
		return incompatibleError(capability, identity, method+" startup probe failed", err)
	}
	return nil
}

func probeMissingThreadMethod(ctx context.Context, client *codexapp.Client, identity RuntimeIdentity, method string, params any, capability string) error {
	if _, err := client.Call(ctx, method, params); err != nil {
		if expectedMissingThreadError(err) {
			return nil
		}
		return incompatibleError(capability, identity, method+" startup probe did not return the expected missing-thread error", err)
	}
	return incompatibleError(capability, identity, method+" startup probe unexpectedly succeeded for the missing probe thread", nil)
}

func expectedMissingThreadError(err error) bool {
	var rpcErr *codexapp.RPCError
	if !errors.As(err, &rpcErr) {
		return false
	}
	if rpcErr.Code == jsonRPCMethodNotFound {
		return false
	}
	if rpcErr.Code != jsonRPCInvalidRequest && rpcErr.Code != jsonRPCNotFound {
		return false
	}
	message := strings.ToLower(strings.TrimSpace(rpcErr.Message))
	return strings.HasPrefix(message, "thread not found") ||
		strings.HasPrefix(message, "thread not loaded") ||
		strings.Contains(message, " is not materialized yet;")
}
