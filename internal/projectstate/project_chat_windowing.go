package projectstate

import (
	"fmt"
	"slices"
	"strings"
)

type ChatWindowPlacement string

const (
	ChatWindowPlacementBottomDocked  ChatWindowPlacement = "bottom_docked"
	ChatWindowPlacementFloating      ChatWindowPlacement = "floating"
	ChatWindowPlacementMaximized     ChatWindowPlacement = "maximized"
	ChatWindowPlacementCanvasSection ChatWindowPlacement = "canvas_section"
)

type ChatWindowMode string

const (
	ChatWindowModeProjectAI ChatWindowMode = "project_ai_mode"
	ChatWindowModeSection   ChatWindowMode = "section_mode"
	ChatWindowModeGitGraph  ChatWindowMode = "git_graph_mode"
)

type ChatWindowBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type ChatWindowDockMetrics struct {
	WidthFraction    *float64 `json:"widthFraction,omitempty"`
	PreferredWidthPx *float64 `json:"preferredWidthPx,omitempty"`
}

type ProjectChatWindowInstance struct {
	InstanceID                  string                `json:"instanceId"`
	Placement                   ChatWindowPlacement   `json:"placement,omitempty"`
	IsMinimized                 bool                  `json:"isMinimized,omitempty"`
	IsClosed                    bool                  `json:"isClosed,omitempty"`
	IsMaximized                 bool                  `json:"isMaximized,omitempty"`
	Bounds                      ChatWindowBounds      `json:"bounds,omitempty"`
	DockMetrics                 ChatWindowDockMetrics `json:"dockMetrics,omitempty"`
	ZIndex                      int                   `json:"zIndex,omitempty"`
	LastPlacementBeforeMaximize *ChatWindowPlacement  `json:"lastPlacementBeforeMaximize,omitempty"`
	Mode                        ChatWindowMode        `json:"mode,omitempty"`
	SectionIDOrNull             *string               `json:"sectionIdOrNull,omitempty"`
	Title                       *string               `json:"title,omitempty"`
	LastFocusedAt               int                   `json:"lastFocusedAt,omitempty"`
	ChatID                      *string               `json:"chatId,omitempty"`
}

type ProjectChatWindowingState struct {
	InstancesByID      map[string]ProjectChatWindowInstance `json:"instancesById"`
	Order              []string                             `json:"order"`
	NextInstanceNumber int                                  `json:"nextInstanceNumber"`
}

type WindowSpaceSurfaceKind string

const (
	WindowSpaceSurfaceKindProjectChat WindowSpaceSurfaceKind = "project_chat"
	WindowSpaceSurfaceKindSection     WindowSpaceSurfaceKind = "section"
)

type NormalizedFloatingWindowBounds struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type WindowSpaceWindow struct {
	SurfaceKind            WindowSpaceSurfaceKind         `json:"surfaceKind,omitempty"`
	SectionIDOrNull        *string                        `json:"sectionIdOrNull,omitempty"`
	Mode                   ChatWindowMode                 `json:"mode,omitempty"`
	Title                  *string                        `json:"title,omitempty"`
	ChatID                 *string                        `json:"chatId,omitempty"`
	EmbeddedGitPaneVisible bool                           `json:"embeddedGitPaneVisible,omitempty"`
	ZIndex                 int                            `json:"zIndex,omitempty"`
	NormalizedBounds       NormalizedFloatingWindowBounds `json:"normalizedBounds,omitempty"`
}

type WindowSpaceState struct {
	WindowsByID map[string]WindowSpaceWindow `json:"windowsById"`
	Order       []string                     `json:"order"`
}

type WindowSpaceConfig struct {
	WindowsByID map[string]WindowSpaceWindow `json:"windowsById"`
	Order       []string                     `json:"order"`
	ID          string                       `json:"id,omitempty"`
	Name        string                       `json:"name,omitempty"`
	SortIndex   int                          `json:"sortIndex,omitempty"`
}

func DefaultChatWindowBounds() ChatWindowBounds {
	return ChatWindowBounds{
		X:      120,
		Y:      120,
		Width:  820,
		Height: 520,
	}
}

func DefaultNormalizedFloatingWindowBounds() NormalizedFloatingWindowBounds {
	return NormalizedFloatingWindowBounds{
		X:      0,
		Y:      0,
		Width:  1,
		Height: 1,
	}
}

