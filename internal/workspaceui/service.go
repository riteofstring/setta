package workspaceui

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"setta/internal/workspace"
)

type WorkspaceResolver interface {
	ResolveWorkspace(id string) (workspace.WorkspaceSummary, error)
}

type Service struct {
	events   *EventHub
	resolver WorkspaceResolver
	store    *Store
}

type Option func(*serviceOptions)

type serviceOptions struct {
	bufferSize int
	events     *EventHub
	newID      func(prefix string) (string, error)
	now        func() time.Time
}

func NewService(store *Store, resolver WorkspaceResolver, options ...Option) (*Service, error) {
	if store == nil {
		return nil, errors.New("workspace UI store is required")
	}
	if resolver == nil {
		return nil, errors.New("workspace resolver is required")
	}
	config := serviceOptions{
		bufferSize: defaultEventBufferSize,
		newID:      randomID,
		now:        time.Now,
	}
	for _, option := range options {
		option(&config)
	}
	events := config.events
	if events == nil {
		if config.newID == nil {
			return nil, errors.New("workspace UI id generator is required")
		}
		if config.now == nil {
			return nil, errors.New("workspace UI clock is required")
		}
		streamID, err := config.newID("workspace_ui_stream")
		if err != nil {
			return nil, fmt.Errorf("create workspace UI stream id: %w", err)
		}
		events, err = NewEventHub(streamID, WithEventClock(config.now), WithEventBufferSize(config.bufferSize))
		if err != nil {
			return nil, err
		}
	}
	return &Service{
		events:   events,
		resolver: resolver,
		store:    store,
	}, nil
}

func WithEventHub(events *EventHub) Option {
	return func(options *serviceOptions) {
		options.events = events
	}
}

func WithIDGenerator(newID func(prefix string) (string, error)) Option {
	return func(options *serviceOptions) {
		options.newID = newID
	}
}

func WithClock(now func() time.Time) Option {
	return func(options *serviceOptions) {
		options.now = now
	}
}

func WithWorkspaceUIEventBufferSize(size int) Option {
	return func(options *serviceOptions) {
		options.bufferSize = size
	}
}

func (service *Service) Schema() WorkspaceUISchema {
	return Schema()
}

func (service *Service) ListPanes(workspaceID string) (WorkspaceUIPaneListResult, error) {
	read, err := service.ReadLayout(workspaceID)
	if err != nil {
		return WorkspaceUIPaneListResult{}, err
	}
	result := WorkspaceUIPaneListResult{
		WorkspaceID:   workspaceID,
		LayoutPresent: read.Layout != nil,
		Panes:         []WorkspaceUIPaneDescriptor{},
		Schema:        service.Schema(),
	}
	if read.Layout == nil {
		return result, nil
	}
	result.Panes, err = paneDescriptors(*read.Layout)
	if err != nil {
		return WorkspaceUIPaneListResult{}, err
	}
	return result, nil
}

func (service *Service) ReadPane(workspaceID string, paneID string) (WorkspaceUIPaneReadResult, error) {
	if paneID == "" {
		return WorkspaceUIPaneReadResult{}, errors.New("pane id is required")
	}
	list, err := service.ListPanes(workspaceID)
	if err != nil {
		return WorkspaceUIPaneReadResult{}, err
	}
	for _, pane := range list.Panes {
		if pane.PaneID == paneID {
			return WorkspaceUIPaneReadResult{
				WorkspaceID: workspaceID,
				Pane:        pane,
				Schema:      service.Schema(),
			}, nil
		}
	}
	return WorkspaceUIPaneReadResult{}, fmt.Errorf("workspace pane not found: %s", paneID)
}

func (service *Service) ReadLayout(workspaceID string) (WorkspaceUILayoutReadResult, error) {
	if _, err := service.resolver.ResolveWorkspace(workspaceID); err != nil {
		return WorkspaceUILayoutReadResult{}, err
	}
	return service.store.LoadLayout(workspaceID)
}

