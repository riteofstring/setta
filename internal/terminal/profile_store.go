package terminal

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"setta/internal/jsonio"
)

const (
	ProfileSchemaVersion = 1

	defaultFontFamily = `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`
	defaultFontSize   = 13
	defaultScrollback = 1200
	maxArgs           = 64
	maxArgBytes       = 4096
	maxEnvEntries     = 64
	maxEnvValueBytes  = 8192
	maxFontFamily     = 160
	maxNameBytes      = 80
	maxProfileIDBytes = 80
	maxProfiles       = 128
	minFontSize       = 10
	minScrollback     = 100
	profilesFileName  = "terminal-profiles.json"
	settingsDirName   = "settings"
	maxFontSize       = 22
	maxScrollback     = 10000
)

type ProfileStore struct {
	clock       func() time.Time
	mu          sync.Mutex
	path        string
	settingsDir string
}

type ProfileStoreOption func(*ProfileStore)

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

type terminalProfilesState struct {
	SchemaVersion    int                     `json:"schemaVersion"`
	DefaultProfileID string                  `json:"defaultProfileId"`
	Profiles         []terminalProfileRecord `json:"profiles"`
}

type terminalProfileRecord struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	LaunchMode ProfileLaunchMode `json:"launchMode"`
	ShellPath  string            `json:"shellPath"`
	Args       []string          `json:"args"`
	CWDMode    ProfileCWDMode    `json:"cwdMode"`
	CWD        string            `json:"cwd"`
	Env        map[string]string `json:"env"`
	FontFamily string            `json:"fontFamily"`
	FontSize   int               `json:"fontSize"`
	ThemeID    ThemeID           `json:"themeId"`
	Scrollback int               `json:"scrollback"`
	CreatedAt  string            `json:"createdAt"`
	UpdatedAt  string            `json:"updatedAt"`
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed terminal profile state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewProfileStore(appDataDir string, options ...ProfileStoreOption) (*ProfileStore, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	settingsDir := filepath.Join(filepath.Clean(appDataDir), settingsDirName)
	store := &ProfileStore{
		clock:       time.Now,
		path:        filepath.Join(settingsDir, profilesFileName),
		settingsDir: settingsDir,
	}
	for _, option := range options {
		option(store)
	}
	return store, nil
}

func WithProfileStoreClock(clock func() time.Time) ProfileStoreOption {
	return func(store *ProfileStore) {
		store.clock = clock
	}
}

func (store *ProfileStore) Path() string {
	return store.path
}

func (store *ProfileStore) EnsureInitialized() error {
	store.mu.Lock()
	defer store.mu.Unlock()
	state, exists, err := store.loadLocked()
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return store.saveLocked(state)
}

func (store *ProfileStore) List() (TerminalProfileList, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfileList{}, err
	}
	return profileListFromState(state), nil
}

func (store *ProfileStore) Resolve(profileID string) (TerminalProfile, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfile{}, err
	}
	id := strings.TrimSpace(profileID)
	if id == "" {
		id = state.DefaultProfileID
	}
	for _, profile := range state.Profiles {
		if profile.ID == id {
			return profile.toContract(), nil
		}
	}
	return TerminalProfile{}, fmt.Errorf("terminal profile not found: %s", id)
}

func (store *ProfileStore) Create(input TerminalProfileInput) (TerminalProfileList, error) {
	record, err := normalizeProfileInput(input, store.timestamp())
	if err != nil {
		return TerminalProfileList{}, err
	}
	id, err := newProfileID()
	if err != nil {
		return TerminalProfileList{}, err
	}
	record.ID = id

	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfileList{}, err
	}
	if len(state.Profiles) >= maxProfiles {
		return TerminalProfileList{}, fmt.Errorf("terminal profiles exceed limit %d", maxProfiles)
	}
	state.Profiles = append(state.Profiles, record)
	if err := validateTerminalProfilesState(state, store.path); err != nil {
		return TerminalProfileList{}, err
	}
	if err := store.saveLocked(state); err != nil {
		return TerminalProfileList{}, err
	}
	return profileListFromState(state), nil
}

