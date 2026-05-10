package sshx

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

func buildRemoteShellCommand(shell string, innerCommand string) string {
	return shell + " -lc " + shellQuote(innerCommand)
}

func extractTokenFromBootstrapURL(bootstrapURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(bootstrapURL))
	if err != nil {
		return "", err
	}
	for _, candidate := range []string{parsed.Fragment, parsed.RawQuery} {
		if candidate == "" {
			continue
		}
		values, err := url.ParseQuery(candidate)
		if err != nil {
			continue
		}
		token := strings.TrimSpace(values.Get("token"))
		if token != "" {
			return token, nil
		}
	}
	return "", errors.New("Bootstrap URL missing token parameter.")
}

func newestRemoteSession(sessions []RemoteSessionSummary) RemoteSessionSummary {
	best := sessions[0]
	for _, session := range sessions[1:] {
		if session.StartedAt.After(best.StartedAt) {
			best = session
		}
	}
	return best
}

func selectConnectSession(sessions []RemoteSessionSummary, sessionID string, latest bool) (RemoteSessionSummary, bool, error) {
	if trimmed := NormalizeOptionalArgument(sessionID); trimmed != "" {
		for _, session := range sessions {
			if session.ID == trimmed {
				return session, true, nil
			}
		}
		return RemoteSessionSummary{}, false, &Error{
			Code:    "RemoteConnectSelection",
			Message: fmt.Sprintf("Session %s not found.", trimmed),
		}
	}
	if latest {
		if len(sessions) == 0 {
			return RemoteSessionSummary{}, false, nil
		}
		return newestRemoteSession(sessions), true, nil
	}
	switch len(sessions) {
	case 0:
		return RemoteSessionSummary{}, false, nil
	case 1:
		return sessions[0], true, nil
	default:
		return RemoteSessionSummary{}, false, &Error{
			Code:    "RemoteConnectSelection",
			Message: "Use --session or --latest for remote connect.",
		}
	}
}

func nonBlankLines(raw string) []string {
	lines := strings.Split(raw, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func firstNonBlank(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", `'"'"'`) + "'"
}

func needsShellWrapper(command string) bool {
	trimmed := strings.TrimSpace(command)
	if strings.HasPrefix(trimmed, "source ") || strings.HasPrefix(trimmed, ". ") {
		return true
	}
	return strings.Contains(command, "&&") ||
		strings.Contains(command, "||") ||
		strings.Contains(command, ";") ||
		strings.Contains(command, "|")
}

func errorCode(err error) string {
	var typed *Error
	if errors.As(err, &typed) {
		return typed.Code
	}
	return ""
}

func testStubForwardDisabled() bool {
	raw := strings.TrimSpace(os.Getenv("SETTA_SSH_STUB_DISABLE_FORWARD"))
	return !strings.EqualFold(raw, "") &&
		!strings.EqualFold(raw, "0") &&
		!strings.EqualFold(raw, "false")
}

func serviceRuntimePath(runtimeRoot string, parts ...string) string {
	segments := append([]string{runtimeRoot}, parts...)
	return filepath.Join(segments...)
}
