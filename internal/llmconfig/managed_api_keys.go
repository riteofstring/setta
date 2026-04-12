package llmconfig

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/gofrs/flock"
	"setta/internal/statefs"
)

const (
	ManagedAPIKeysCorruptErrorCode          = "managed_api_keys_store_corrupt"
	ManagedAPIKeysUnavailableErrorCode      = "managed_api_keys_store_unavailable"
	ManagedAPIKeysRevisionConflictErrorCode = "managed_api_keys_revision_conflict"
	managedAPIKeyNamesEnvVar                = "SETTA_MANAGED_LLM_API_KEY_NAMES"
	managedAPIKeysFileMode                  = 0o600
	managedAPIKeysLocksDirName              = "file_locks"
)

type ManagedAPIKeysWriteStatus string

const (
	ManagedAPIKeysWriteStatusSuccess          ManagedAPIKeysWriteStatus = "success"
	ManagedAPIKeysWriteStatusRevisionConflict ManagedAPIKeysWriteStatus = "revision_conflict"
	ManagedAPIKeysWriteStatusCorruptStore     ManagedAPIKeysWriteStatus = "corrupt_store"
	ManagedAPIKeysWriteStatusStoreUnavailable ManagedAPIKeysWriteStatus = "store_unavailable"
)

type ManagedAPIKeysReadResult struct {
	APIKeys   map[string]string
	Revision  int
	Corrupt   bool
	ErrorCode string
	Error     string
}

type ManagedAPIKeysWriteAttempt struct {
	Status    ManagedAPIKeysWriteStatus
	APIKeys   map[string]string
	Revision  int
	ErrorCode string
	Error     string
}

type ManagedAPIKeysSnapshot struct {
	APIKeys   map[string]string `json:"apiKeys"`
	Revision  int               `json:"revision"`
	Corrupt   bool              `json:"corrupt"`
	ErrorCode *string           `json:"errorCode"`
	Message   *string           `json:"message"`
}

type managedAPIKeysStoreUnavailableError struct {
	message string
}

func (e *managedAPIKeysStoreUnavailableError) Error() string {
	return e.message
}

type managedAPIKeysStoreCorruptError struct {
	message string
}

func (e *managedAPIKeysStoreCorruptError) Error() string {
	return e.message
}

type managedAPIKeysResolvedPaths struct {
	envPath  string
	lockRoot string
}

type managedAPIKeysWriteStoreState struct {
	rawDotEnvPayload       *string
	currentManagedKeyNames map[string]struct{}
	managedKeyNamesToPurge map[string]struct{}
	currentAPIKeys         map[string]string
}

var (
	dotEnvAssignmentPattern              = regexp.MustCompile(`^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=`)
	safeUnquotedManagedAPIKeyValueRegexp = regexp.MustCompile(`^[A-Za-z0-9_./:@%+\-=]+$`)
)

func ManagedAPIKeysPath(workspaceRoot string) string {
	return filepath.Join(workspaceRoot, ".env")
}

func ReadManagedAPIKeysWithStatusInLockRoot(path string, lockRoot string) ManagedAPIKeysReadResult {
	paths, err := resolveManagedAPIKeysPaths(path, lockRoot)
	if err != nil {
		return managedAPIKeysUnavailableResult(err)
	}
	result, err := withManagedAPIKeysLock(paths.envPath, paths.lockRoot, func() (ManagedAPIKeysReadResult, error) {
		envVars, err := readDotEnvPayloadFromDisk(paths.envPath)
		if err != nil {
			return ManagedAPIKeysReadResult{}, err
		}
		_, apiKeys, err := readManagedAPIKeysFromDotEnvPayload(envVars)
		if err != nil {
			return ManagedAPIKeysReadResult{}, err
		}
		return ManagedAPIKeysReadResult{
			APIKeys:  apiKeys,
			Revision: computeManagedAPIKeysRevision(apiKeys),
		}, nil
	})
	if err == nil {
		return result
	}
	var corruptErr *managedAPIKeysStoreCorruptError
	if errorAs(err, &corruptErr) {
		return managedAPIKeysCorruptResult(err)
	}
	return managedAPIKeysUnavailableResult(err)
}