func DefaultProjectChatWindowingState() ProjectChatWindowingState {
	return ProjectChatWindowingState{
		InstancesByID:      map[string]ProjectChatWindowInstance{},
		Order:              []string{},
		NextInstanceNumber: 1,
	}
}

func (b ChatWindowBounds) Clone() ChatWindowBounds {
	return b
}

func (m ChatWindowDockMetrics) Clone() ChatWindowDockMetrics {
	cloned := m
	cloned.WidthFraction = cloneOptionalFloat64(m.WidthFraction)
	cloned.PreferredWidthPx = cloneOptionalFloat64(m.PreferredWidthPx)
	return cloned
}

func (i ProjectChatWindowInstance) Clone() ProjectChatWindowInstance {
	cloned := i
	cloned.Bounds = i.Bounds.Clone()
	cloned.DockMetrics = i.DockMetrics.Clone()
	cloned.LastPlacementBeforeMaximize = cloneOptionalChatWindowPlacement(
		i.LastPlacementBeforeMaximize,
	)
	cloned.SectionIDOrNull = cloneOptionalString(i.SectionIDOrNull)
	cloned.Title = cloneOptionalString(i.Title)
	cloned.ChatID = cloneOptionalString(i.ChatID)
	return cloned
}

func (s ProjectChatWindowingState) Clone() ProjectChatWindowingState {
	cloned := DefaultProjectChatWindowingState()
	cloned.NextInstanceNumber = s.NextInstanceNumber
	if s.InstancesByID == nil {
		cloned.InstancesByID = map[string]ProjectChatWindowInstance{}
	} else {
		cloned.InstancesByID = make(map[string]ProjectChatWindowInstance, len(s.InstancesByID))
		for instanceID, instance := range s.InstancesByID {
			cloned.InstancesByID[instanceID] = instance.Clone()
		}
	}
	cloned.Order = append([]string{}, s.Order...)
	return cloned
}

func (b NormalizedFloatingWindowBounds) Clone() NormalizedFloatingWindowBounds {
	return b
}

func (w WindowSpaceWindow) Clone() WindowSpaceWindow {
	cloned := w
	cloned.SectionIDOrNull = cloneOptionalString(w.SectionIDOrNull)
	cloned.Title = cloneOptionalString(w.Title)
	cloned.ChatID = cloneOptionalString(w.ChatID)
	cloned.NormalizedBounds = w.NormalizedBounds.Clone()
	return cloned
}

func (s WindowSpaceState) Clone() WindowSpaceState {
	cloned := WindowSpaceState{
		WindowsByID: map[string]WindowSpaceWindow{},
		Order:       append([]string(nil), s.Order...),
	}
	if s.WindowsByID == nil {
		return cloned
	}
	cloned.WindowsByID = make(map[string]WindowSpaceWindow, len(s.WindowsByID))
	for instanceID, window := range s.WindowsByID {
		cloned.WindowsByID[instanceID] = window.Clone()
	}
	return cloned
}

func (c WindowSpaceConfig) Clone() WindowSpaceConfig {
	clonedState := WindowSpaceState{
		WindowsByID: c.WindowsByID,
		Order:       c.Order,
	}.Clone()
	return WindowSpaceConfig{
		WindowsByID: clonedState.WindowsByID,
		Order:       clonedState.Order,
		ID:          c.ID,
		Name:        c.Name,
		SortIndex:   c.SortIndex,
	}
}

