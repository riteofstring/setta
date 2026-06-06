package orchestrator

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"setta/internal/jsonio"
)

const (
	workflowsDirName   = "workflows"
	definitionsDirName = "definitions"
	versionsDirName    = "versions"
	executionsDirName  = "executions"
	eventsDirName      = "events"
	executionFileName  = "execution.json"
)

type Store struct {
	appDataDir string
}

type PersistenceError struct {
	Operation string
	Path      string
	Err       error
}

type CorruptStateError struct {
	Path string
	Err  error
}

type eventFile struct {
	ordinal int
	path    string
}

func (err *PersistenceError) Error() string {
	return fmt.Sprintf("%s %s: %v", err.Operation, err.Path, err.Err)
}

func (err *PersistenceError) Unwrap() error {
	return err.Err
}

func (err *CorruptStateError) Error() string {
	return fmt.Sprintf("malformed workflow state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
}

func IsPersistenceError(err error) bool {
	var persistenceError *PersistenceError
	return errors.As(err, &persistenceError)
}

func IsCorruptStateError(err error) bool {
	var corruptStateError *CorruptStateError
	return errors.As(err, &corruptStateError)
}

func NewStore(appDataDir string) (*Store, error) {
	if appDataDir == "" {
		return nil, errors.New("app data directory is required")
	}
	if !filepath.IsAbs(appDataDir) {
		return nil, fmt.Errorf("app data directory must be absolute: %s", appDataDir)
	}
	return &Store{appDataDir: filepath.Clean(appDataDir)}, nil
}

func (store *Store) SaveDefinition(definition WorkflowDefinition) error {
	if err := validateDefinitionSnapshot(definition); err != nil {
		return err
	}
	return writeWorkflowJSONFile(store.definitionPath(definition.WorkspaceID, definition.ID), definition)
}

func (store *Store) LoadDefinition(workspaceID string, definitionID string) (WorkflowDefinition, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return WorkflowDefinition{}, err
	}
	path := store.definitionPath(workspaceID, definitionID)
	var definition WorkflowDefinition
	if err := readWorkflowJSONFile(path, &definition); err != nil {
		return WorkflowDefinition{}, err
	}
	if err := validateDefinitionSnapshot(definition); err != nil {
		return WorkflowDefinition{}, corruptStateError(path, err)
	}
	if definition.WorkspaceID != workspaceID || definition.ID != definitionID {
		return WorkflowDefinition{}, corruptStateErrorf(path, "definition %s belongs to workspace %s id %s", definitionID, definition.WorkspaceID, definition.ID)
	}
	return definition, nil
}

func (store *Store) ListDefinitions(workspaceID string) ([]WorkflowDefinition, error) {
	if err := validateStorageID("workspace id", workspaceID); err != nil {
		return nil, err
	}
	dir := store.definitionsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []WorkflowDefinition{}, nil
		}
		return nil, &PersistenceError{Operation: "list workflow definitions", Path: dir, Err: err}
	}
	definitions := []WorkflowDefinition{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		definitionID := strings.TrimSuffix(entry.Name(), ".json")
		definition, err := store.LoadDefinition(workspaceID, definitionID)
		if err != nil {
			return nil, err
		}
		definitions = append(definitions, definition)
	}
	sort.SliceStable(definitions, func(left int, right int) bool {
		if definitions[left].UpdatedAt == definitions[right].UpdatedAt {
			return definitions[left].ID < definitions[right].ID
		}
		return definitions[left].UpdatedAt > definitions[right].UpdatedAt
	})
	return definitions, nil
}

func (store *Store) DeleteDefinition(workspaceID string, definitionID string) error {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID); err != nil {
		return err
	}
	path := store.definitionPath(workspaceID, definitionID)
	if err := os.Remove(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return &PersistenceError{Operation: "delete workflow definition", Path: path, Err: err}
	}
	return nil
}

func (store *Store) SaveDefinitionVersion(version WorkflowDefinitionVersion) error {
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return err
	}
	return writeNewWorkflowJSONFile(store.versionPath(version.WorkspaceID, version.DefinitionID, version.ID), version)
}

func (store *Store) LoadDefinitionVersion(workspaceID string, definitionID string, versionID string) (WorkflowDefinitionVersion, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "definition id", definitionID, "version id", versionID); err != nil {
		return WorkflowDefinitionVersion{}, err
	}
	path := store.versionPath(workspaceID, definitionID, versionID)
	var version WorkflowDefinitionVersion
	if err := readWorkflowJSONFile(path, &version); err != nil {
		return WorkflowDefinitionVersion{}, err
	}
	if err := validateDefinitionVersionSnapshot(version); err != nil {
		return WorkflowDefinitionVersion{}, corruptStateError(path, err)
	}
	if version.WorkspaceID != workspaceID || version.DefinitionID != definitionID || version.ID != versionID {
		return WorkflowDefinitionVersion{}, corruptStateErrorf(path, "version %s belongs to workspace %s definition %s id %s", versionID, version.WorkspaceID, version.DefinitionID, version.ID)
	}
	return version, nil
}