func BuildManagedAPIKeysSnapshot(result ManagedAPIKeysReadResult, apiKeys map[string]string) ManagedAPIKeysSnapshot {
	resolvedAPIKeys := cloneStringMap(apiKeys)
	if resolvedAPIKeys == nil {
		resolvedAPIKeys = cloneStringMap(result.APIKeys)
	}
	if resolvedAPIKeys == nil {
		resolvedAPIKeys = map[string]string{}
	}
	return ManagedAPIKeysSnapshot{
		APIKeys:   resolvedAPIKeys,
		Revision:  result.Revision,
		Corrupt:   result.Corrupt,
		ErrorCode: optionalStringPointer(result.ErrorCode),
		Message:   optionalStringPointer(result.Error),
	}
}

func ReadManagedAPIKeysWithStatus(path string) ManagedAPIKeysReadResult {
	return ReadManagedAPIKeysWithStatusInLockRoot(path, "")
}

func WriteManagedAPIKeysWithExpectedRevisionInLockRoot(path string, payload map[string]string, expectedRevision int, configuredProviderKeyNames []string, lockRoot string) ManagedAPIKeysWriteAttempt {
	paths, err := resolveManagedAPIKeysPaths(path, lockRoot)
	if err != nil {
		return managedAPIKeysUnavailableWriteAttempt(err)
	}

	normalized := normalizeManagedAPIKeyWritePayload(payload)
	attempt, err := withManagedAPIKeysLock(paths.envPath, paths.lockRoot, func() (ManagedAPIKeysWriteAttempt, error) {
		state, err := loadManagedAPIKeysWriteStoreState(paths.envPath, expectedRevision, configuredProviderKeyNames)
		if err != nil {
			return ManagedAPIKeysWriteAttempt{}, err
		}
		currentRevision := computeManagedAPIKeysRevision(state.currentAPIKeys)
		if expectedRevision != currentRevision {
			return managedAPIKeysRevisionConflictWriteAttempt(state.currentAPIKeys, expectedRevision, currentRevision), nil
		}

		nextDotEnvPayload := buildNextDotEnvPayload(
			state.rawDotEnvPayload,
			state.currentManagedKeyNames,
			state.managedKeyNamesToPurge,
			normalized,
		)
		if err := writeDotEnvPayloadToDisk(paths.envPath, nextDotEnvPayload); err != nil {
			return ManagedAPIKeysWriteAttempt{}, err
		}
		return managedAPIKeysSuccessWriteAttempt(normalized), nil
	})
	if err == nil {
		return attempt
	}
	return managedAPIKeysWriteAttemptFromError(err)
}

func WriteManagedAPIKeysWithExpectedRevision(path string, payload map[string]string, expectedRevision int, configuredProviderKeyNames []string) ManagedAPIKeysWriteAttempt {
	return WriteManagedAPIKeysWithExpectedRevisionInLockRoot(path, payload, expectedRevision, configuredProviderKeyNames, "")
}

func ResolveEffectiveAPIKeys(configs AllConfigs, managedEnv map[string]string, processEnv map[string]string) map[string]string {
	merged := map[string]string{}
	for key, value := range FilterEnvVarsForConfig(processEnv, configs) {
		merged[key] = value
	}
	for key, value := range cloneStringMap(managedEnv) {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		merged[trimmedKey] = value
	}
	return merged
}

func withManagedAPIKeysLock[T any](path string, lockRoot string, fn func() (T, error)) (T, error) {
	var zero T
	lockPath, err := managedAPIKeysLockPath(path, lockRoot)
	if err != nil {
		return zero, &managedAPIKeysStoreUnavailableError{
			message: err.Error(),
		}
	}
	if err := os.MkdirAll(filepath.Dir(lockPath), 0o755); err != nil {
		return zero, &managedAPIKeysStoreUnavailableError{
			message: fmt.Sprintf("Failed creating .env API key store lock directory: %v", err),
		}
	}
	fileLock := flock.New(lockPath)
	if err := fileLock.Lock(); err != nil {
		return zero, &managedAPIKeysStoreUnavailableError{
			message: fmt.Sprintf("Failed acquiring .env API key store lock: %s", lockPath),
		}
	}
	defer fileLock.Close()
	return fn()
}