func normalizeProjectChatWindowingState(
	state ProjectChatWindowingState,
	sections map[string]Section,
) (ProjectChatWindowingState, error) {
	normalized := DefaultProjectChatWindowingState()
	if state.NextInstanceNumber > 0 {
		normalized.NextInstanceNumber = state.NextInstanceNumber
	}
	winningInstanceIDBySectionID := map[string]string{}

	for instanceID, instance := range state.InstancesByID {
		trimmedInstanceID := strings.TrimSpace(instanceID)
		if trimmedInstanceID == "" {
			continue
		}
		nextInstance := instance.Clone()
		nextInstance.InstanceID = trimmedInstanceID
		nextInstance.SectionIDOrNull = trimOptionalString(nextInstance.SectionIDOrNull)
		nextInstance.Title = trimOptionalString(nextInstance.Title)
		nextInstance.ChatID = trimOptionalString(nextInstance.ChatID)
		nextInstance.Bounds = normalizeChatWindowBounds(nextInstance.Bounds)
		nextInstance.DockMetrics = normalizeChatWindowDockMetrics(nextInstance.DockMetrics)
		if nextInstance.Placement == "" {
			nextInstance.Placement = ChatWindowPlacementBottomDocked
		}
		if nextInstance.Mode == "" {
			nextInstance.Mode = ChatWindowModeProjectAI
		}
		if err := validateWindowingOwner(
			nextInstance.Mode,
			nextInstance.Placement,
			nextInstance.SectionIDOrNull,
		); err != nil {
			return ProjectChatWindowingState{}, err
		}
		if nextInstance.Mode != ChatWindowModeProjectAI {
			nextInstance.ChatID = nil
		}
		if nextInstance.Mode == ChatWindowModeGitGraph {
			nextInstance.SectionIDOrNull = nil
		}
		if nextInstance.Mode == ChatWindowModeSection && nextInstance.SectionIDOrNull == nil {
			continue
		}
		if nextInstance.SectionIDOrNull != nil {
			if _, ok := sections[*nextInstance.SectionIDOrNull]; !ok {
				continue
			}
			nextInstance.Title = nil

			currentBestInstanceID := winningInstanceIDBySectionID[*nextInstance.SectionIDOrNull]
			currentBestInstance, currentBestExists := normalized.InstancesByID[currentBestInstanceID]
			if !shouldPreferProjectChatSectionBindingCandidate(
				nextInstance,
				trimmedInstanceID,
				currentBestInstance,
				currentBestInstanceID,
				currentBestExists,
			) {
				continue
			}
			if currentBestExists {
				delete(normalized.InstancesByID, currentBestInstanceID)
			}
			winningInstanceIDBySectionID[*nextInstance.SectionIDOrNull] = trimmedInstanceID
		}
		normalized.InstancesByID[trimmedInstanceID] = nextInstance
	}

	normalized.Order = normalizeOrderedKeys(state.Order, normalized.InstancesByID)
	if normalized.NextInstanceNumber < 1 {
		normalized.NextInstanceNumber = 1
	}
	return normalized, nil
}

func normalizeWindowSpaces(
	windowSpaces map[string]WindowSpaceConfig,
	sections map[string]Section,
) (map[string]WindowSpaceConfig, error) {
	if windowSpaces == nil {
		return nil, nil
	}

	normalized := make(map[string]WindowSpaceConfig, len(windowSpaces))
	for windowSpaceID, windowSpace := range windowSpaces {
		trimmedID := strings.TrimSpace(windowSpaceID)
		if trimmedID == "" {
			continue
		}
		nextWindowSpace := windowSpace.Clone()
		nextWindowSpace.ID = trimmedID
		nextWindowSpace.Name = strings.TrimSpace(nextWindowSpace.Name)
		nextWindows := make(map[string]WindowSpaceWindow, len(nextWindowSpace.WindowsByID))
		winningWindowIDBySectionID := map[string]string{}
		for instanceID, window := range nextWindowSpace.WindowsByID {
			trimmedInstanceID := strings.TrimSpace(instanceID)
			if trimmedInstanceID == "" {
				continue
			}
			nextWindow := window.Clone()
			nextWindow.SectionIDOrNull = trimOptionalString(nextWindow.SectionIDOrNull)
			nextWindow.Title = trimOptionalString(nextWindow.Title)
			nextWindow.ChatID = trimOptionalString(nextWindow.ChatID)
			nextWindow.NormalizedBounds = normalizeNormalizedFloatingWindowBounds(
				nextWindow.NormalizedBounds,
			)
			if nextWindow.SurfaceKind == "" {
				nextWindow.SurfaceKind = WindowSpaceSurfaceKindProjectChat
			}
			if nextWindow.Mode == "" {
				nextWindow.Mode = ChatWindowModeProjectAI
			}
			if err := validateWindowSpaceWindowOwnerOnLoad(
				nextWindow.SurfaceKind,
				nextWindow.Mode,
				nextWindow.SectionIDOrNull,
				nextWindow.ChatID,
			); err != nil {
				return nil, err
			}
			if nextWindow.SurfaceKind == WindowSpaceSurfaceKindSection {
				if nextWindow.SectionIDOrNull == nil {
					continue
				}
				if _, ok := sections[*nextWindow.SectionIDOrNull]; !ok {
					continue
				}
				nextWindow.Title = nil

				currentBestWindowID := winningWindowIDBySectionID[*nextWindow.SectionIDOrNull]
				currentBestWindow, currentBestExists := nextWindows[currentBestWindowID]
				if !shouldPreferWindowSpaceSectionBindingCandidate(
					nextWindow,
					trimmedInstanceID,
					currentBestWindow,
					currentBestWindowID,
					currentBestExists,
				) {
					continue
				}
				if currentBestExists {
					delete(nextWindows, currentBestWindowID)
				}
				winningWindowIDBySectionID[*nextWindow.SectionIDOrNull] = trimmedInstanceID
			} else {
				nextWindow.SectionIDOrNull = nil
			}
			nextWindows[trimmedInstanceID] = nextWindow
		}
		nextWindowSpace.WindowsByID = nextWindows
		nextWindowSpace.Order = normalizeOrderedKeys(nextWindowSpace.Order, nextWindowSpace.WindowsByID)
		normalized[trimmedID] = nextWindowSpace
	}
	return normalized, nil
}

