package workspaceui

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"setta/internal/jsonio"
	"setta/internal/orchestrator"
)

const stateFileName = "ui-state.json"

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
	return fmt.Sprintf("malformed workspace UI state %s: %v", err.Path, err.Err)
}

func (err *CorruptStateError) Unwrap() error {
	return err.Err
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

func StateFilePath(appDataDir string, workspaceID string) string {
	return filepath.Join(appDataDir, "workspaces", workspaceID, stateFileName)
}

func (store *Store) LoadLayout(workspaceID string) (WorkspaceUILayoutReadResult, error) {
	path, err := store.layoutPath(workspaceID)
	if err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return WorkspaceUILayoutReadResult{WorkspaceID: workspaceID, Layout: nil}, nil
		}
		return WorkspaceUILayoutReadResult{}, &PersistenceError{Operation: "read workspace UI state", Path: path, Err: err}
	}
	defer file.Close()

	var layout WorkspaceUILayout
	if err := jsonio.DecodeSingle(file, &layout); err != nil {
		return WorkspaceUILayoutReadResult{}, corruptStateError(path, err)
	}
	if err := validateLayout(layout, path); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	if layout.WorkspaceID != workspaceID {
		return WorkspaceUILayoutReadResult{}, corruptStateErrorf(path, "workspaceId %s does not match requested workspace %s", layout.WorkspaceID, workspaceID)
	}
	return WorkspaceUILayoutReadResult{WorkspaceID: workspaceID, Layout: &layout}, nil
}

