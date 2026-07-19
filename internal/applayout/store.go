package applayout

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/jsonio"
)

const (
	stateDirectoryName = "app-pane-layout"
	stateFileName      = "layout.json"
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
	return fmt.Sprintf("malformed app pane layout state %s: %v", err.Path, err.Err)
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

func StateFilePath(appDataDir string) string {
	return filepath.Join(appDataDir, stateDirectoryName, stateFileName)
}

func (store *Store) LoadLayout() (AppPaneLayoutReadResult, error) {
	path := StateFilePath(store.appDataDir)
	file, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return AppPaneLayoutReadResult{Layout: nil}, nil
		}
		return AppPaneLayoutReadResult{}, &PersistenceError{Operation: "read app pane layout state", Path: path, Err: err}
	}
	defer file.Close()

	var layout AppPaneLayout
	if err := jsonio.DecodeSingle(file, &layout); err != nil {
		return AppPaneLayoutReadResult{}, corruptStateError(path, err)
	}
	layout = normalizeLayout(layout)
	if err := validateLayout(layout, path); err != nil {
		return AppPaneLayoutReadResult{}, err
	}
	return AppPaneLayoutReadResult{Layout: &layout}, nil
}

func (store *Store) SaveLayout(layout AppPaneLayout) (AppPaneLayout, error) {
	path := StateFilePath(store.appDataDir)
	layout = normalizeLayout(layout)
	if err := validateLayout(layout, path); err != nil {
		return AppPaneLayout{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return AppPaneLayout{}, &PersistenceError{Operation: "create app pane layout state directory", Path: filepath.Dir(path), Err: err}
	}

	file, err := os.CreateTemp(filepath.Dir(path), ".layout-*.tmp")
	if err != nil {
		return AppPaneLayout{}, &PersistenceError{Operation: "create app pane layout state temp file", Path: filepath.Dir(path), Err: err}
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
		return AppPaneLayout{}, &PersistenceError{Operation: "write app pane layout state temp file", Path: tempPath, Err: err}
	}
	if err := file.Close(); err != nil {
		return AppPaneLayout{}, &PersistenceError{Operation: "close app pane layout state temp file", Path: tempPath, Err: err}
	}
	if err := os.Rename(tempPath, path); err != nil {
		return AppPaneLayout{}, &PersistenceError{Operation: "replace app pane layout state", Path: path, Err: err}
	}
	removeTemp = false
	return layout, nil
}

func normalizeLayout(layout AppPaneLayout) AppPaneLayout {
	for index := range layout.Panes {
		config := layout.Panes[index].ConversationConfig
		if config != nil && config.ResourceBindings == nil {
			config.ResourceBindings = []ConversationPaneResourceBinding{}
		}
	}
	return layout
}

func validateLayout(layout AppPaneLayout, path string) error {
	if err := validateLayoutRequiredFields(layout, path); err != nil {
		return err
	}

	panesByID, err := validatePanes(layout.Panes, path)
	if err != nil {
		return err
	}
	if _, ok := panesByID[layout.FocusedPaneID]; !ok {
		return corruptStateErrorf(path, "focusedPaneId %s does not reference a pane", layout.FocusedPaneID)
	}
	if err := validateMaximizedPaneID(layout.MaximizedPaneID, panesByID, path); err != nil {
		return err
	}
	return validateColumns(layout.Columns, panesByID, path)
}

func validateLayoutRequiredFields(layout AppPaneLayout, path string) error {
	if layout.SchemaVersion != SchemaVersion {
		return corruptStateErrorf(path, "unsupported schemaVersion %d", layout.SchemaVersion)
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
	return nil
}

func validateMaximizedPaneID(maximizedPaneID *string, panesByID map[string]AppPane, path string) error {
	if maximizedPaneID == nil {
		return nil
	}
	if *maximizedPaneID == "" {
		return corruptStateErrorf(path, "maximizedPaneId must be null or reference a pane")
	}
	if _, ok := panesByID[*maximizedPaneID]; !ok {
		return corruptStateErrorf(path, "maximizedPaneId %s does not reference a pane", *maximizedPaneID)
	}
	return nil
}

func validatePanes(panes []AppPane, path string) (map[string]AppPane, error) {
	panesByID := map[string]AppPane{}
	surfaceIDs := map[string]bool{}
	conversationPaneIDs := map[string]string{}
	masterPaneCount := 0
	for index, pane := range panes {
		if err := validatePane(pane, index, path); err != nil {
			return nil, err
		}
		if _, ok := panesByID[pane.PaneID]; ok {
			return nil, corruptStateErrorf(path, "duplicate paneId %s", pane.PaneID)
		}
		if surfaceIDs[pane.SurfaceID] {
			return nil, corruptStateErrorf(path, "duplicate surfaceId %s", pane.SurfaceID)
		}
		surfaceIDs[pane.SurfaceID] = true
		switch pane.SurfaceKind {
		case AppPaneSurfaceKindMaster:
			masterPaneCount++
		case AppPaneSurfaceKindConversation:
			conversationID := pane.ConversationConfig.ConversationID
			if existingPaneID, ok := conversationPaneIDs[conversationID]; ok {
				return nil, corruptStateErrorf(
					path,
					"conversation %s is bound to multiple app conversation panes: %s and %s",
					conversationID,
					existingPaneID,
					pane.PaneID,
				)
			}
			conversationPaneIDs[conversationID] = pane.PaneID
		}
		panesByID[pane.PaneID] = pane
	}
	if masterPaneCount != 1 {
		return nil, corruptStateErrorf(path, "layout must contain exactly one master pane, got %d", masterPaneCount)
	}
	return panesByID, nil
}

func validatePane(pane AppPane, index int, path string) error {
	if err := validatePaneRequiredFields(pane, index, path); err != nil {
		return err
	}
	if err := validatePaneValues(pane, index, path); err != nil {
		return err
	}
	return validatePaneConfigs(pane, index, path)
}

func validatePaneRequiredFields(pane AppPane, index int, path string) error {
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

func validatePaneValues(pane AppPane, index int, path string) error {
	if !validAppPaneSurfaceKind(pane.SurfaceKind) {
		return corruptStateErrorf(path, "panes[%d].surfaceKind is unsupported: %s", index, pane.SurfaceKind)
	}
	if !validAppPaneTone(pane.Tone) {
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

func validatePaneConfigs(pane AppPane, index int, path string) error {
	if pane.SurfaceKind == AppPaneSurfaceKindMaster && pane.MasterConfig == nil {
		return corruptStateErrorf(path, "panes[%d].masterConfig is required for master panes", index)
	}
	if pane.SurfaceKind != AppPaneSurfaceKindMaster && pane.MasterConfig != nil {
		return corruptStateErrorf(path, "panes[%d].masterConfig is only valid for master panes", index)
	}
	if pane.SurfaceKind == AppPaneSurfaceKindConversation && pane.ConversationConfig == nil {
		return corruptStateErrorf(path, "panes[%d].conversationConfig is required for conversation panes", index)
	}
	if pane.SurfaceKind != AppPaneSurfaceKindConversation && pane.ConversationConfig != nil {
		return corruptStateErrorf(path, "panes[%d].conversationConfig is only valid for conversation panes", index)
	}
	if pane.ConversationConfig != nil {
		return validateConversationPaneConfig(*pane.ConversationConfig, index, path)
	}
	return nil
}

func validateConversationPaneConfig(config ConversationPaneConfig, paneIndex int, path string) error {
	if config.ConversationID == "" {
		return corruptStateErrorf(path, "panes[%d].conversationConfig.conversationId is required", paneIndex)
	}
	if strings.TrimSpace(config.ConversationID) != config.ConversationID {
		return corruptStateErrorf(path, "panes[%d].conversationConfig.conversationId must not have surrounding whitespace", paneIndex)
	}
	if config.PresentationIdentity.Title == "" {
		return corruptStateErrorf(path, "panes[%d].conversationConfig.presentationIdentity.title is required", paneIndex)
	}
	if !validAppPaneTone(config.PresentationIdentity.Tone) {
		return corruptStateErrorf(path, "panes[%d].conversationConfig.presentationIdentity.tone is unsupported: %s", paneIndex, config.PresentationIdentity.Tone)
	}
	for index, binding := range config.ResourceBindings {
		if err := validateResourceBinding(binding, paneIndex, index, path); err != nil {
			return err
		}
	}
	return nil
}

func validateResourceBinding(binding ConversationPaneResourceBinding, paneIndex int, bindingIndex int, path string) error {
	label := fmt.Sprintf("panes[%d].conversationConfig.resourceBindings[%d]", paneIndex, bindingIndex)
	switch binding.Kind {
	case ConversationPaneResourceBindingKindFolder:
		if binding.Folder == nil {
			return corruptStateErrorf(path, "%s.folder is required for folder bindings", label)
		}
		if binding.Folder.RootPath == "" {
			return corruptStateErrorf(path, "%s.folder.rootPath is required", label)
		}
		if strings.TrimSpace(binding.Folder.RootPath) != binding.Folder.RootPath {
			return corruptStateErrorf(path, "%s.folder.rootPath must not have surrounding whitespace", label)
		}
		if !filepath.IsAbs(binding.Folder.RootPath) {
			return corruptStateErrorf(path, "%s.folder.rootPath must be absolute: %s", label, binding.Folder.RootPath)
		}
		return nil
	default:
		return corruptStateErrorf(path, "%s.kind is unsupported: %s", label, binding.Kind)
	}
}

func validateColumns(columns []AppPaneColumn, panesByID map[string]AppPane, path string) error {
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

func validateColumn(column AppPaneColumn, index int, path string) error {
	if err := validateColumnIndexes(column, index, path); err != nil {
		return err
	}
	if err := validateColumnPaneList(column, index, path); err != nil {
		return err
	}
	return validateColumnWidths(column, index, path)
}

func validateColumnIndexes(column AppPaneColumn, index int, path string) error {
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

func validateColumnPaneList(column AppPaneColumn, index int, path string) error {
	if len(column.PaneIDs) == 0 {
		return corruptStateErrorf(path, "columns[%d].paneIds are required", index)
	}
	if column.PaneIDs == nil {
		return corruptStateErrorf(path, "columns[%d].paneIds must not be null", index)
	}
	return nil
}

func validateColumnWidths(column AppPaneColumn, index int, path string) error {
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

func validateColumnPaneReferences(column AppPaneColumn, index int, panesByID map[string]AppPane, ownedPaneIDs map[string]bool, path string) error {
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

func validateAllPanesOwned(panesByID map[string]AppPane, ownedPaneIDs map[string]bool, path string) error {
	for paneID := range panesByID {
		if !ownedPaneIDs[paneID] {
			return corruptStateErrorf(path, "pane %s is not referenced by any column", paneID)
		}
	}
	return nil
}

func validateColumnWidthSpec(spec AppPaneColumnWidthSpec, path string, label string) error {
	if !validAppPaneColumnWidthUnit(spec.Unit) {
		return corruptStateErrorf(path, "%s.unit is unsupported: %s", label, spec.Unit)
	}
	if spec.Value <= 0 {
		return corruptStateErrorf(path, "%s.value must be positive", label)
	}
	return nil
}

func validAppPaneColumnWidthUnit(unit AppPaneColumnWidthUnit) bool {
	switch unit {
	case AppPaneColumnWidthUnitProportion, AppPaneColumnWidthUnitPX:
		return true
	default:
		return false
	}
}

func validAppPaneSurfaceKind(kind AppPaneSurfaceKind) bool {
	switch kind {
	case AppPaneSurfaceKindMaster, AppPaneSurfaceKindConversation, AppPaneSurfaceKindBrowser, AppPaneSurfaceKindEmptyFrame:
		return true
	default:
		return false
	}
}

func validAppPaneTone(tone AppPaneTone) bool {
	switch tone {
	case AppPaneToneCyan, AppPaneToneGreen, AppPaneToneOrange, AppPaneTonePink, AppPaneToneSlate:
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
