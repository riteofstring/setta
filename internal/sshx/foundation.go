package sshx

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"path"
	"runtime"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const JSONPayloadPrefix = "__SETTA_JSON_B64__"

type Error struct {
	Code    string
	Message string
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type RemoteServerMode string

const (
	RemoteServerModeIDE      RemoteServerMode = "ide"
	RemoteServerModeLauncher RemoteServerMode = "launcher"
)

type RemoteSessionSummary struct {
	ID                     string
	WorkspacePath          string
	WorkspacePathCanonical string
	Host                   string
	Port                   int
	PID                    int
	StartedAt              time.Time
	ServerMode             RemoteServerMode
}

type RemoteConnectInfo struct {
	BootstrapURLFragment string
	SettaFilesLocation   string
	SettaFilesRoot       string
	RuntimeRoot          string
	SettaHome            string
	Profile              string
	LauncherOrigin       string
	LauncherOriginProof  string
}

func ParseSSHArgs(raw string) ([]string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	args, err := splitShellArgs(trimmed)
	if err != nil {
		return nil, &Error{
			Code:    "InvalidSshArgs",
			Message: fmt.Sprintf("Failed to parse ssh arguments: %v", err),
		}
	}
	return args, nil
}

func SSHCommandPrefix(batchMode bool, sshBin string) []string {
	trimmedSSHBIN := strings.TrimSpace(sshBin)
	if trimmedSSHBIN == "" {
		trimmedSSHBIN = "ssh"
	}
	prefix := []string{trimmedSSHBIN}
	if batchMode {
		prefix = append(prefix, "-o", "BatchMode=yes")
	}
	return prefix
}

func HasControlSocketOption(sshArgs []string) bool {
	controlKeys := []string{"controlmaster", "controlpath", "controlpersist"}
	for index, arg := range sshArgs {
		switch {
		case arg == "-M" || arg == "-S":
			return true
		case strings.HasPrefix(arg, "-S") && len(arg) > 2:
			return true
		}

		lowerArg := strings.ToLower(arg)
		if lowerArg == "-o" {
			if index+1 >= len(sshArgs) {
				continue
			}
			option := strings.ToLower(sshArgs[index+1])
			for _, key := range controlKeys {
				if strings.HasPrefix(option, key+"=") {
					return true
				}
			}
			continue
		}
		if strings.HasPrefix(lowerArg, "-o") {
			option := strings.TrimPrefix(lowerArg, "-o")
			for _, key := range controlKeys {
				if strings.HasPrefix(option, key+"=") {
					return true
				}
			}
		}
	}
	return false
}

func ApplyControlSocketArgs(sshArgs []string) []string {
	cloned := append([]string(nil), sshArgs...)
	if runtime.GOOS == "windows" {
		return cloned
	}
	if HasControlSocketOption(cloned) {
		return cloned
	}
	controlArgs := []string{
		"-o", "ControlMaster=auto",
		"-o", "ControlPersist=5m",
		"-o", "ControlPath=/tmp/setta-ctl-%C",
	}
	return append(controlArgs, cloned...)
}

func NormalizeOptionalArgument(value string) string {
	return strings.TrimSpace(value)
}

func NormalizeSettaFilesLocation(value string) (string, error) {
	trimmed := strings.ToLower(NormalizeOptionalArgument(value))
	if trimmed == "" {
		return "", nil
	}
	switch trimmed {
	case "auto", "local", "global":
		return trimmed, nil
	default:
		return "", &Error{
			Code:    "InvalidSettaFilesLocation",
			Message: "settaFilesLocation must be one of: auto, local, global.",
		}
	}
}

func ParseJSONPayload(output string) (map[string]any, error) {
	for _, line := range strings.Split(output, "\n") {
		if !strings.HasPrefix(line, JSONPayloadPrefix) {
			continue
		}
		encoded := strings.TrimSpace(strings.TrimPrefix(line, JSONPayloadPrefix))
		decodedBytes, err := base64.StdEncoding.Strict().DecodeString(encoded)
		if err != nil {
			return nil, &Error{
				Code:    "RemoteJsonPayload",
				Message: "Failed to decode remote Setta JSON payload (base64).",
			}
		}
		if !utf8.Valid(decodedBytes) {
			return nil, &Error{
				Code:    "RemoteJsonPayload",
				Message: "Failed to decode remote Setta JSON payload (utf-8).",
			}
		}

		var payload any
		if err := json.Unmarshal(decodedBytes, &payload); err != nil {
			return nil, &Error{
				Code:    "RemoteJsonPayload",
				Message: "Failed to decode remote Setta JSON payload (json).",
			}
		}
		objectPayload, ok := payload.(map[string]any)
		if !ok {
			return nil, &Error{
				Code:    "RemoteJsonPayload",
				Message: "Remote Setta JSON payload is not an object.",
			}
		}
		return objectPayload, nil
	}
	return nil, &Error{
		Code:    "RemoteJsonPayload",
		Message: "Missing JSON payload from remote output.",
	}
}

func ParseRemoteSessionList(payload map[string]any) ([]RemoteSessionSummary, error) {
	rawSessions, ok := payload["sessions"]
	if !ok {
		rawSessions = []any{}
	}
	sessionList, ok := rawSessions.([]any)
	if !ok {
		return nil, &Error{
			Code:    "RemoteSessionList",
			Message: "Remote sessions payload is invalid.",
		}
	}

	sessions := make([]RemoteSessionSummary, 0, len(sessionList))
	for _, rawSession := range sessionList {
		sessionPayload, ok := rawSession.(map[string]any)
		if !ok {
			continue
		}
		requiredKeys := []string{
			"id",
			"workspacePath",
			"workspacePathCanonical",
			"host",
			"port",
			"pid",
			"startedAt",
			"serverMode",
		}
		missing := make([]string, 0, len(requiredKeys))
		for _, key := range requiredKeys {
			if _, ok := sessionPayload[key]; !ok {
				missing = append(missing, key)
			}
		}
		if len(missing) > 0 {
			return nil, &Error{
				Code:    "RemoteSessionList",
				Message: fmt.Sprintf("Remote sessions payload missing required key(s): %s.", strings.Join(missing, ", ")),
			}
		}

		sessionID, ok := sessionPayload["id"].(string)
		if !ok || strings.TrimSpace(sessionID) == "" {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid id values."}
		}
		workspacePath, ok := sessionPayload["workspacePath"].(string)
		if !ok || strings.TrimSpace(workspacePath) == "" {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid workspacePath values."}
		}
		workspacePathCanonical, ok := sessionPayload["workspacePathCanonical"].(string)
		if !ok || strings.TrimSpace(workspacePathCanonical) == "" {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid workspacePathCanonical values."}
		}
		host, ok := sessionPayload["host"].(string)
		if !ok || strings.TrimSpace(host) == "" {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid host values."}
		}

		port, err := parseInteger(sessionPayload["port"])
		if err != nil {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid port values."}
		}
		pid, err := parseInteger(sessionPayload["pid"])
		if err != nil {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid pid values."}
		}
		startedAtRaw, ok := sessionPayload["startedAt"].(string)
		if !ok || strings.TrimSpace(startedAtRaw) == "" {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid startedAt values."}
		}
		startedAt, err := time.Parse(time.RFC3339Nano, startedAtRaw)
		if err != nil {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid startedAt values."}
		}
		serverModeRaw, ok := sessionPayload["serverMode"].(string)
		if !ok {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid serverMode values."}
		}
		serverMode := RemoteServerMode(serverModeRaw)
		if serverMode != RemoteServerModeIDE && serverMode != RemoteServerModeLauncher {
			return nil, &Error{Code: "RemoteSessionList", Message: "Remote sessions payload has invalid serverMode values."}
		}

		sessions = append(sessions, RemoteSessionSummary{
			ID:                     sessionID,
			WorkspacePath:          workspacePath,
			WorkspacePathCanonical: workspacePathCanonical,
			Host:                   host,
			Port:                   port,
			PID:                    pid,
			StartedAt:              startedAt,
			ServerMode:             serverMode,
		})
	}
	return sessions, nil
}

func ParseRemoteConnectInfo(payload map[string]any, requestedLauncherOrigin string) (RemoteConnectInfo, error) {
	bootstrapURLFragment, ok := payload["bootstrapUrlFragment"].(string)
	if !ok || strings.TrimSpace(bootstrapURLFragment) == "" {
		return RemoteConnectInfo{}, &Error{
			Code:    "RemoteConnectInfo",
			Message: "Remote connect info did not include a bootstrapUrlFragment.",
		}
	}

	var info RemoteConnectInfo
	info.BootstrapURLFragment = bootstrapURLFragment

	if rawLocation, ok := payload["settaFilesLocation"]; ok && rawLocation != nil {
		location, ok := rawLocation.(string)
		if !ok {
			return RemoteConnectInfo{}, &Error{
				Code:    "RemoteConnectInfo",
				Message: "Remote connect info did not include a valid settaFilesLocation.",
			}
		}
		normalizedLocation, err := NormalizeSettaFilesLocation(location)
		if err != nil || (normalizedLocation != "" && normalizedLocation != "local" && normalizedLocation != "global") {
			return RemoteConnectInfo{}, &Error{
				Code:    "RemoteConnectInfo",
				Message: "Remote connect info did not include a resolved settaFilesLocation.",
			}
		}
		info.SettaFilesLocation = normalizedLocation
	}

	var err error
	if info.SettaFilesRoot, err = parseOptionalConnectInfoField(payload, "settaFilesRoot"); err != nil {
		return RemoteConnectInfo{}, err
	}
	if info.RuntimeRoot, err = parseOptionalConnectInfoField(payload, "runtimeRoot"); err != nil {
		return RemoteConnectInfo{}, err
	}
	if info.SettaHome, err = parseOptionalConnectInfoField(payload, "settaHome"); err != nil {
		return RemoteConnectInfo{}, err
	}
	if info.Profile, err = parseOptionalConnectInfoField(payload, "profile"); err != nil {
		return RemoteConnectInfo{}, err
	}
	if info.LauncherOrigin, err = parseOptionalConnectInfoField(payload, "launcherOrigin"); err != nil {
		return RemoteConnectInfo{}, err
	}
	if info.LauncherOriginProof, err = parseOptionalConnectInfoField(payload, "launcherOriginProof"); err != nil {
		return RemoteConnectInfo{}, err
	}

	trimmedRequestedOrigin := NormalizeOptionalArgument(requestedLauncherOrigin)
	if trimmedRequestedOrigin != "" {
		if info.LauncherOrigin != trimmedRequestedOrigin {
			return RemoteConnectInfo{}, &Error{
				Code: "RemoteConnectInfo",
				Message: fmt.Sprintf(
					"Remote connect info launcherOrigin did not match requested launcher origin. requested=%q, remote=%q",
					trimmedRequestedOrigin,
					info.LauncherOrigin,
				),
			}
		}
		if info.LauncherOriginProof == "" {
			return RemoteConnectInfo{}, &Error{
				Code:    "RemoteConnectInfo",
				Message: "Remote connect info did not include launcherOriginProof.",
			}
		}
	}

	return info, nil
}

func ResolveRemoteLogsDir(workspace string, settaFilesLocation string, settaFilesRoot string, runtimeRoot string) (string, error) {
	if hasTildePrefix(runtimeRoot) {
		return "/tmp", nil
	}
	if resolvedRuntimeRoot := resolveRemoteRootForLogs(runtimeRoot, workspace); resolvedRuntimeRoot != "" {
		return resolvedRuntimeRoot + "/logs", nil
	}

	if hasTildePrefix(settaFilesRoot) {
		return "/tmp", nil
	}
	if resolvedSettaFilesRoot := resolveRemoteRootForLogs(settaFilesRoot, workspace); resolvedSettaFilesRoot != "" {
		return resolvedSettaFilesRoot + "/runtime/logs", nil
	}

	normalizedLocation, err := NormalizeSettaFilesLocation(settaFilesLocation)
	if err != nil {
		return "", err
	}
	if normalizedLocation == "" {
		normalizedLocation = "auto"
	}
	if normalizedLocation != "local" {
		return "/tmp", nil
	}
	if !isSafeRemotePath(workspace) {
		return "/tmp", nil
	}
	return strings.TrimRight(strings.TrimSpace(workspace), "/") + "/setta_files/runtime/logs", nil
}

func ComputeTunnelKeyHash(sshTarget string, sshArgs []string, remoteHost string, remotePort int) string {
	payload := struct {
		RemoteHost string   `json:"remoteHost"`
		RemotePort int      `json:"remotePort"`
		SSHArgs    []string `json:"sshArgs"`
		SSHTarget  string   `json:"sshTarget"`
	}{
		RemoteHost: remoteHost,
		RemotePort: remotePort,
		SSHArgs:    append([]string(nil), sshArgs...),
		SSHTarget:  sshTarget,
	}
	rawPayload, _ := json.Marshal(payload)
	digest := sha256.Sum256(rawPayload)
	return hex.EncodeToString(digest[:])
}

func TunnelIDForKeyHash(keyHash string) string {
	trimmed := strings.TrimSpace(keyHash)
	if len(trimmed) <= 20 {
		return trimmed
	}
	return trimmed[:20]
}

func FormatHostForSSHTunnel(host string) string {
	trimmedHost := strings.TrimSpace(host)
	switch trimmedHost {
	case "0.0.0.0":
		trimmedHost = "127.0.0.1"
	case "::":
		trimmedHost = "::1"
	}
	if strings.Contains(trimmedHost, ":") && !strings.HasPrefix(trimmedHost, "[") {
		return "[" + trimmedHost + "]"
	}
	return trimmedHost
}

func BuildSSHTunnelArgs(sshTarget string, sshArgs []string, host string, localPort int, remotePort int, sshPrefix []string) []string {
	return append(append(append([]string(nil), sshPrefix...), sshArgs...),
		"-N",
		"-L",
		fmt.Sprintf("%d:%s:%d", localPort, FormatHostForSSHTunnel(host), remotePort),
		"-o",
		"ExitOnForwardFailure=yes",
		sshTarget,
	)
}

func parseOptionalConnectInfoField(payload map[string]any, key string) (string, error) {
	rawValue, ok := payload[key]
	if !ok || rawValue == nil {
		return "", nil
	}
	value, ok := rawValue.(string)
	if !ok {
		return "", &Error{
			Code:    "RemoteConnectInfo",
			Message: fmt.Sprintf("Remote connect info did not include a valid %s.", key),
		}
	}
	return NormalizeOptionalArgument(value), nil
}

func parseInteger(value any) (int, error) {
	switch typed := value.(type) {
	case int:
		return typed, nil
	case int32:
		return int(typed), nil
	case int64:
		return int(typed), nil
	case float64:
		if typed != float64(int(typed)) {
			return 0, fmt.Errorf("not an integer")
		}
		return int(typed), nil
	case json.Number:
		parsed, err := typed.Int64()
		return int(parsed), err
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		return parsed, err
	default:
		return 0, fmt.Errorf("unsupported integer type %T", value)
	}
}

func hasTildePrefix(value string) bool {
	trimmed := NormalizeOptionalArgument(value)
	if trimmed == "" || !strings.HasPrefix(trimmed, "~") {
		return false
	}
	_, _, ok := splitTildePath(trimmed)
	return ok
}

func splitTildePath(value string) (string, string, bool) {
	if !strings.HasPrefix(value, "~") {
		return "", "", false
	}
	tildePrefix := value
	remainder := ""
	if index := strings.IndexRune(value, '/'); index >= 0 {
		tildePrefix = value[:index]
		remainder = strings.TrimLeft(value[index+1:], "/")
	}
	if tildePrefix == "" {
		return "", "", false
	}
	if !isValidTildePrefix(tildePrefix) {
		return "", "", false
	}
	return tildePrefix, remainder, true
}

func isValidTildePrefix(value string) bool {
	if value == "~" {
		return true
	}
	if !strings.HasPrefix(value, "~") {
		return false
	}
	for _, r := range value[1:] {
		switch {
		case r >= 'a' && r <= 'z':
		case r >= 'A' && r <= 'Z':
		case r >= '0' && r <= '9':
		case r == '_' || r == '.' || r == '-':
		default:
			return false
		}
	}
	return true
}

func resolveRemoteRootForLogs(rawRoot string, workspace string) string {
	trimmedRoot := NormalizeOptionalArgument(rawRoot)
	if trimmedRoot == "" {
		return ""
	}
	if hasTildePrefix(trimmedRoot) {
		return ""
	}
	if isSafeRemotePath(trimmedRoot) {
		return strings.TrimRight(trimmedRoot, "/")
	}
	if !isSafeRelativeRemotePath(trimmedRoot) {
		return ""
	}
	if !isSafeRemotePath(workspace) {
		return ""
	}
	normalizedWorkspace := strings.TrimRight(strings.TrimSpace(workspace), "/")
	if normalizedWorkspace == "" {
		return ""
	}
	combined := path.Clean(normalizedWorkspace + "/" + trimmedRoot)
	if !isSafeRemotePath(combined) {
		return ""
	}
	return strings.TrimRight(combined, "/")
}

func isSafeRemotePath(value string) bool {
	raw := strings.TrimSpace(value)
	return strings.HasPrefix(raw, "/") && !strings.Contains(raw, "\x00") && !strings.Contains(raw, "\n") && !strings.Contains(raw, "\r")
}

func isSafeRelativeRemotePath(value string) bool {
	raw := strings.TrimSpace(value)
	return raw != "" && !strings.HasPrefix(raw, "/") && !strings.Contains(raw, "\x00") && !strings.Contains(raw, "\n") && !strings.Contains(raw, "\r")
}