func (store *Store) SaveExecution(execution WorkflowExecution) error {
	if err := validateExecutionSnapshot(execution); err != nil {
		return err
	}
	return writeWorkflowJSONFile(store.executionPath(execution.WorkspaceID, execution.ID), execution)
}

func (store *Store) LoadExecution(workspaceID string, executionID string) (WorkflowExecution, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "execution id", executionID); err != nil {
		return WorkflowExecution{}, err
	}
	path := store.executionPath(workspaceID, executionID)
	var execution WorkflowExecution
	if err := readWorkflowJSONFile(path, &execution); err != nil {
		return WorkflowExecution{}, err
	}
	if err := validateExecutionSnapshot(execution); err != nil {
		return WorkflowExecution{}, corruptStateError(path, err)
	}
	if execution.WorkspaceID != workspaceID || execution.ID != executionID {
		return WorkflowExecution{}, corruptStateErrorf(path, "execution %s belongs to workspace %s id %s", executionID, execution.WorkspaceID, execution.ID)
	}
	return execution, nil
}

func (store *Store) ListExecutions(workspaceID string) ([]WorkflowExecution, error) {
	if err := validateStorageID("workspace id", workspaceID); err != nil {
		return nil, err
	}
	dir := store.executionsDir(workspaceID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []WorkflowExecution{}, nil
		}
		return nil, &PersistenceError{Operation: "list workflow executions", Path: dir, Err: err}
	}
	executions := []WorkflowExecution{}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		execution, err := store.LoadExecution(workspaceID, entry.Name())
		if err != nil {
			return nil, err
		}
		executions = append(executions, execution)
	}
	sort.SliceStable(executions, func(left int, right int) bool {
		if executions[left].StartedAt == executions[right].StartedAt {
			return executions[left].ID < executions[right].ID
		}
		return executions[left].StartedAt > executions[right].StartedAt
	})
	return executions, nil
}

func (store *Store) WorkspaceIDs() ([]string, error) {
	dir := filepath.Join(store.appDataDir, "workspaces")
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []string{}, nil
		}
		return nil, &PersistenceError{Operation: "list workflow workspaces", Path: dir, Err: err}
	}
	ids := []string{}
	for _, entry := range entries {
		if entry.IsDir() {
			ids = append(ids, entry.Name())
		}
	}
	sort.Strings(ids)
	return ids, nil
}

func (store *Store) AppendExecutionEvents(workspaceID string, executionID string, events []WorkflowEvent) error {
	if err := validateStoreIDs("workspace id", workspaceID, "execution id", executionID); err != nil {
		return err
	}
	for _, event := range events {
		if err := validateEventRecord(event); err != nil {
			return err
		}
		if event.WorkspaceID != workspaceID || event.ExecutionID != executionID {
			return fmt.Errorf("workflow event %s belongs to workspace %s execution %s, not workspace %s execution %s", event.ID, event.WorkspaceID, event.ExecutionID, workspaceID, executionID)
		}
		if err := writeNewWorkflowJSONFile(store.eventPath(workspaceID, executionID, event.Ordinal, event.ID), event); err != nil {
			return err
		}
	}
	return nil
}

func (store *Store) LoadExecutionEventPage(workspaceID string, executionID string, beforeOrdinal int, limit int) (WorkflowExecutionEventPage, error) {
	if err := validateStoreIDs("workspace id", workspaceID, "execution id", executionID); err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	if beforeOrdinal < 0 {
		return WorkflowExecutionEventPage{}, fmt.Errorf("workflow event beforeOrdinal must not be negative: %d", beforeOrdinal)
	}
	if limit <= 0 {
		return WorkflowExecutionEventPage{}, fmt.Errorf("workflow event page limit must be positive: %d", limit)
	}
	files, err := store.eventFiles(workspaceID, executionID)
	if err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	selected, hasMoreOlder := selectEventFiles(files, beforeOrdinal, limit)
	events, err := readEventFiles(selected)
	if err != nil {
		return WorkflowExecutionEventPage{}, err
	}
	olderBeforeOrdinal := 0
	if len(events) > 0 {
		olderBeforeOrdinal = events[0].Ordinal
	}
	return WorkflowExecutionEventPage{
		ExecutionID:        executionID,
		Events:             events,
		HasMoreOlder:       hasMoreOlder,
		OlderBeforeOrdinal: olderBeforeOrdinal,
	}, nil
}