func resolveManagedAPIKeysPaths(path string, lockRoot string) (managedAPIKeysResolvedPaths, error) {
	resolvedPath, err := statefs.NormalizePath(path, "")
	if err != nil {
		return managedAPIKeysResolvedPaths{}, fmt.Errorf("env path: %w", err)
	}
	if strings.TrimSpace(lockRoot) == "" {
		return managedAPIKeysResolvedPaths{envPath: resolvedPath}, nil
	}
	resolvedLockRoot, err := statefs.NormalizePath(lockRoot, "")
	if err != nil {
		return managedAPIKeysResolvedPaths{}, fmt.Errorf("lock root: %w", err)
	}
	return managedAPIKeysResolvedPaths{
		envPath:  resolvedPath,
		lockRoot: resolvedLockRoot,
	}, nil
}

func managedAPIKeysLockPath(path string, lockRoot string) (string, error) {
	if strings.TrimSpace(lockRoot) == "" {
		return path + ".lock", nil
	}
	resolvedLockRoot, err := statefs.NormalizePath(lockRoot, "")
	if err != nil {
		return "", fmt.Errorf("resolve managed api keys lock root: %w", err)
	}
	digest := sha256.Sum256([]byte(path))
	lockFileName := fmt.Sprintf("%s_%x.lock", filepath.Base(path), digest[:4])
	return filepath.Join(resolvedLockRoot, managedAPIKeysLocksDirName, lockFileName), nil
}

func normalizeManagedAPIKeyWritePayload(payload map[string]string) map[string]string {
	normalized := map[string]string{}
	for rawKey, rawValue := range payload {
		key := strings.TrimSpace(rawKey)
		if key == "" {
			continue
		}
		value := strings.TrimSpace(rawValue)
		if value == "" {
			continue
		}
		normalized[key] = value
	}
	return normalized
}

func normalizeManagedAPIKeyNames(names []string) map[string]struct{} {
	normalized := map[string]struct{}{}
	for _, name := range names {
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			continue
		}
		normalized[trimmedName] = struct{}{}
	}
	return normalized
}

func computeManagedAPIKeysRevision(apiKeys map[string]string) int {
	if len(apiKeys) == 0 {
		return 0
	}
	content, err := json.Marshal(apiKeys)
	if err != nil {
		return 0
	}
	digest := sha256.Sum256(content)
	hexDigest := fmt.Sprintf("%x", digest[:])
	revision := 0
	for _, ch := range hexDigest[:13] {
		revision *= 16
		switch {
		case ch >= '0' && ch <= '9':
			revision += int(ch - '0')
		case ch >= 'a' && ch <= 'f':
			revision += int(ch-'a') + 10
		}
	}
	if revision == 0 {
		return 1
	}
	return revision
}

func readDotEnvRawPayloadFromDisk(path string) (*string, error) {
	content, err := os.ReadFile(path)
	switch {
	case os.IsNotExist(err):
		return nil, nil
	case err != nil:
		return nil, &managedAPIKeysStoreUnavailableError{
			message: fmt.Sprintf("Failed to read .env API key store: %v", err),
		}
	}
	if !utf8.Valid(content) {
		return nil, &managedAPIKeysStoreCorruptError{
			message: ".env API key store is not valid UTF-8.",
		}
	}
	value := string(content)
	return &value, nil
}

func parseDotEnvPayload(rawPayload *string) (map[string]string, error) {
	if rawPayload == nil {
		return map[string]string{}, nil
	}
	parsed, err := parseEnvContent(*rawPayload)
	if err != nil {
		return nil, &managedAPIKeysStoreCorruptError{
			message: fmt.Sprintf("Failed to parse .env API key store: %v", err),
		}
	}
	return parsed, nil
}