func (service *Service) SaveLayout(layout WorkspaceUILayout) (WorkspaceUILayout, error) {
	if _, err := service.resolver.ResolveWorkspace(layout.WorkspaceID); err != nil {
		return WorkspaceUILayout{}, err
	}
	saved, err := service.store.SaveLayout(layout)
	if err != nil {
		return WorkspaceUILayout{}, err
	}
	if _, err := service.events.PublishLayout(saved); err != nil {
		return WorkspaceUILayout{}, err
	}
	return saved, nil
}

func (service *Service) SubscribeEvents(cursor EventCursor, workspaceID string) (*EventSubscription, error) {
	if workspaceID == "" {
		return nil, errors.New("workspace id is required")
	}
	if _, err := service.resolver.ResolveWorkspace(workspaceID); err != nil {
		return nil, err
	}
	read, err := service.store.LoadLayout(workspaceID)
	if err != nil {
		return nil, err
	}
	if read.Layout != nil {
		if err := service.events.recordWorkspaceRevision(workspaceID, read.Layout.Revision); err != nil {
			return nil, err
		}
	}
	return service.events.Subscribe(cursor, workspaceID)
}

func (service *Service) CloseEvents() {
	if service == nil || service.events == nil {
		return
	}
	service.events.Close()
}

func randomID(prefix string) (string, error) {
	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return "", err
	}
	return prefix + "_" + hex.EncodeToString(bytes[:]), nil
}

func paneDescriptors(layout WorkspaceUILayout) ([]WorkspaceUIPaneDescriptor, error) {
	panesByID := map[string]WorkspaceUIPane{}
	for _, pane := range layout.Panes {
		panesByID[pane.PaneID] = pane
	}
	descriptors := make([]WorkspaceUIPaneDescriptor, 0, len(layout.Panes))
	for _, column := range layout.Columns {
		for paneIndex, paneID := range column.PaneIDs {
			pane, ok := panesByID[paneID]
			if !ok {
				return nil, fmt.Errorf("column %s references missing pane %s", column.ColumnID, paneID)
			}
			descriptors = append(descriptors, paneDescriptor(layout, column, pane, paneIndex))
		}
	}
	return descriptors, nil
}

func paneDescriptor(layout WorkspaceUILayout, column WorkspaceUIColumn, pane WorkspaceUIPane, paneIndex int) WorkspaceUIPaneDescriptor {
	canClosePane := len(layout.Panes) > 1
	return WorkspaceUIPaneDescriptor{
		PaneID:      pane.PaneID,
		SurfaceID:   pane.SurfaceID,
		SurfaceKind: pane.SurfaceKind,
		Title:       pane.Title,
		Subtitle:    pane.Subtitle,
		Focused:     pane.PaneID == layout.FocusedPaneID,
		Location: WorkspaceUIPaneLocation{
			ColumnID:       column.ColumnID,
			ColumnIndex:    column.Index,
			IdealWidthSpec: column.IdealWidthSpec,
			PaneIndex:      paneIndex,
			PaneCount:      len(column.PaneIDs),
			PlaneIndex:     column.PlaneIndex,
			Sequence:       pane.Sequence,
			SlotIndex:      column.SlotIndex,
			Weight:         pane.Weight,
			WidthSpec:      column.WidthSpec,
		},
		RuntimeState: WorkspaceUIPaneRuntimeState{
			Status: WorkspaceUIPaneRuntimeStatusLayoutOnly,
		},
		CanFocus:          true,
		CanMove:           true,
		CanClosePane:      canClosePane,
		SurfaceCloseModes: surfaceCloseModesForPane(canClosePane),
		ReadModes:         readModesForPane(pane),
		WriteModes:        writeModesForPane(pane),
		ContentRefs:       contentRefsForPane(pane),
	}
}