func (store *Store) SaveLayout(layout WorkspaceUILayout) (WorkspaceUILayout, error) {
	path, err := store.layoutPath(layout.WorkspaceID)
	if err != nil {
		return WorkspaceUILayout{}, err
	}
	if err := validateLayout(layout, path); err != nil {
		return WorkspaceUILayout{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return WorkspaceUILayout{}, &PersistenceError{Operation: "create workspace UI state directory", Path: filepath.Dir(path), Err: err}
	}

	file, err := os.CreateTemp(filepath.Dir(path), ".ui-state-*.tmp")
	if err != nil {
		return WorkspaceUILayout{}, &PersistenceError{Operation: "create workspace UI state temp file", Path: filepath.Dir(path), Err: err}
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
	if err := encoder.Encode(layout); err != nil {
		_ = file.Close()
		return WorkspaceUILayout{}, &PersistenceError{Operation: "write workspace UI state temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return WorkspaceUILayout{}, &PersistenceError{Operation: "close workspace UI state temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return WorkspaceUILayout{}, &PersistenceError{Operation: "replace workspace UI state", Path: path, Err: err}
	}
	removeTemp = false
	return layout, nil
}

func (store *Store) layoutPath(workspaceID string) (string, error) {
	if err := validateWorkspaceID(workspaceID); err != nil {
		return "", err
	}
	return StateFilePath(store.appDataDir, workspaceID), nil
}

func validateLayout(layout WorkspaceUILayout, path string) error {
	if layout.SchemaVersion != SchemaVersion {
		return corruptStateErrorf(path, "unsupported schemaVersion %d", layout.SchemaVersion)
	}
	if err := validateWorkspaceID(layout.WorkspaceID); err != nil {
		return corruptStateError(path, err)
	}
	if layout.FocusedPaneID == "" {
		return corruptStateErrorf(path, "focusedPaneId is required")
	}
	if len(layout.Columns) == 0 {
		return corruptStateErrorf(path, "columns are required")
	}
	if len(layout.Panes) == 0 {
		return corruptStateErrorf(path, "panes are required")
	}
	if layout.Columns == nil {
		return corruptStateErrorf(path, "columns must not be null")
	}
	if layout.Panes == nil {
		return corruptStateErrorf(path, "panes must not be null")
	}

	panesByID, err := validatePanes(layout.WorkspaceID, layout.Panes, path)
	if err != nil {
		return err
	}
	if _, ok := panesByID[layout.FocusedPaneID]; !ok {
		return corruptStateErrorf(path, "focusedPaneId %s does not reference a pane", layout.FocusedPaneID)
	}
	return validateColumns(layout.Columns, panesByID, path)
}

func validatePanes(layoutWorkspaceID string, panes []WorkspaceUIPane, path string) (map[string]WorkspaceUIPane, error) {
	panesByID := map[string]WorkspaceUIPane{}
	surfaceIDs := map[string]bool{}
	for index, pane := range panes {
		if err := validatePane(layoutWorkspaceID, pane, index, path); err != nil {
			return nil, err
		}
		if _, ok := panesByID[pane.PaneID]; ok {
			return nil, corruptStateErrorf(path, "duplicate paneId %s", pane.PaneID)
		}
		if surfaceIDs[pane.SurfaceID] {
			return nil, corruptStateErrorf(path, "duplicate surfaceId %s", pane.SurfaceID)
		}
		surfaceIDs[pane.SurfaceID] = true
		panesByID[pane.PaneID] = pane
	}
	return panesByID, nil
}

func validatePane(layoutWorkspaceID string, pane WorkspaceUIPane, index int, path string) error {
	if err := validatePaneRequiredFields(pane, index, path); err != nil {
		return err
	}
	if err := validatePaneValues(pane, index, path); err != nil {
		return err
	}
	if err := validatePaneTerminalConfig(pane, index, path); err != nil {
		return err
	}
	return validatePaneWorkflowNodeDetailsConfig(layoutWorkspaceID, pane, index, path)
}

func validatePaneRequiredFields(pane WorkspaceUIPane, index int, path string) error {
	if pane.ColumnID == "" {
		return corruptStateErrorf(path, "panes[%d].columnId is required", index)
	}
	if pane.PaneID == "" {
		return corruptStateErrorf(path, "panes[%d].paneId is required", index)
	}
	if pane.SurfaceID == "" {
		return corruptStateErrorf(path, "panes[%d].surfaceId is required", index)
	}
	if pane.Title == "" {
		return corruptStateErrorf(path, "panes[%d].title is required", index)
	}
	return nil
}

func validatePaneValues(pane WorkspaceUIPane, index int, path string) error {
	if !validSurfaceKind(pane.SurfaceKind) {
		return corruptStateErrorf(path, "panes[%d].surfaceKind is unsupported: %s", index, pane.SurfaceKind)
	}
	if !validPaneTone(pane.Tone) {
		return corruptStateErrorf(path, "panes[%d].tone is unsupported: %s", index, pane.Tone)
	}
	if pane.Weight <= 0 {
		return corruptStateErrorf(path, "panes[%d].weight must be positive", index)
	}
	if pane.Heat < 0 {
		return corruptStateErrorf(path, "panes[%d].heat must be non-negative", index)
	}
	if pane.Sequence < 0 {
		return corruptStateErrorf(path, "panes[%d].sequence must be non-negative", index)
	}
	return nil
}

func validatePaneTerminalConfig(pane WorkspaceUIPane, index int, path string) error {
	if pane.TerminalConfig == nil {
		return nil
	}
	if strings.TrimSpace(pane.TerminalConfig.ProfileID) != pane.TerminalConfig.ProfileID {
		return corruptStateErrorf(path, "panes[%d].terminalConfig.profileId must not have surrounding whitespace", index)
	}
	return nil
}

func validatePaneWorkflowNodeDetailsConfig(layoutWorkspaceID string, pane WorkspaceUIPane, index int, path string) error {
	config := pane.WorkflowNodeDetailsConfig
	if pane.SurfaceKind != SurfaceKindWorkflowNodeDetails {
		if config != nil {
			return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig is only valid for workflow-node-details panes", index)
		}
		return nil
	}
	if config == nil {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig is required", index)
	}
	if err := validateWorkflowNodeDetailsConfigRequiredFields(layoutWorkspaceID, config, index, path); err != nil {
		return err
	}
	if err := validateWorkflowNodeDetailsConfigValues(config, index, path); err != nil {
		return err
	}
	return nil
}

func validateWorkflowNodeDetailsConfigRequiredFields(layoutWorkspaceID string, config *WorkflowNodeDetailsPaneConfig, index int, path string) error {
	if err := validateWorkspaceID(config.WorkspaceID); err != nil {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.workspaceId is invalid: %v", index, err)
	}
	if config.WorkspaceID != layoutWorkspaceID {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.workspaceId %s does not match layout workspaceId %s", index, config.WorkspaceID, layoutWorkspaceID)
	}
	if err := validateWorkflowNodeDetailsConfigIdentityFields(config, index, path); err != nil {
		return err
	}
	return validateWorkflowNodeDetailsConfigProjectionFields(config, index, path)
}

func validateWorkflowNodeDetailsConfigIdentityFields(config *WorkflowNodeDetailsPaneConfig, index int, path string) error {
	if config.DefinitionID == "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.definitionId is required", index)
	}
	if config.DefinitionName == "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.definitionName is required", index)
	}
	if config.NodeID == "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeId is required", index)
	}
	if config.NodeLabel == "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeLabel is required", index)
	}
	return nil
}

func validateWorkflowNodeDetailsConfigProjectionFields(config *WorkflowNodeDetailsPaneConfig, index int, path string) error {
	if config.ProjectionIncomingEdges == nil {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.projectionIncomingEdges must not be null", index)
	}
	if config.ProjectionOutgoingEdges == nil {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.projectionOutgoingEdges must not be null", index)
	}
	return nil
}