func readDotEnvPayloadFromDisk(path string) (map[string]string, error) {
	rawPayload, err := readDotEnvRawPayloadFromDisk(path)
	if err != nil {
		return nil, err
	}
	return parseDotEnvPayload(rawPayload)
}

func loadManagedAPIKeysWriteStoreState(path string, expectedRevision int, configuredProviderKeyNames []string) (managedAPIKeysWriteStoreState, error) {
	rawDotEnvPayload, err := readDotEnvRawPayloadFromDisk(path)
	if err != nil {
		return managedAPIKeysWriteStoreState{}, err
	}
	currentEnvVars, err := parseDotEnvPayload(rawDotEnvPayload)
	if err != nil {
		return managedAPIKeysWriteStoreState{}, err
	}

	currentManagedKeyNames, currentAPIKeys, err := readManagedAPIKeysFromDotEnvPayload(currentEnvVars)
	if err == nil {
		return managedAPIKeysWriteStoreState{
			rawDotEnvPayload:       rawDotEnvPayload,
			currentManagedKeyNames: currentManagedKeyNames,
			managedKeyNamesToPurge: map[string]struct{}{},
			currentAPIKeys:         currentAPIKeys,
		}, nil
	}

	managedKeyNamesToPurge, err := purgeManagedAPIKeyNamesForRepair(err, expectedRevision, configuredProviderKeyNames)
	if err != nil {
		return managedAPIKeysWriteStoreState{}, err
	}
	return managedAPIKeysWriteStoreState{
		rawDotEnvPayload:       rawDotEnvPayload,
		currentManagedKeyNames: map[string]struct{}{},
		managedKeyNamesToPurge: managedKeyNamesToPurge,
		currentAPIKeys:         map[string]string{},
	}, nil
}

func readManagedAPIKeysFromDotEnvPayload(envVars map[string]string) (map[string]struct{}, map[string]string, error) {
	managedKeyNames, err := parseManagedAPIKeyNames(envVars[managedAPIKeyNamesEnvVar])
	if err != nil {
		return nil, nil, err
	}
	managedAPIKeys := map[string]string{}
	for key := range managedKeyNames {
		value, ok := envVars[key]
		if !ok {
			continue
		}
		trimmedValue := strings.TrimSpace(value)
		if trimmedValue == "" {
			return nil, nil, &managedAPIKeysStoreCorruptError{
				message: ".env API key values must be non-empty strings.",
			}
		}
		managedAPIKeys[key] = trimmedValue
	}
	return managedKeyNames, managedAPIKeys, nil
}

func purgeManagedAPIKeyNamesForRepair(err error, expectedRevision int, configuredProviderKeyNames []string) (map[string]struct{}, error) {
	var corruptErr *managedAPIKeysStoreCorruptError
	if !errorAs(err, &corruptErr) || expectedRevision != 0 {
		return nil, err
	}
	return normalizeManagedAPIKeyNames(configuredProviderKeyNames), nil
}

func parseManagedAPIKeyNames(rawValue string) (map[string]struct{}, error) {
	trimmed := strings.TrimSpace(rawValue)
	if trimmed == "" {
		return map[string]struct{}{}, nil
	}
	var payload any
	if err := json.Unmarshal([]byte(trimmed), &payload); err != nil {
		return nil, &managedAPIKeysStoreCorruptError{
			message: "Managed API key index in .env is not valid JSON.",
		}
	}
	values, ok := payload.([]any)
	if !ok {
		return nil, &managedAPIKeysStoreCorruptError{
			message: "Managed API key index in .env must be a JSON array.",
		}
	}
	managedKeyNames := map[string]struct{}{}
	for _, rawName := range values {
		name, ok := rawName.(string)
		if !ok {
			return nil, &managedAPIKeysStoreCorruptError{
				message: "Managed API key names in .env must be strings.",
			}
		}
		normalizedName := strings.TrimSpace(name)
		if normalizedName == "" {
			continue
		}
		managedKeyNames[normalizedName] = struct{}{}
	}
	return managedKeyNames, nil
}