func (store *ProfileStore) Update(id string, input TerminalProfileInput) (TerminalProfileList, error) {
	id = strings.TrimSpace(id)
	if err := validateProfileID(id); err != nil {
		return TerminalProfileList{}, err
	}
	record, err := normalizeProfileInput(input, store.timestamp())
	if err != nil {
		return TerminalProfileList{}, err
	}
	record.ID = id

	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfileList{}, err
	}
	for index, existing := range state.Profiles {
		if existing.ID != id {
			continue
		}
		record.CreatedAt = existing.CreatedAt
		state.Profiles[index] = record
		if err := validateTerminalProfilesState(state, store.path); err != nil {
			return TerminalProfileList{}, err
		}
		if err := store.saveLocked(state); err != nil {
			return TerminalProfileList{}, err
		}
		return profileListFromState(state), nil
	}
	return TerminalProfileList{}, fmt.Errorf("terminal profile not found: %s", id)
}

func (store *ProfileStore) Delete(id string) (TerminalProfileList, error) {
	id = strings.TrimSpace(id)
	if id == DefaultProfileID {
		return TerminalProfileList{}, errors.New("default terminal profile cannot be deleted")
	}
	if err := validateProfileID(id); err != nil {
		return TerminalProfileList{}, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfileList{}, err
	}
	next := state.Profiles[:0]
	deleted := false
	for _, profile := range state.Profiles {
		if profile.ID == id {
			deleted = true
			continue
		}
		next = append(next, profile)
	}
	if !deleted {
		return TerminalProfileList{}, fmt.Errorf("terminal profile not found: %s", id)
	}
	state.Profiles = next
	if state.DefaultProfileID == id {
		state.DefaultProfileID = DefaultProfileID
	}
	if err := validateTerminalProfilesState(state, store.path); err != nil {
		return TerminalProfileList{}, err
	}
	if err := store.saveLocked(state); err != nil {
		return TerminalProfileList{}, err
	}
	return profileListFromState(state), nil
}

func (store *ProfileStore) SetDefault(id string) (TerminalProfileList, error) {
	id = strings.TrimSpace(id)
	if err := validateProfileID(id); err != nil {
		return TerminalProfileList{}, err
	}

	store.mu.Lock()
	defer store.mu.Unlock()
	state, _, err := store.loadLocked()
	if err != nil {
		return TerminalProfileList{}, err
	}
	found := false
	for _, profile := range state.Profiles {
		if profile.ID == id {
			found = true
			break
		}
	}
	if !found {
		return TerminalProfileList{}, fmt.Errorf("terminal profile not found: %s", id)
	}
	state.DefaultProfileID = id
	if err := store.saveLocked(state); err != nil {
		return TerminalProfileList{}, err
	}
	return profileListFromState(state), nil
}

func (store *ProfileStore) loadLocked() (terminalProfilesState, bool, error) {
	file, err := os.Open(store.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return defaultProfilesState(store.timestamp()), false, nil
		}
		return terminalProfilesState{}, false, &PersistenceError{Operation: "read terminal profiles", Path: store.path, Err: err}
	}
	defer file.Close()

	var state terminalProfilesState
	if err := jsonio.DecodeSingle(file, &state); err != nil {
		return terminalProfilesState{}, false, corruptProfileStateError(store.path, err)
	}
	if err := validateTerminalProfilesState(state, store.path); err != nil {
		return terminalProfilesState{}, false, err
	}
	return state, true, nil
}

func (store *ProfileStore) saveLocked(state terminalProfilesState) error {
	if err := validateTerminalProfilesState(state, store.path); err != nil {
		return err
	}
	if err := os.MkdirAll(store.settingsDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create terminal profile settings directory", Path: store.settingsDir, Err: err}
	}
	file, err := os.CreateTemp(store.settingsDir, ".terminal-profiles-*.tmp")
	if err != nil {
		return &PersistenceError{Operation: "create terminal profiles temp file", Path: store.settingsDir, Err: err}
	}
	tempPath := file.Name()
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.Remove(tempPath)
		}
	}()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(state); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write terminal profiles temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close terminal profiles temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, store.path); err != nil {
		return &PersistenceError{Operation: "replace terminal profiles", Path: store.path, Err: err}
	}
	removeTemp = false
	return nil
}