func validateWorkflowNodeDetailsConfigValues(config *WorkflowNodeDetailsPaneConfig, index int, path string) error {
	if !validWorkflowNodeKind(config.NodeKind) {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeKind is unsupported: %s", index, config.NodeKind)
	}
	if !validWorkflowGraphNodeStatus(config.NodeStatus) {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeStatus is unsupported: %s", index, config.NodeStatus)
	}
	if !validWorkflowGraphViewMode(config.ViewMode) {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.viewMode is unsupported: %s", index, config.ViewMode)
	}
	if err := validateWorkflowNodeDetailsConfigRunFields(config, index, path); err != nil {
		return err
	}
	if config.ViewMode != orchestrator.GraphViewModeDraft && config.DefinitionVersionID == "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.definitionVersionId is required outside draft view", index)
	}
	if config.DefinitionVersionNumber < 0 {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.definitionVersionNumber must be non-negative", index)
	}
	return nil
}

func validateWorkflowNodeDetailsConfigRunFields(config *WorkflowNodeDetailsPaneConfig, index int, path string) error {
	if config.ViewMode == orchestrator.GraphViewModeRun {
		if config.ExecutionID == "" {
			return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.executionId is required for run view", index)
		}
		if config.NodeExecutionID == "" {
			return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeExecutionId is required for run view", index)
		}
		return nil
	}
	if config.ExecutionID != "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.executionId is only valid for run view", index)
	}
	if config.NodeExecutionID != "" {
		return corruptStateErrorf(path, "panes[%d].workflowNodeDetailsConfig.nodeExecutionId is only valid for run view", index)
	}
	return nil
}

func validateColumns(columns []WorkspaceUIColumn, panesByID map[string]WorkspaceUIPane, path string) error {
	columnIDs := map[string]bool{}
	ownedPaneIDs := map[string]bool{}
	for index, column := range columns {
		if err := validateColumn(column, index, path); err != nil {
			return err
		}
		if columnIDs[column.ColumnID] {
			return corruptStateErrorf(path, "duplicate columnId %s", column.ColumnID)
		}
		columnIDs[column.ColumnID] = true
		if err := validateColumnPaneReferences(column, index, panesByID, ownedPaneIDs, path); err != nil {
			return err
		}
	}
	return validateAllPanesOwned(panesByID, ownedPaneIDs, path)
}

func validateColumn(column WorkspaceUIColumn, index int, path string) error {
	if err := validateColumnIndexes(column, index, path); err != nil {
		return err
	}
	if err := validateColumnPaneList(column, index, path); err != nil {
		return err
	}
	return validateColumnWidths(column, index, path)
}

func validateColumnIndexes(column WorkspaceUIColumn, index int, path string) error {
	if column.ColumnID == "" {
		return corruptStateErrorf(path, "columns[%d].columnId is required", index)
	}
	if column.Index < 0 {
		return corruptStateErrorf(path, "columns[%d].index must be non-negative", index)
	}
	if column.PlaneIndex < 0 {
		return corruptStateErrorf(path, "columns[%d].planeIndex must be non-negative", index)
	}
	if column.SlotIndex < 0 {
		return corruptStateErrorf(path, "columns[%d].slotIndex must be non-negative", index)
	}
	return nil
}

func validateColumnPaneList(column WorkspaceUIColumn, index int, path string) error {
	if len(column.PaneIDs) == 0 {
		return corruptStateErrorf(path, "columns[%d].paneIds are required", index)
	}
	if column.PaneIDs == nil {
		return corruptStateErrorf(path, "columns[%d].paneIds must not be null", index)
	}
	return nil
}

func validateColumnWidths(column WorkspaceUIColumn, index int, path string) error {
	if err := validateColumnWidthSpec(column.IdealWidthSpec, path, fmt.Sprintf("columns[%d].idealWidthSpec", index)); err != nil {
		return err
	}
	if err := validateColumnWidthSpec(column.WidthSpec, path, fmt.Sprintf("columns[%d].widthSpec", index)); err != nil {
		return err
	}
	if column.PreviousProportionWidth != nil && *column.PreviousProportionWidth <= 0 {
		return corruptStateErrorf(path, "columns[%d].previousProportionWidth must be positive", index)
	}
	return nil
}

func validateColumnPaneReferences(column WorkspaceUIColumn, index int, panesByID map[string]WorkspaceUIPane, ownedPaneIDs map[string]bool, path string) error {
	for _, paneID := range column.PaneIDs {
		pane, ok := panesByID[paneID]
		if !ok {
			return corruptStateErrorf(path, "columns[%d].paneIds references missing pane %s", index, paneID)
		}
		if ownedPaneIDs[paneID] {
			return corruptStateErrorf(path, "pane %s appears in multiple columns", paneID)
		}
		if pane.ColumnID != column.ColumnID {
			return corruptStateErrorf(path, "pane %s columnId %s does not match owning column %s", paneID, pane.ColumnID, column.ColumnID)
		}
		ownedPaneIDs[paneID] = true
	}
	return nil
}