func readModesForPane(pane WorkspaceUIPane) []WorkspaceUIPaneReadMode {
	readModes := []WorkspaceUIPaneReadMode{WorkspaceUIPaneReadModeMetadata}
	if pane.SurfaceKind == SurfaceKindChatDOM && pane.ChatConfig != nil {
		readModes = append(readModes, WorkspaceUIPaneReadModeChatState)
	}
	if pane.SurfaceKind == SurfaceKindTerminal && pane.TerminalConfig != nil {
		readModes = append(readModes, WorkspaceUIPaneReadModeTerminalRecentOutput)
		readModes = append(readModes, WorkspaceUIPaneReadModeTerminalScreen)
	}
	return readModes
}

func writeModesForPane(pane WorkspaceUIPane) []WorkspaceUIPaneWriteMode {
	if pane.SurfaceKind == SurfaceKindChatDOM && pane.ChatConfig != nil {
		return []WorkspaceUIPaneWriteMode{WorkspaceUIPaneWriteModeChatSend, WorkspaceUIPaneWriteModeChatQueue}
	}
	if pane.SurfaceKind == SurfaceKindTerminal && pane.TerminalConfig != nil {
		return []WorkspaceUIPaneWriteMode{WorkspaceUIPaneWriteModeTerminalInput}
	}
	return []WorkspaceUIPaneWriteMode{}
}

func surfaceCloseModesForPane(canClosePane bool) []WorkspaceUISurfaceCloseMode {
	if !canClosePane {
		return []WorkspaceUISurfaceCloseMode{}
	}
	return []WorkspaceUISurfaceCloseMode{WorkspaceUISurfaceCloseModeNone}
}

func contentRefsForPane(pane WorkspaceUIPane) WorkspaceUIPaneContentRefs {
	return WorkspaceUIPaneContentRefs{
		Chat:                chatContentRefForPane(pane),
		SemanticNodeDetails: nil,
		Terminal:            terminalContentRefForPane(pane),
		WorkflowGraph:       nil,
		WorkflowNodeDetails: workflowNodeDetailsContentRefForPane(pane),
	}
}

func chatContentRefForPane(pane WorkspaceUIPane) *WorkspaceUIChatPaneContentRef {
	if pane.SurfaceKind != SurfaceKindChatDOM || pane.ChatConfig == nil {
		return nil
	}
	return &WorkspaceUIChatPaneContentRef{
		ConversationID: pane.ChatConfig.ConversationID,
	}
}

func terminalContentRefForPane(pane WorkspaceUIPane) *WorkspaceUITerminalPaneContentRef {
	if pane.SurfaceKind != SurfaceKindTerminal || pane.TerminalConfig == nil {
		return nil
	}
	return &WorkspaceUITerminalPaneContentRef{
		CWDOverride:   pane.TerminalConfig.CWDOverride,
		ProfileID:     pane.TerminalConfig.ProfileID,
		SessionID:     "",
		TitleOverride: pane.TerminalConfig.TitleOverride,
	}
}

func workflowNodeDetailsContentRefForPane(pane WorkspaceUIPane) *WorkspaceUIWorkflowNodeDetailsPaneContentRef {
	if pane.SurfaceKind != SurfaceKindWorkflowNodeDetails || pane.WorkflowNodeDetailsConfig == nil {
		return nil
	}
	config := pane.WorkflowNodeDetailsConfig
	return &WorkspaceUIWorkflowNodeDetailsPaneContentRef{
		DefinitionID:            config.DefinitionID,
		DefinitionVersionID:     config.DefinitionVersionID,
		DefinitionVersionNumber: config.DefinitionVersionNumber,
		ExecutionID:             config.ExecutionID,
		NodeID:                  config.NodeID,
		NodeExecutionID:         config.NodeExecutionID,
		NodeKind:                config.NodeKind,
		NodeStatus:              config.NodeStatus,
		ViewMode:                config.ViewMode,
	}
}