func (store *ProfileStore) timestamp() string {
	return store.clock().UTC().Format(time.RFC3339Nano)
}

func defaultProfilesState(now string) terminalProfilesState {
	return terminalProfilesState{
		SchemaVersion:    ProfileSchemaVersion,
		DefaultProfileID: DefaultProfileID,
		Profiles: []terminalProfileRecord{
			{
				ID:         DefaultProfileID,
				Name:       "Default",
				LaunchMode: ProfileLaunchModeShell,
				ShellPath:  "",
				Args:       []string{},
				CWDMode:    ProfileCWDModeProject,
				CWD:        "",
				Env:        map[string]string{},
				FontFamily: defaultFontFamily,
				FontSize:   defaultFontSize,
				ThemeID:    ThemeSettaDark,
				Scrollback: defaultScrollback,
				CreatedAt:  now,
				UpdatedAt:  now,
			},
		},
	}
}

func profileListFromState(state terminalProfilesState) TerminalProfileList {
	profiles := make([]TerminalProfile, 0, len(state.Profiles))
	for _, profile := range state.Profiles {
		profiles = append(profiles, profile.toContract())
	}
	return TerminalProfileList{
		DefaultProfileID: state.DefaultProfileID,
		Profiles:         profiles,
		DetectedShells:   DetectShells(),
	}
}

func (profile terminalProfileRecord) toContract() TerminalProfile {
	return TerminalProfile{
		ID:            profile.ID,
		Name:          profile.Name,
		LaunchMode:    profile.LaunchMode,
		ShellPath:     profile.ShellPath,
		Args:          append([]string{}, profile.Args...),
		CWDMode:       profile.CWDMode,
		CWD:           profile.CWD,
		Env:           copyEnv(profile.Env),
		FontFamily:    profile.FontFamily,
		FontSize:      profile.FontSize,
		ThemeID:       profile.ThemeID,
		Scrollback:    profile.Scrollback,
		SafeAutoStart: profile.LaunchMode == ProfileLaunchModeShell,
		CreatedAt:     profile.CreatedAt,
		UpdatedAt:     profile.UpdatedAt,
	}
}

func normalizeProfileInput(input TerminalProfileInput, now string) (terminalProfileRecord, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return terminalProfileRecord{}, errors.New("terminal profile name is required")
	}
	if len(name) > maxNameBytes {
		return terminalProfileRecord{}, fmt.Errorf("terminal profile name exceeds %d bytes", maxNameBytes)
	}
	launchMode := input.LaunchMode
	if err := validateLaunchMode(launchMode); err != nil {
		return terminalProfileRecord{}, err
	}
	shellPath, err := normalizeProfileShellPath(launchMode, input.ShellPath)
	if err != nil {
		return terminalProfileRecord{}, err
	}
	args, err := normalizeArgs(input.Args)
	if err != nil {
		return terminalProfileRecord{}, err
	}
	cwdMode := input.CWDMode
	if err := validateCWDMode(cwdMode); err != nil {
		return terminalProfileRecord{}, err
	}
	cwd, err := normalizeProfileCWD(cwdMode, input.CWD)
	if err != nil {
		return terminalProfileRecord{}, err
	}
	env, err := normalizeEnv(input.Env)
	if err != nil {
		return terminalProfileRecord{}, err
	}
	return terminalProfileRecord{
		Name:       name,
		LaunchMode: launchMode,
		ShellPath:  shellPath,
		Args:       args,
		CWDMode:    cwdMode,
		CWD:        cwd,
		Env:        env,
		FontFamily: normalizeFontFamily(input.FontFamily),
		FontSize:   normalizeBoundedInt(input.FontSize, minFontSize, maxFontSize, defaultFontSize),
		ThemeID:    normalizeThemeID(input.ThemeID),
		Scrollback: normalizeBoundedInt(input.Scrollback, minScrollback, maxScrollback, defaultScrollback),
		CreatedAt:  now,
		UpdatedAt:  now,
	}, nil
}