func validateAllPanesOwned(panesByID map[string]WorkspaceUIPane, ownedPaneIDs map[string]bool, path string) error {
	for paneID := range panesByID {
		if !ownedPaneIDs[paneID] {
			return corruptStateErrorf(path, "pane %s is not referenced by any column", paneID)
		}
	}
	return nil
}

func validateColumnWidthSpec(spec ColumnWidthSpec, path string, label string) error {
	if !validColumnWidthUnit(spec.Unit) {
		return corruptStateErrorf(path, "%s.unit is unsupported: %s", label, spec.Unit)
	}
	if spec.Value <= 0 {
		return corruptStateErrorf(path, "%s.value must be positive", label)
	}
	return nil
}

func validateWorkspaceID(workspaceID string) error {
	if err := validateWorkspaceIDShape(workspaceID); err != nil {
		return err
	}
	for _, value := range workspaceID {
		if !validWorkspaceIDRune(value) {
			return fmt.Errorf("workspace id contains unsupported character %q", value)
		}
	}
	return nil
}

func validateWorkspaceIDShape(workspaceID string) error {
	if workspaceID == "" {
		return errors.New("workspace id is required")
	}
	if workspaceID == "." || workspaceID == ".." {
		return fmt.Errorf("workspace id is not a valid path segment: %s", workspaceID)
	}
	if !strings.HasPrefix(workspaceID, "workspace_") {
		return fmt.Errorf("workspace id must start with workspace_: %s", workspaceID)
	}
	return nil
}

func validWorkspaceIDRune(value rune) bool {
	if value == '_' || value == '-' {
		return true
	}
	if unicode.IsDigit(value) {
		return true
	}
	if value >= 'a' && value <= 'z' {
		return true
	}
	return value >= 'A' && value <= 'Z'
}

func validColumnWidthUnit(unit ColumnWidthUnit) bool {
	switch unit {
	case ColumnWidthUnitProportion, ColumnWidthUnitPX:
		return true
	default:
		return false
	}
}

func validSurfaceKind(kind SurfaceKind) bool {
	switch kind {
	case SurfaceKindChatDOM,
		SurfaceKindEasyButton,
		SurfaceKindEmptyFrame,
		SurfaceKindWorkflowGraph,
		SurfaceKindSettingsDOM,
		SurfaceKindTerminal,
		SurfaceKindSemanticNodeDetails,
		SurfaceKindWorkflowNodeDetails,
		SurfaceKindWorkflowSettings:
		return true
	default:
		return false
	}
}

func validPaneTone(tone PaneTone) bool {
	switch tone {
	case PaneToneCyan, PaneToneGreen, PaneToneOrange, PaneTonePink, PaneToneSlate:
		return true
	default:
		return false
	}
}

func validWorkflowNodeKind(kind orchestrator.WorkflowNodeKind) bool {
	switch kind {
	case orchestrator.NodeKindStart,
		orchestrator.NodeKindEnd,
		orchestrator.NodeKindAction,
		orchestrator.NodeKindGatewayAND,
		orchestrator.NodeKindGatewayOR,
		orchestrator.NodeKindGatewayXOR,
		orchestrator.NodeKindLoopGuard:
		return true
	default:
		return false
	}
}

func validWorkflowGraphNodeStatus(status orchestrator.WorkflowGraphNodeStatus) bool {
	switch status {
	case orchestrator.GraphNodeStatusNotStarted,
		orchestrator.GraphNodeStatusPending,
		orchestrator.GraphNodeStatusReady,
		orchestrator.GraphNodeStatusRunning,
		orchestrator.GraphNodeStatusSucceeded,
		orchestrator.GraphNodeStatusFailed,
		orchestrator.GraphNodeStatusCancelled,
		orchestrator.GraphNodeStatusWaitingApproval,
		orchestrator.GraphNodeStatusRecoveryRequired:
		return true
	default:
		return false
	}
}

func validWorkflowGraphViewMode(mode orchestrator.WorkflowGraphViewMode) bool {
	switch mode {
	case orchestrator.GraphViewModeDraft, orchestrator.GraphViewModeVersion, orchestrator.GraphViewModeRun:
		return true
	default:
		return false
	}
}

func corruptStateError(path string, err error) error {
	return &CorruptStateError{Path: path, Err: err}
}

func corruptStateErrorf(path string, format string, args ...any) error {
	return corruptStateError(path, fmt.Errorf(format, args...))
}