func selectEventFiles(files []eventFile, beforeOrdinal int, limit int) ([]eventFile, bool) {
	eligible := make([]eventFile, 0, len(files))
	for _, file := range files {
		if beforeOrdinal == 0 || file.ordinal < beforeOrdinal {
			eligible = append(eligible, file)
		}
	}
	start := len(eligible) - limit
	if start < 0 {
		start = 0
	}
	return eligible[start:], start > 0
}

func readEventFiles(files []eventFile) ([]WorkflowEvent, error) {
	events := make([]WorkflowEvent, 0, len(files))
	for _, file := range files {
		event, err := readEventFile(file)
		if err != nil {
			return nil, err
		}
		events = append(events, event)
	}
	return events, nil
}

func readEventFile(file eventFile) (WorkflowEvent, error) {
	var event WorkflowEvent
	if err := readWorkflowJSONFile(file.path, &event); err != nil {
		return WorkflowEvent{}, err
	}
	if err := validateEventRecord(event); err != nil {
		return WorkflowEvent{}, corruptStateError(file.path, err)
	}
	return event, nil
}

func (store *Store) definitionPath(workspaceID string, definitionID string) string {
	return filepath.Join(store.definitionsDir(workspaceID), definitionID+".json")
}

func (store *Store) definitionsDir(workspaceID string) string {
	return filepath.Join(store.workflowsDir(workspaceID), definitionsDirName)
}

func (store *Store) versionPath(workspaceID string, definitionID string, versionID string) string {
	return filepath.Join(store.workflowsDir(workspaceID), versionsDirName, definitionID, versionID+".json")
}

func (store *Store) executionsDir(workspaceID string) string {
	return filepath.Join(store.workflowsDir(workspaceID), executionsDirName)
}

func (store *Store) executionDir(workspaceID string, executionID string) string {
	return filepath.Join(store.executionsDir(workspaceID), executionID)
}

func (store *Store) executionPath(workspaceID string, executionID string) string {
	return filepath.Join(store.executionDir(workspaceID, executionID), executionFileName)
}

func (store *Store) eventsDir(workspaceID string, executionID string) string {
	return filepath.Join(store.executionDir(workspaceID, executionID), eventsDirName)
}

func (store *Store) eventPath(workspaceID string, executionID string, ordinal int, eventID string) string {
	return filepath.Join(store.eventsDir(workspaceID, executionID), fmt.Sprintf("%012d_%s.json", ordinal, eventID))
}

func (store *Store) workflowsDir(workspaceID string) string {
	return filepath.Join(store.appDataDir, "workspaces", workspaceID, workflowsDirName)
}

func (store *Store) eventFiles(workspaceID string, executionID string) ([]eventFile, error) {
	dir := store.eventsDir(workspaceID, executionID)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []eventFile{}, nil
		}
		return nil, &PersistenceError{Operation: "list workflow events", Path: dir, Err: err}
	}
	files := []eventFile{}
	for _, entry := range entries {
		if entry.IsDir() || !isDataJSONFile(entry.Name()) {
			continue
		}
		ordinal, ok := ordinalFromDataFileName(entry.Name())
		if !ok {
			return nil, corruptStateErrorf(filepath.Join(dir, entry.Name()), "malformed workflow event filename")
		}
		files = append(files, eventFile{
			ordinal: ordinal,
			path:    filepath.Join(dir, entry.Name()),
		})
	}
	sort.SliceStable(files, func(left int, right int) bool {
		return files[left].ordinal < files[right].ordinal
	})
	return files, nil
}

func validateDefinitionSnapshot(definition WorkflowDefinition) error {
	if definition.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", definition.SchemaVersion)
	}
	if err := validateStoreIDs("definition id", definition.ID, "workspace id", definition.WorkspaceID, "current version id", definition.CurrentVersionID); err != nil {
		return err
	}
	if definition.CurrentVersionNumber <= 0 {
		return fmt.Errorf("definition %s currentVersionNumber must be positive", definition.ID)
	}
	if definition.Name == "" {
		return fmt.Errorf("definition %s name is required", definition.ID)
	}
	if definition.CreatedAt == "" || definition.UpdatedAt == "" {
		return fmt.Errorf("definition %s timestamps are required", definition.ID)
	}
	return nil
}