func buildNextDotEnvPayload(rawPayload *string, currentManagedKeyNames map[string]struct{}, managedKeyNamesToPurge map[string]struct{}, nextManagedAPIKeys map[string]string) string {
	preservedContent := strings.Join(
		preservedDotEnvLines(rawPayload, managedAPIKeysToRemove(currentManagedKeyNames, managedKeyNamesToPurge)),
		"",
	)
	additions := managedAPIKeyAdditions(nextManagedAPIKeys)
	if len(additions) == 0 {
		return preservedContent
	}
	newline := resolveDotEnvNewline(rawPayload)
	if requiresDotEnvJoinNewline(preservedContent) {
		preservedContent += newline
	}
	return preservedContent + strings.Join(additions, newline) + newline
}

func managedAPIKeysToRemove(currentManagedKeyNames map[string]struct{}, managedKeyNamesToPurge map[string]struct{}) map[string]struct{} {
	keysToRemove := map[string]struct{}{}
	for key := range currentManagedKeyNames {
		keysToRemove[key] = struct{}{}
	}
	for key := range managedKeyNamesToPurge {
		keysToRemove[key] = struct{}{}
	}
	keysToRemove[managedAPIKeyNamesEnvVar] = struct{}{}
	return keysToRemove
}

func preservedDotEnvLines(rawPayload *string, managedKeysToRemove map[string]struct{}) []string {
	if rawPayload == nil {
		return nil
	}
	preservedLines := make([]string, 0)
	for _, rawLine := range splitLinesKeepEnds(*rawPayload) {
		key := extractDotEnvAssignmentKey(strings.TrimRight(rawLine, "\r\n"))
		if key != "" {
			if _, ok := managedKeysToRemove[key]; ok {
				continue
			}
		}
		preservedLines = append(preservedLines, rawLine)
	}
	return preservedLines
}

func managedAPIKeyAdditions(nextManagedAPIKeys map[string]string) []string {
	if len(nextManagedAPIKeys) == 0 {
		return nil
	}
	keys := make([]string, 0, len(nextManagedAPIKeys))
	for key := range nextManagedAPIKeys {
		keys = append(keys, key)
	}
	slices.Sort(keys)

	additions := make([]string, 0, len(nextManagedAPIKeys)+1)
	for _, key := range keys {
		additions = append(additions, key+"="+serializeDotEnvAssignmentValue(nextManagedAPIKeys[key]))
	}
	return append(additions, managedAPIKeyNamesEnvVar+"="+mustMarshalManagedAPIKeyNames(keys))
}

func requiresDotEnvJoinNewline(preservedContent string) bool {
	return preservedContent != "" &&
		!strings.HasSuffix(preservedContent, "\n") &&
		!strings.HasSuffix(preservedContent, "\r")
}

func writeDotEnvPayloadToDisk(path string, content string) error {
	if err := statefs.AtomicWriteFile(path, []byte(content), managedAPIKeysFileMode); err != nil {
		return &managedAPIKeysStoreUnavailableError{
			message: fmt.Sprintf("Failed to write .env API key store: %v", err),
		}
	}
	return nil
}

func splitLinesKeepEnds(raw string) []string {
	if raw == "" {
		return nil
	}
	lines := make([]string, 0)
	start := 0
	for index := 0; index < len(raw); index++ {
		if raw[index] != '\n' {
			continue
		}
		lines = append(lines, raw[start:index+1])
		start = index + 1
	}
	if start < len(raw) {
		lines = append(lines, raw[start:])
	}
	return lines
}

func extractDotEnvAssignmentKey(line string) string {
	matches := dotEnvAssignmentPattern.FindStringSubmatch(line)
	if len(matches) != 2 {
		return ""
	}
	return matches[1]
}