func validateTerminalProfilesState(state terminalProfilesState, path string) error {
	if state.SchemaVersion != ProfileSchemaVersion {
		return corruptProfileStateErrorf(path, "unsupported schemaVersion %d", state.SchemaVersion)
	}
	if len(state.Profiles) == 0 {
		return corruptProfileStateErrorf(path, "at least one terminal profile is required")
	}
	if len(state.Profiles) > maxProfiles {
		return corruptProfileStateErrorf(path, "terminal profiles exceed limit %d", maxProfiles)
	}
	if err := validateProfileID(state.DefaultProfileID); err != nil {
		return corruptProfileStateError(path, fmt.Errorf("defaultProfileId: %w", err))
	}
	ids := map[string]bool{}
	defaultExists := false
	for _, profile := range state.Profiles {
		if err := validateProfileRecord(profile); err != nil {
			return corruptProfileStateError(path, err)
		}
		if ids[profile.ID] {
			return corruptProfileStateErrorf(path, "duplicate terminal profile id %s", profile.ID)
		}
		ids[profile.ID] = true
		if profile.ID == state.DefaultProfileID {
			defaultExists = true
		}
	}
	if !defaultExists {
		return corruptProfileStateErrorf(path, "defaultProfileId %s does not match a profile", state.DefaultProfileID)
	}
	return nil
}

func validateProfileRecord(profile terminalProfileRecord) error {
	if err := validateProfileID(profile.ID); err != nil {
		return err
	}
	if err := validateProfileCollections(profile); err != nil {
		return err
	}
	normalized, err := normalizeProfileInput(TerminalProfileInput{
		Name:       profile.Name,
		LaunchMode: profile.LaunchMode,
		ShellPath:  profile.ShellPath,
		Args:       profile.Args,
		CWDMode:    profile.CWDMode,
		CWD:        profile.CWD,
		Env:        profile.Env,
		FontFamily: profile.FontFamily,
		FontSize:   profile.FontSize,
		ThemeID:    profile.ThemeID,
		Scrollback: profile.Scrollback,
	}, profile.UpdatedAt)
	if err != nil {
		return fmt.Errorf("terminal profile %s: %w", profile.ID, err)
	}
	if err := validateProfileMatchesNormalized(profile, normalized); err != nil {
		return err
	}
	return validateProfileTimestamps(profile)
}

func validateProfileCollections(profile terminalProfileRecord) error {
	if profile.Args == nil {
		return fmt.Errorf("terminal profile %s args are required", profile.ID)
	}
	if profile.Env == nil {
		return fmt.Errorf("terminal profile %s env is required", profile.ID)
	}
	return nil
}

func validateProfileMatchesNormalized(profile terminalProfileRecord, normalized terminalProfileRecord) error {
	if normalized.Name != profile.Name {
		return fmt.Errorf("terminal profile %s name is not normalized", profile.ID)
	}
	if normalized.ShellPath != profile.ShellPath {
		return fmt.Errorf("terminal profile %s shellPath is not normalized", profile.ID)
	}
	if normalized.CWD != profile.CWD {
		return fmt.Errorf("terminal profile %s cwd is not normalized", profile.ID)
	}
	if normalized.FontFamily != profile.FontFamily {
		return fmt.Errorf("terminal profile %s fontFamily is not normalized", profile.ID)
	}
	if normalized.FontSize != profile.FontSize {
		return fmt.Errorf("terminal profile %s fontSize is invalid", profile.ID)
	}
	if normalized.ThemeID != profile.ThemeID {
		return fmt.Errorf("terminal profile %s themeId is invalid", profile.ID)
	}
	if normalized.Scrollback != profile.Scrollback {
		return fmt.Errorf("terminal profile %s scrollback is invalid", profile.ID)
	}
	return nil
}

func validateProfileTimestamps(profile terminalProfileRecord) error {
	if _, err := time.Parse(time.RFC3339Nano, profile.CreatedAt); err != nil {
		return fmt.Errorf("terminal profile %s createdAt must be RFC3339: %w", profile.ID, err)
	}
	if _, err := time.Parse(time.RFC3339Nano, profile.UpdatedAt); err != nil {
		return fmt.Errorf("terminal profile %s updatedAt must be RFC3339: %w", profile.ID, err)
	}
	return nil
}

