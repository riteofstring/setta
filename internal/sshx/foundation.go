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

	"setta/internal/hostnames"
)

const JSONPayloadPrefix = "__SETTA_JSON_B64__"

const (
	remoteConnectInfoErrorCode = "RemoteConnectInfo"
	remoteSessionListErrorCode = "RemoteSessionList"
	tildeUserAllowedRunes      = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.-"
)

var remoteSessionRequiredKeys = []string{
	"id",
	"workspacePath",
	"workspacePathCanonical",
	"host",
	"port",
	"pid",
	"startedAt",
	"serverMode",
}

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
	for index := 0; index < len(sshArgs); index++ {
		if isControlSocketFlag(sshArgs[index]) {
			return true
		}
		option, consumedNext := sshOptionValue(sshArgs, index)
		if option == "" {
			continue
		}
		if consumedNext {
			index++
		}
		if isControlSocketOption(option) {
			return true
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
	sessionList, err := parseRemoteSessionEntries(payload)
	if err != nil {
		return nil, err
	}
	sessions := make([]RemoteSessionSummary, 0, len(sessionList))
	for _, rawSession := range sessionList {
		sessionPayload, ok := rawSession.(map[string]any)
		if !ok {
			continue
		}
		session, err := parseRemoteSessionSummary(sessionPayload)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}
	return sessions, nil
}

func ParseRemoteConnectInfo(payload map[string]any, requestedLauncherOrigin string) (RemoteConnectInfo, error) {
	info := RemoteConnectInfo{}

	bootstrapURLFragment, err := requireRemoteConnectInfoString(
		payload,
		"bootstrapUrlFragment",
		"Remote connect info did not include a bootstrapUrlFragment.",
	)
	if err != nil {
		return RemoteConnectInfo{}, err
	}
	info.BootstrapURLFragment = bootstrapURLFragment

	if info.SettaFilesLocation, err = parseResolvedSettaFilesLocation(payload); err != nil {
		return RemoteConnectInfo{}, err
	}
	if err := populateOptionalConnectInfoFields(&info, payload); err != nil {
		return RemoteConnectInfo{}, err
	}
	if err := validateRequestedLauncherOrigin(info, requestedLauncherOrigin); err != nil {
		return RemoteConnectInfo{}, err
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
	return hostnames.FormatHostForURL(host)
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
			Code:    remoteConnectInfoErrorCode,
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
	suffix, ok := strings.CutPrefix(value, "~")
	return ok && strings.IndexFunc(suffix, isInvalidTildeUserRune) == -1
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

func isControlSocketFlag(arg string) bool {
	return arg == "-M" || arg == "-S" || (strings.HasPrefix(arg, "-S") && len(arg) > 2)
}

func sshOptionValue(sshArgs []string, index int) (string, bool) {
	lowerArg := strings.ToLower(sshArgs[index])
	switch {
	case lowerArg == "-o" && index+1 < len(sshArgs):
		return strings.ToLower(sshArgs[index+1]), true
	case strings.HasPrefix(lowerArg, "-o"):
		return strings.TrimPrefix(lowerArg, "-o"), false
	default:
		return "", false
	}
}

func isControlSocketOption(option string) bool {
	key, _, ok := strings.Cut(option, "=")
	if !ok {
		return false
	}
	switch key {
	case "controlmaster", "controlpath", "controlpersist":
		return true
	default:
		return false
	}
}

func parseRemoteSessionEntries(payload map[string]any) ([]any, error) {
	rawSessions, ok := payload["sessions"]
	if !ok {
		return []any{}, nil
	}
	sessionList, ok := rawSessions.([]any)
	if !ok {
		return nil, &Error{
			Code:    remoteSessionListErrorCode,
			Message: "Remote sessions payload is invalid.",
		}
	}
	return sessionList, nil
}

func parseRemoteSessionSummary(sessionPayload map[string]any) (RemoteSessionSummary, error) {
	if missing := missingPayloadKeys(sessionPayload, remoteSessionRequiredKeys); len(missing) > 0 {
		return RemoteSessionSummary{}, &Error{
			Code:    remoteSessionListErrorCode,
			Message: fmt.Sprintf("Remote sessions payload missing required key(s): %s.", strings.Join(missing, ", ")),
		}
	}

	sessionID, err := requireRemoteSessionString(sessionPayload, "id")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	workspacePath, err := requireRemoteSessionString(sessionPayload, "workspacePath")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	workspacePathCanonical, err := requireRemoteSessionString(sessionPayload, "workspacePathCanonical")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	host, err := requireRemoteSessionString(sessionPayload, "host")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	port, err := requireRemoteSessionInteger(sessionPayload, "port")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	pid, err := requireRemoteSessionInteger(sessionPayload, "pid")
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	startedAt, err := requireRemoteSessionStartedAt(sessionPayload)
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	serverMode, err := requireRemoteSessionServerMode(sessionPayload)
	if err != nil {
		return RemoteSessionSummary{}, err
	}
	return RemoteSessionSummary{
		ID:                     sessionID,
		WorkspacePath:          workspacePath,
		WorkspacePathCanonical: workspacePathCanonical,
		Host:                   host,
		Port:                   port,
		PID:                    pid,
		StartedAt:              startedAt,
		ServerMode:             serverMode,
	}, nil
}

func missingPayloadKeys(payload map[string]any, requiredKeys []string) []string {
	missing := make([]string, 0, len(requiredKeys))
	for _, key := range requiredKeys {
		if _, ok := payload[key]; !ok {
			missing = append(missing, key)
		}
	}
	return missing
}

func requireRemoteSessionString(payload map[string]any, key string) (string, error) {
	value, ok := payload[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", invalidRemoteSessionFieldError(key)
	}
	return value, nil
}

func requireRemoteSessionInteger(payload map[string]any, key string) (int, error) {
	value, err := parseInteger(payload[key])
	if err != nil {
		return 0, invalidRemoteSessionFieldError(key)
	}
	return value, nil
}

func requireRemoteSessionStartedAt(payload map[string]any) (time.Time, error) {
	value, err := requireRemoteSessionString(payload, "startedAt")
	if err != nil {
		return time.Time{}, err
	}
	startedAt, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return time.Time{}, invalidRemoteSessionFieldError("startedAt")
	}
	return startedAt, nil
}

func requireRemoteSessionServerMode(payload map[string]any) (RemoteServerMode, error) {
	value, err := requireRemoteSessionString(payload, "serverMode")
	if err != nil {
		return "", err
	}
	serverMode := RemoteServerMode(value)
	switch serverMode {
	case RemoteServerModeIDE, RemoteServerModeLauncher:
		return serverMode, nil
	default:
		return "", invalidRemoteSessionFieldError("serverMode")
	}
}

func invalidRemoteSessionFieldError(key string) error {
	return &Error{
		Code:    remoteSessionListErrorCode,
		Message: fmt.Sprintf("Remote sessions payload has invalid %s values.", key),
	}
}

func requireRemoteConnectInfoString(payload map[string]any, key string, message string) (string, error) {
	value, ok := payload[key].(string)
	if !ok || strings.TrimSpace(value) == "" {
		return "", &Error{Code: remoteConnectInfoErrorCode, Message: message}
	}
	return value, nil
}

func parseResolvedSettaFilesLocation(payload map[string]any) (string, error) {
	rawLocation, ok := payload["settaFilesLocation"]
	if !ok || rawLocation == nil {
		return "", nil
	}
	location, ok := rawLocation.(string)
	if !ok {
		return "", &Error{
			Code:    remoteConnectInfoErrorCode,
			Message: "Remote connect info did not include a valid settaFilesLocation.",
		}
	}
	normalizedLocation, err := NormalizeSettaFilesLocation(location)
	if err != nil {
		return "", &Error{
			Code:    remoteConnectInfoErrorCode,
			Message: "Remote connect info did not include a resolved settaFilesLocation.",
		}
	}
	switch normalizedLocation {
	case "", "local", "global":
		return normalizedLocation, nil
	default:
		return "", &Error{
			Code:    remoteConnectInfoErrorCode,
			Message: "Remote connect info did not include a resolved settaFilesLocation.",
		}
	}
}

func populateOptionalConnectInfoFields(info *RemoteConnectInfo, payload map[string]any) error {
	fields := []struct {
		key         string
		destination *string
	}{
		{key: "settaFilesRoot", destination: &info.SettaFilesRoot},
		{key: "runtimeRoot", destination: &info.RuntimeRoot},
		{key: "settaHome", destination: &info.SettaHome},
		{key: "profile", destination: &info.Profile},
		{key: "launcherOrigin", destination: &info.LauncherOrigin},
		{key: "launcherOriginProof", destination: &info.LauncherOriginProof},
	}
	for _, field := range fields {
		value, err := parseOptionalConnectInfoField(payload, field.key)
		if err != nil {
			return err
		}
		*field.destination = value
	}
	return nil
}

func validateRequestedLauncherOrigin(info RemoteConnectInfo, requestedLauncherOrigin string) error {
	trimmedRequestedOrigin := NormalizeOptionalArgument(requestedLauncherOrigin)
	if trimmedRequestedOrigin == "" {
		return nil
	}
	if info.LauncherOrigin != trimmedRequestedOrigin {
		return &Error{
			Code: remoteConnectInfoErrorCode,
			Message: fmt.Sprintf(
				"Remote connect info launcherOrigin did not match requested launcher origin. requested=%q, remote=%q",
				trimmedRequestedOrigin,
				info.LauncherOrigin,
			),
		}
	}
	if info.LauncherOriginProof == "" {
		return &Error{
			Code:    remoteConnectInfoErrorCode,
			Message: "Remote connect info did not include launcherOriginProof.",
		}
	}
	return nil
}

func isInvalidTildeUserRune(r rune) bool {
	return !strings.ContainsRune(tildeUserAllowedRunes, r)
}