func serializeDotEnvAssignmentValue(value string) string {
	if safeUnquotedManagedAPIKeyValueRegexp.MatchString(value) {
		return value
	}
	escaped := strings.ReplaceAll(value, `\`, `\\`)
	escaped = strings.ReplaceAll(escaped, `"`, `\"`)
	escaped = strings.ReplaceAll(escaped, "\n", `\n`)
	return `"` + escaped + `"`
}

func resolveDotEnvNewline(rawPayload *string) string {
	if rawPayload != nil && strings.Contains(*rawPayload, "\r\n") {
		return "\r\n"
	}
	return "\n"
}

func managedAPIKeysRevisionConflictWriteAttempt(currentAPIKeys map[string]string, expectedRevision int, currentRevision int) ManagedAPIKeysWriteAttempt {
	return ManagedAPIKeysWriteAttempt{
		Status:    ManagedAPIKeysWriteStatusRevisionConflict,
		APIKeys:   cloneStringMap(currentAPIKeys),
		Revision:  currentRevision,
		ErrorCode: ManagedAPIKeysRevisionConflictErrorCode,
		Error: fmt.Sprintf(
			".env API key store revision mismatch: expected %d, found %d.",
			expectedRevision,
			currentRevision,
		),
	}
}

func managedAPIKeysSuccessWriteAttempt(apiKeys map[string]string) ManagedAPIKeysWriteAttempt {
	return ManagedAPIKeysWriteAttempt{
		Status:   ManagedAPIKeysWriteStatusSuccess,
		APIKeys:  cloneStringMap(apiKeys),
		Revision: computeManagedAPIKeysRevision(apiKeys),
	}
}

func managedAPIKeysWriteAttemptFromError(err error) ManagedAPIKeysWriteAttempt {
	var corruptErr *managedAPIKeysStoreCorruptError
	if errorAs(err, &corruptErr) {
		return managedAPIKeysCorruptWriteAttempt(err)
	}
	return managedAPIKeysUnavailableWriteAttempt(err)
}

func mustMarshalManagedAPIKeyNames(keys []string) string {
	content, err := json.Marshal(keys)
	if err != nil {
		return "[]"
	}
	return string(content)
}

func managedAPIKeysUnavailableResult(err error) ManagedAPIKeysReadResult {
	return ManagedAPIKeysReadResult{
		APIKeys:   map[string]string{},
		Revision:  0,
		Corrupt:   false,
		ErrorCode: ManagedAPIKeysUnavailableErrorCode,
		Error:     err.Error(),
	}
}

func managedAPIKeysCorruptResult(err error) ManagedAPIKeysReadResult {
	return ManagedAPIKeysReadResult{
		APIKeys:   map[string]string{},
		Revision:  0,
		Corrupt:   true,
		ErrorCode: ManagedAPIKeysCorruptErrorCode,
		Error:     err.Error(),
	}
}

func managedAPIKeysUnavailableWriteAttempt(err error) ManagedAPIKeysWriteAttempt {
	return ManagedAPIKeysWriteAttempt{
		Status:    ManagedAPIKeysWriteStatusStoreUnavailable,
		APIKeys:   map[string]string{},
		Revision:  0,
		ErrorCode: ManagedAPIKeysUnavailableErrorCode,
		Error:     err.Error(),
	}
}

func managedAPIKeysCorruptWriteAttempt(err error) ManagedAPIKeysWriteAttempt {
	return ManagedAPIKeysWriteAttempt{
		Status:    ManagedAPIKeysWriteStatusCorruptStore,
		APIKeys:   map[string]string{},
		Revision:  0,
		ErrorCode: ManagedAPIKeysCorruptErrorCode,
		Error:     err.Error(),
	}
}

func optionalStringPointer(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	cloned := value
	return &cloned
}

func errorAs(err error, target any) bool {
	switch typedTarget := target.(type) {
	case **managedAPIKeysStoreCorruptError:
		value, ok := err.(*managedAPIKeysStoreCorruptError)
		if !ok {
			return false
		}
		*typedTarget = value
		return true
	case **managedAPIKeysStoreUnavailableError:
		value, ok := err.(*managedAPIKeysStoreUnavailableError)
		if !ok {
			return false
		}
		*typedTarget = value
		return true
	default:
		return false
	}
}
