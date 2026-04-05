package externalagents

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/backendlogs"
)

var ErrExternalAgentRunStoreRequired = errors.New("external agent run store is required")

func persistExternalAgentRunFailure(
	runs *agentruns.RunStore,
	runtime *Runtime,
	timeNow func() time.Time,
	runID string,
	runErr error,
	stderrLines []string,
) (agentruns.Run, error) {
	if runs == nil {
		return agentruns.Run{}, ErrExternalAgentRunStoreRequired
	}
	run, err := runs.Load(runID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if run.Status == agentruns.RunStatusCancelled ||
		run.Status == agentruns.RunStatusCompleted ||
		run.Status == agentruns.RunStatusFailed {
		return run, nil
	}
	now := time.Now().UTC()
	if timeNow != nil {
		now = timeNow().UTC()
	}
	run.Status = agentruns.RunStatusFailed
	run.FinishedAt = &now
	payload := map[string]any{}
	if runErr != nil && strings.TrimSpace(runErr.Error()) != "" {
		payload["error"] = strings.TrimSpace(runErr.Error())
	} else {
		payload["error"] = "external agent run failed"
	}
	if len(stderrLines) > 0 {
		payload["cliStderr"] = append([]string(nil), stderrLines...)
	}
	if runtime != nil {
		runtime.attachMCPStatusSnapshot(&run)
	}
	appendRunEvent(&run, "run_failed", payload, now)
	if err := runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	if runtime != nil {
		runtime.reportRunFailure(run, runErr, stderrLines)
	}
	return run, nil
}

func (r *Runtime) reportRunFailure(run agentruns.Run, runErr error, stderrLines []string) {
	if r == nil || r.backendLogs == nil {
		return
	}
	message := buildExternalAgentRunFailureLogMessage(run, runErr, stderrLines)
	if strings.TrimSpace(message) == "" {
		return
	}
	if err := r.backendLogs.LogAndBroadcast(context.Background(), backendlogs.LogRequest{
		Message:   message,
		Severity:  backendlogs.SeverityError,
		ProjectID: resolveRunInputString(run, "projectConfigId"),
	}); err != nil && r.logger != nil {
		r.logger.Warn(
			"failed to broadcast external agent backend log",
			"run_id",
			run.ID,
			"error",
			err.Error(),
		)
	}
}

func buildExternalAgentRunFailureLogMessage(run agentruns.Run, runErr error, stderrLines []string) string {
	message := "External agent run failed"
	if engineConfigID := strings.TrimSpace(resolveRunInputString(run, "engineConfigId")); engineConfigID != "" {
		message = fmt.Sprintf("%s (%s)", message, engineConfigID)
	}
	if runErr != nil && strings.TrimSpace(runErr.Error()) != "" {
		message = fmt.Sprintf("%s: %s", message, strings.TrimSpace(runErr.Error()))
	}
	normalizedStderr := normalizeExternalAgentFailureStderrLines(stderrLines)
	if len(normalizedStderr) == 0 {
		return message
	}
	stderrBlock := strings.Join(normalizedStderr, "\n")
	if runErr != nil && strings.TrimSpace(runErr.Error()) != "" && strings.Contains(stderrBlock, strings.TrimSpace(runErr.Error())) {
		return message
	}
	return fmt.Sprintf("%s\n%s", message, stderrBlock)
}

func normalizeExternalAgentFailureStderrLines(stderrLines []string) []string {
	if len(stderrLines) == 0 {
		return nil
	}
	normalized := make([]string, 0, len(stderrLines))
	for _, line := range stderrLines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}