func validateProfileID(id string) error {
	if id == "" {
		return errors.New("terminal profile id is required")
	}
	if len(id) > maxProfileIDBytes {
		return fmt.Errorf("terminal profile id exceeds %d bytes", maxProfileIDBytes)
	}
	for _, char := range id {
		if isProfileIDChar(char) {
			continue
		}
		return fmt.Errorf("terminal profile id contains unsupported character %q", char)
	}
	return nil
}

func normalizeProfileShellPath(mode ProfileLaunchMode, value string) (string, error) {
	shellPath := strings.TrimSpace(value)
	if mode == ProfileLaunchModeCustomCommand && shellPath == "" {
		return "", errors.New("custom command profile shellPath is required")
	}
	if shellPath == "" {
		return "", nil
	}
	return validateExecutablePath(shellPath)
}

func normalizeProfileCWD(mode ProfileCWDMode, value string) (string, error) {
	cwd := strings.TrimSpace(value)
	if mode != ProfileCWDModeCustom {
		return "", nil
	}
	return validateCWD(cwd)
}

func validateLaunchMode(mode ProfileLaunchMode) error {
	switch mode {
	case ProfileLaunchModeShell, ProfileLaunchModeCustomCommand:
		return nil
	default:
		return fmt.Errorf("unsupported terminal profile launchMode: %s", mode)
	}
}

func validateCWDMode(mode ProfileCWDMode) error {
	switch mode {
	case ProfileCWDModeProject, ProfileCWDModeHome, ProfileCWDModeCustom:
		return nil
	default:
		return fmt.Errorf("unsupported terminal profile cwdMode: %s", mode)
	}
}

func normalizeArgs(args []string) ([]string, error) {
	if len(args) > maxArgs {
		return nil, fmt.Errorf("terminal profile args exceed limit %d", maxArgs)
	}
	normalized := make([]string, 0, len(args))
	for index, arg := range args {
		if strings.ContainsRune(arg, 0) {
			return nil, fmt.Errorf("terminal profile arg %d contains NUL", index)
		}
		if len(arg) > maxArgBytes {
			return nil, fmt.Errorf("terminal profile arg %d exceeds %d bytes", index, maxArgBytes)
		}
		normalized = append(normalized, arg)
	}
	return normalized, nil
}

func normalizeEnv(env map[string]string) (map[string]string, error) {
	if len(env) > maxEnvEntries {
		return nil, fmt.Errorf("terminal profile env exceeds limit %d", maxEnvEntries)
	}
	normalized := map[string]string{}
	for key, value := range env {
		key = strings.TrimSpace(key)
		if err := validateEnvKey(key); err != nil {
			return nil, err
		}
		if isReservedTerminalEnv(key) {
			return nil, fmt.Errorf("terminal profile env cannot override %s", key)
		}
		if strings.ContainsRune(value, 0) {
			return nil, fmt.Errorf("terminal profile env %s contains NUL", key)
		}
		if len(value) > maxEnvValueBytes {
			return nil, fmt.Errorf("terminal profile env %s exceeds %d bytes", key, maxEnvValueBytes)
		}
		normalized[key] = value
	}
	return normalized, nil
}

func validateEnvKey(key string) error {
	if key == "" {
		return errors.New("terminal profile env key is required")
	}
	for index, char := range key {
		if index == 0 && !isEnvKeyStart(char) {
			return fmt.Errorf("terminal profile env key must start with a letter or underscore: %s", key)
		}
		if isEnvKeyChar(char) {
			continue
		}
		return fmt.Errorf("terminal profile env key contains unsupported character: %s", key)
	}
	return nil
}

func isProfileIDChar(char rune) bool {
	return isASCIILetter(char) || isASCIIDigit(char) || char == '_' || char == '-' || char == '.'
}

func isEnvKeyStart(char rune) bool {
	return isASCIILetter(char) || char == '_'
}

func isEnvKeyChar(char rune) bool {
	return isEnvKeyStart(char) || isASCIIDigit(char)
}

func isASCIILetter(char rune) bool {
	return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')
}

func isASCIIDigit(char rune) bool {
	return char >= '0' && char <= '9'
}

func isReservedTerminalEnv(key string) bool {
	return key == "TERM" || key == "COLORTERM" || key == "TERM_PROGRAM"
}