func validateDefinitionVersionSnapshot(version WorkflowDefinitionVersion) error {
	if version.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", version.SchemaVersion)
	}
	if err := validateStoreIDs("version id", version.ID, "workspace id", version.WorkspaceID, "definition id", version.DefinitionID); err != nil {
		return err
	}
	if version.VersionNumber <= 0 {
		return fmt.Errorf("definition version %s versionNumber must be positive", version.ID)
	}
	if version.Name == "" {
		return fmt.Errorf("definition version %s name is required", version.ID)
	}
	if version.CreatedAt == "" {
		return fmt.Errorf("definition version %s createdAt is required", version.ID)
	}
	return nil
}

func validateExecutionSnapshot(execution WorkflowExecution) error {
	if execution.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", execution.SchemaVersion)
	}
	if err := validateStoreIDs("execution id", execution.ID, "workspace id", execution.WorkspaceID, "definition id", execution.DefinitionID, "definition version id", execution.DefinitionVersionID); err != nil {
		return err
	}
	if execution.Status == "" {
		return fmt.Errorf("execution %s status is required", execution.ID)
	}
	if execution.CreatedAt == "" || execution.StartedAt == "" || execution.UpdatedAt == "" {
		return fmt.Errorf("execution %s timestamps are required", execution.ID)
	}
	if execution.NodeExecutions == nil {
		return fmt.Errorf("execution %s nodeExecutions must not be null", execution.ID)
	}
	if execution.Tokens == nil {
		return fmt.Errorf("execution %s tokens must not be null", execution.ID)
	}
	if execution.LoopIterations == nil {
		return fmt.Errorf("execution %s loopIterations must not be null", execution.ID)
	}
	return nil
}

func validateEventRecord(event WorkflowEvent) error {
	if event.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported schemaVersion %d", event.SchemaVersion)
	}
	if err := validateStoreIDs("event id", event.ID, "workspace id", event.WorkspaceID, "execution id", event.ExecutionID, "definition id", event.DefinitionID, "definition version id", event.DefinitionVersionID); err != nil {
		return err
	}
	if event.Ordinal <= 0 {
		return fmt.Errorf("workflow event %s ordinal must be positive", event.ID)
	}
	if event.Type == "" {
		return fmt.Errorf("workflow event %s type is required", event.ID)
	}
	if event.CreatedAt == "" {
		return fmt.Errorf("workflow event %s createdAt is required", event.ID)
	}
	return nil
}

func validateStoreIDs(pairs ...string) error {
	if len(pairs)%2 != 0 {
		return errors.New("validateStoreIDs requires label/value pairs")
	}
	for index := 0; index < len(pairs); index += 2 {
		if err := validateStorageID(pairs[index], pairs[index+1]); err != nil {
			return err
		}
	}
	return nil
}

func validateStorageID(label string, value string) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if !isStorageID(value) {
		return fmt.Errorf("%s %q must contain only letters, numbers, underscores, or hyphens", label, value)
	}
	return nil
}

func isDataJSONFile(name string) bool {
	return filepath.Ext(name) == ".json" && !strings.HasPrefix(name, ".")
}

func ordinalFromDataFileName(name string) (int, bool) {
	prefix, _, ok := strings.Cut(name, "_")
	if !ok {
		return 0, false
	}
	ordinal, err := strconv.Atoi(prefix)
	if err != nil || ordinal <= 0 {
		return 0, false
	}
	return ordinal, true
}

func writeWorkflowJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &PersistenceError{Operation: "create directory", Path: dir, Err: err}
	}
	file, err := os.CreateTemp(dir, ".tmp-*.json")
	if err != nil {
		return &PersistenceError{Operation: "create temp file", Path: dir, Err: err}
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
	if err := encoder.Encode(payload); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return &PersistenceError{Operation: "replace file", Path: path, Err: err}
	}
	removeTemp = false
	return nil
}

func writeNewWorkflowJSONFile(path string, payload any) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return &PersistenceError{Operation: "create directory", Path: dir, Err: err}
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return &PersistenceError{Operation: "create file", Path: path, Err: err}
	}
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		_ = file.Close()
		return &PersistenceError{Operation: "write file", Path: path, Err: err}
	}
	if err := file.Close(); err != nil {
		return &PersistenceError{Operation: "close file", Path: path, Err: err}
	}
	return nil
}

func readWorkflowJSONFile(path string, target any) error {
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &PersistenceError{Operation: "read file", Path: path, Err: err}
		}
		return &PersistenceError{Operation: "read file", Path: path, Err: err}
	}
	defer file.Close()
	if err := jsonio.DecodeSingle(file, target); err != nil {
		if errors.Is(err, io.EOF) {
			return corruptStateErrorf(path, "file is empty")
		}
		return corruptStateError(path, err)
	}
	return nil
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
