package externalagents

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"setta/internal/agentruns"
	"setta/internal/mcpx"
)

func (e *CodexExecutor) checkPendingFunctionCallStall(runID string, eventState *codexEventState) error {
	if e == nil || eventState == nil {
		return nil
	}
	stalled := eventState.stalledPendingFunctionCall(
		runID,
		e.runtime,
		time.Now().UTC(),
		e.toolDispatchTimeout,
		e.toolResultTimeout,
	)
	if stalled == nil {
		return nil
	}
	switch stalled.Reason {
	case "dispatch":
		return fmt.Errorf("codex announced MCP tool call %q (%s) but Setta never received the request within %s", stalled.ToolName, stalled.ToolCallID, e.toolDispatchTimeout)
	case "result":
		return fmt.Errorf("codex MCP tool call %q (%s) completed in Setta but Codex never returned a tool result within %s", stalled.ToolName, stalled.ToolCallID, e.toolResultTimeout)
	default:
		return fmt.Errorf("codex tool call %q (%s) stalled", stalled.ToolName, stalled.ToolCallID)
	}
}

func (e *CodexExecutor) seedConfigMCPStatuses(runID string, configPath string) {
	statuses := buildUnknownCodexMCPStatuses(configPath)
	if len(statuses) == 0 {
		e.logMCPStatusSummary("codex_mcp_status_seed_skipped", runID, "config_seed", []mcpx.ServerRuntimeStatus{}, nil)
		return
	}
	if err := e.runtime.UpsertMCPStatuses(runID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
		e.logMCPStatusSummary("codex_mcp_status_seed_failed", runID, "config_seed", statuses, err)
		return
	}
	e.logMCPStatusSummary("codex_mcp_status_seeded", runID, "config_seed", statuses, nil)
}

func (e *CodexExecutor) scheduleMCPStatusCapture(session *codexSession, runID string, timeout time.Duration, waitGroup *sync.WaitGroup) {
	if e == nil || session == nil {
		return
	}
	if waitGroup != nil {
		waitGroup.Add(1)
	}
	go func() {
		if waitGroup != nil {
			defer waitGroup.Done()
		}
		e.captureMCPStatuses(session, runID, timeout)
	}()
}

func (e *CodexExecutor) captureMCPStatuses(session *codexSession, runID string, timeout time.Duration) {
	statusCtx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	statusPayload, err := session.sendRequest(statusCtx, "mcpServerStatus/list", map[string]any{})
	if err != nil {
		e.logMCPStatusSummary("codex_mcp_status_probe_failed", runID, "runtime_probe", []mcpx.ServerRuntimeStatus{}, err)
		return
	}
	statuses := buildCodexMCPStatuses(statusPayload, e.timeNow)
	if len(statuses) == 0 {
		e.logMCPStatusSummary("codex_mcp_status_probe_empty", runID, "runtime_probe", statuses, nil)
		return
	}
	if err := e.persistMCPStatuses(runID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
		e.logMCPStatusSummary("codex_mcp_status_probe_upsert_failed", runID, "runtime_probe", statuses, err)
		return
	}
	e.logMCPStatusSummary("codex_mcp_status_probe_applied", runID, "runtime_probe", statuses, nil)
}

func (e *CodexExecutor) persistMCPStatuses(runID string, statuses []mcpx.ServerRuntimeStatus) error {
	if e == nil || len(statuses) == 0 {
		return nil
	}
	if err := e.runtime.UpsertMCPStatuses(runID, statuses); err != nil && !errors.Is(err, ErrRunNotActive) {
		return err
	}
	run, err := e.runs.Load(runID)
	if err != nil {
		return err
	}
	if run.Status != agentruns.RunStatusCompleted && run.Status != agentruns.RunStatusFailed && run.Status != agentruns.RunStatusCancelled {
		return nil
	}
	encoded, err := encodeExternalMCPStatusSnapshot(statuses)
	if err != nil {
		return err
	}
	run.Outputs = ensureAnyMap(run.Outputs)
	run.Outputs[externalMCPStatusSnapshotKey] = encoded
	return e.runs.Save(run)
}

func (e *CodexExecutor) shouldRefreshMCPStatuses(runID string) bool {
	if e == nil {
		return false
	}
	statuses := e.runtime.MCPStatusesForRun(runID)
	if len(statuses) == 0 {
		return true
	}
	for _, status := range statuses {
		if status.State == mcpx.RuntimeStateUnknown {
			return true
		}
	}
	return false
}

func (e *CodexExecutor) logMCPStatusSummary(traceEvent string, runID string, source string, statuses []mcpx.ServerRuntimeStatus, err error) {
	if e == nil || e.logger == nil {
		return
	}
	attrs := []any{
		slog.String("trace_event", traceEvent),
		slog.String("run_id", strings.TrimSpace(runID)),
		slog.String("status_source", source),
		slog.Any("status_summary", summarizeMCPStatuses(statuses)),
	}
	if err != nil {
		attrs = append(attrs, slog.String("error", err.Error()))
	}
	e.logger.Debug("codex MCP status update", attrs...)
}