func normalizeFontFamily(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > maxFontFamily {
		return defaultFontFamily
	}
	return value
}

func normalizeThemeID(value ThemeID) ThemeID {
	switch value {
	case ThemeSettaDark, ThemeHighContrastDark, ThemeSettaLight:
		return value
	default:
		return ThemeSettaDark
	}
}

func normalizeBoundedInt(value int, min int, max int, fallback int) int {
	if value == 0 {
		return fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func validateExecutablePath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("shell path is required")
	}
	if !filepath.IsAbs(path) {
		return "", fmt.Errorf("shell path must be absolute: %s", path)
	}
	cleaned := filepath.Clean(path)
	info, err := os.Stat(cleaned)
	if err != nil {
		return "", fmt.Errorf("read shell %s: %w", cleaned, err)
	}
	if info.IsDir() {
		return "", fmt.Errorf("shell path is a directory: %s", cleaned)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm()&0o111 == 0 {
		return "", fmt.Errorf("shell path is not executable: %s", cleaned)
	}
	return cleaned, nil
}

func DetectShells() []TerminalDetectedShell {
	candidates := detectedShellCandidates()
	shells := make([]TerminalDetectedShell, 0, len(candidates))
	seen := map[string]bool{}
	for _, candidate := range candidates {
		path := strings.TrimSpace(candidate.path)
		if path == "" {
			continue
		}
		if !filepath.IsAbs(path) {
			resolved, err := exec.LookPath(path)
			if err != nil {
				continue
			}
			path = resolved
		}
		resolved, err := validateExecutablePath(path)
		if err != nil || seen[resolved] {
			continue
		}
		seen[resolved] = true
		shells = append(shells, TerminalDetectedShell{
			ID:         detectedShellID(candidate.name, resolved),
			Name:       candidate.name,
			Path:       resolved,
			LaunchMode: candidate.launchMode,
		})
	}
	sort.SliceStable(shells, func(left int, right int) bool {
		if shells[left].Name == shells[right].Name {
			return shells[left].Path < shells[right].Path
		}
		return shells[left].Name < shells[right].Name
	})
	return shells
}

type detectedShellCandidate struct {
	launchMode ProfileLaunchMode
	name       string
	path       string
}

func detectedShellCandidates() []detectedShellCandidate {
	candidates := []detectedShellCandidate{}
	if envShell := os.Getenv("SHELL"); envShell != "" {
		candidates = append(candidates, detectedShellCandidate{
			launchMode: ProfileLaunchModeShell,
			name:       filepath.Base(envShell),
			path:       envShell,
		})
	}
	switch runtime.GOOS {
	case "darwin":
		candidates = append(candidates,
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "zsh", path: "/bin/zsh"},
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "bash", path: "/bin/bash"},
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "sh", path: "/bin/sh"},
		)
	case "windows":
		candidates = append(candidates,
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "PowerShell", path: "pwsh.exe"},
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "Windows PowerShell", path: "powershell.exe"},
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "WSL", path: "wsl.exe"},
		)
	default:
		candidates = append(candidates,
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "bash", path: "/bin/bash"},
			detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "sh", path: "/bin/sh"},
		)
	}
	candidates = append(candidates,
		detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "fish", path: "fish"},
		detectedShellCandidate{launchMode: ProfileLaunchModeShell, name: "PowerShell", path: "pwsh"},
	)
	return candidates
}

func detectedShellID(name string, path string) string {
	base := strings.ToLower(name)
	base = strings.ReplaceAll(base, " ", "-")
	base = strings.Trim(base, "-")
	if base == "" {
		base = "shell"
	}
	return base + "-" + filepath.Base(path)
}

func copyEnv(env map[string]string) map[string]string {
	copied := make(map[string]string, len(env))
	for key, value := range env {
		copied[key] = value
	}
	return copied
}

func newProfileID() (string, error) {
	var bytes [12]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", fmt.Errorf("generate terminal profile id: %w", err)
	}
	return "terminal_profile_" + hex.EncodeToString(bytes[:]), nil
}

func corruptProfileStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptProfileStateErrorf(path string, format string, args ...any) error {
	return corruptProfileStateError(path, fmt.Errorf(format, args...))
}