func normalizeChatWindowBounds(bounds ChatWindowBounds) ChatWindowBounds {
	normalized := bounds.Clone()
	defaultBounds := DefaultChatWindowBounds()
	if normalized.Width <= 0 {
		normalized.Width = defaultBounds.Width
	}
	if normalized.Height <= 0 {
		normalized.Height = defaultBounds.Height
	}
	return normalized
}

func normalizeChatWindowDockMetrics(metrics ChatWindowDockMetrics) ChatWindowDockMetrics {
	normalized := metrics.Clone()
	return normalized
}

func normalizeNormalizedFloatingWindowBounds(
	bounds NormalizedFloatingWindowBounds,
) NormalizedFloatingWindowBounds {
	normalized := bounds.Clone()
	defaultBounds := DefaultNormalizedFloatingWindowBounds()
	if normalized.Width <= 0 {
		normalized.Width = defaultBounds.Width
	}
	if normalized.Height <= 0 {
		normalized.Height = defaultBounds.Height
	}
	return normalized
}

func normalizeOrderedKeys[T any](order []string, values map[string]T) []string {
	if values == nil {
		return []string{}
	}
	normalizedOrder := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, rawID := range order {
		trimmedID := strings.TrimSpace(rawID)
		if trimmedID == "" {
			continue
		}
		if _, ok := values[trimmedID]; !ok {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}
		seen[trimmedID] = struct{}{}
		normalizedOrder = append(normalizedOrder, trimmedID)
	}

	remaining := make([]string, 0, len(values)-len(normalizedOrder))
	for id := range values {
		if _, exists := seen[id]; exists {
			continue
		}
		remaining = append(remaining, id)
	}
	slices.Sort(remaining)
	return append(normalizedOrder, remaining...)
}

func cloneOptionalFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneOptionalChatWindowPlacement(
	value *ChatWindowPlacement,
) *ChatWindowPlacement {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func trimOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func CloneWindowSpacesOrEmpty(
	windowSpaces map[string]WindowSpaceConfig,
) map[string]WindowSpaceConfig {
	if windowSpaces == nil {
		return map[string]WindowSpaceConfig{}
	}
	cloned := make(map[string]WindowSpaceConfig, len(windowSpaces))
	for windowSpaceID, windowSpace := range windowSpaces {
		cloned[windowSpaceID] = windowSpace.Clone()
	}
	return cloned
}

func clearWindowSpaceChatIDs(
	windowSpaces map[string]WindowSpaceConfig,
) map[string]WindowSpaceConfig {
	cleared := CloneWindowSpacesOrEmpty(windowSpaces)
	for windowSpaceID, windowSpace := range cleared {
		for windowID, window := range windowSpace.WindowsByID {
			window.ChatID = nil
			windowSpace.WindowsByID[windowID] = window
		}
		cleared[windowSpaceID] = windowSpace
	}
	return cleared
}

func ProjectChatWindowingOrDefault(
	state *ProjectChatWindowingState,
) ProjectChatWindowingState {
	if state == nil {
		return DefaultProjectChatWindowingState()
	}
	cloned := state.Clone()
	if cloned.NextInstanceNumber < 1 {
		cloned.NextInstanceNumber = 1
	}
	if cloned.InstancesByID == nil {
		cloned.InstancesByID = map[string]ProjectChatWindowInstance{}
	}
	if cloned.Order == nil {
		cloned.Order = []string{}
	}
	return cloned
}

func clearProjectChatWindowingChatIDs(
	state *ProjectChatWindowingState,
) ProjectChatWindowingState {
	cleared := ProjectChatWindowingOrDefault(state)
	for instanceID, instance := range cleared.InstancesByID {
		instance.ChatID = nil
		cleared.InstancesByID[instanceID] = instance
	}
	return cleared
}

func validateWindowingOwner(
	mode ChatWindowMode,
	placement ChatWindowPlacement,
	sectionID *string,
) error {
	if mode == ChatWindowModeSection && sectionID == nil {
		return fmt.Errorf("Project chat section_mode windows require sectionIdOrNull.")
	}
	if mode == ChatWindowModeGitGraph && sectionID != nil {
		return fmt.Errorf("Project chat git_graph_mode windows cannot carry sectionIdOrNull.")
	}
	if mode == ChatWindowModeGitGraph && placement == ChatWindowPlacementCanvasSection {
		return fmt.Errorf("Project chat git_graph_mode windows cannot use canvas_section placement.")
	}
	return nil
}

func validateWindowSpaceWindowOwnerOnLoad(
	surfaceKind WindowSpaceSurfaceKind,
	mode ChatWindowMode,
	sectionID *string,
	chatID *string,
) error {
	if surfaceKind == WindowSpaceSurfaceKindSection && sectionID == nil {
		return fmt.Errorf("Section window-space windows require sectionIdOrNull.")
	}
	if surfaceKind == WindowSpaceSurfaceKindProjectChat && sectionID != nil {
		return fmt.Errorf("Project-chat window-space windows cannot carry sectionIdOrNull.")
	}
	if surfaceKind == WindowSpaceSurfaceKindSection && mode == ChatWindowModeGitGraph {
		return fmt.Errorf("Section window-space windows cannot use git_graph_mode.")
	}
	if surfaceKind == WindowSpaceSurfaceKindProjectChat && mode == ChatWindowModeSection {
		return fmt.Errorf("Project-chat window-space windows cannot use section_mode.")
	}
	if mode != ChatWindowModeProjectAI && chatID != nil {
		return fmt.Errorf("Window-space windows must use project_ai_mode to bind chatId.")
	}
	return nil
}

func sectionBindingPlacementPriority(placement ChatWindowPlacement) int {
	switch placement {
	case ChatWindowPlacementCanvasSection:
		return 4
	case ChatWindowPlacementFloating:
		return 3
	case ChatWindowPlacementMaximized:
		return 2
	default:
		return 1
	}
}

func isProjectChatWindowVisible(instance ProjectChatWindowInstance) bool {
	return !instance.IsClosed && !instance.IsMinimized
}

func shouldPreferProjectChatSectionBindingCandidate(
	candidate ProjectChatWindowInstance,
	candidateInstanceID string,
	currentBest ProjectChatWindowInstance,
	currentBestInstanceID string,
	currentBestExists bool,
) bool {
	if !currentBestExists || currentBestInstanceID == "" {
		return true
	}
	candidatePriority := sectionBindingPlacementPriority(candidate.Placement)
	currentBestPriority := sectionBindingPlacementPriority(currentBest.Placement)
	if candidatePriority != currentBestPriority {
		return candidatePriority > currentBestPriority
	}
	candidateVisible := isProjectChatWindowVisible(candidate)
	currentBestVisible := isProjectChatWindowVisible(currentBest)
	if candidateVisible != currentBestVisible {
		return candidateVisible
	}
	if candidate.ZIndex != currentBest.ZIndex {
		return candidate.ZIndex > currentBest.ZIndex
	}
	if candidate.LastFocusedAt != currentBest.LastFocusedAt {
		return candidate.LastFocusedAt > currentBest.LastFocusedAt
	}
	return candidateInstanceID > currentBestInstanceID
}

func shouldPreferWindowSpaceSectionBindingCandidate(
	candidate WindowSpaceWindow,
	candidateWindowID string,
	currentBest WindowSpaceWindow,
	currentBestWindowID string,
	currentBestExists bool,
) bool {
	if !currentBestExists || currentBestWindowID == "" {
		return true
	}
	if candidate.ZIndex != currentBest.ZIndex {
		return candidate.ZIndex > currentBest.ZIndex
	}
	return candidateWindowID > currentBestWindowID
}
