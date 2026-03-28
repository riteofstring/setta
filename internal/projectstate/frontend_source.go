package projectstate

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrCodeObjIDRequired            = errors.New("code object id is required")
	ErrCodeObjNameRequired          = errors.New("code object name is required")
	ErrCodeObjIDKeyMismatch         = errors.New("code object id must match its map key")
	ErrCodeObjVariantIDRequired     = errors.New("code object variant id is required")
	ErrCodeObjVariantIDKeyMismatch  = errors.New("code object variant id must match its map key")
	ErrCodeObjImplIDRequired        = errors.New("code object impl id is required")
	ErrCodeObjImplIDKeyMismatch     = errors.New("code object impl id must match its map key")
	ErrCodeObjNotFound              = errors.New("code object was not found in project")
	ErrCodeObjVariantNotFound       = errors.New("code object variant was not found in project")
	ErrCodeObjImplNotFound          = errors.New("code object impl was not found in project")
	ErrCodeObjVariantMembership     = errors.New("code object variant must belong to the code object")
	ErrCodeObjDefaultVariantMissing = errors.New("code object default variant id is required when variants exist")
	ErrCodeObjImplTypeRequired      = errors.New("code object impl type is required")
	ErrViewModeIDRequired           = errors.New("view mode id is required")
	ErrViewModeIDKeyMismatch        = errors.New("view mode id must match its map key")
	ErrViewModeNotFound             = errors.New("view mode was not found in project")
	ErrFrontendPayloadInvalid       = errors.New("frontend payload JSON must be valid")
	ErrAppRoutePathRequired         = errors.New("app route path is required")
)

type RawJSON = json.RawMessage

type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

type ViewportBounds struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type TopLevelSectionLayout struct {
	X      float64  `json:"x"`
	Y      float64  `json:"y"`
	ZIndex int      `json:"zIndex,omitempty"`
	W      *float64 `json:"w,omitempty"`
	H      *float64 `json:"h,omitempty"`
}

type EdgePort struct {
	ID       string `json:"id"`
	Accessor string `json:"accessor"`
}

type ViewMode struct {
	ID                    string                           `json:"id"`
	Name                  string                           `json:"name"`
	SortIndex             int                              `json:"sortIndex"`
	IsUserFacing          bool                             `json:"isUserFacing,omitempty"`
	IsTab                 bool                             `json:"isTab,omitempty"`
	VisibilityBySectionID map[string]bool                  `json:"visibilityBySectionId,omitempty"`
	Viewport              *Viewport                        `json:"viewport,omitempty"`
	ViewportInitialized   bool                             `json:"viewportInitialized,omitempty"`
	TopLevelSections      map[string]TopLevelSectionLayout `json:"topLevelSections,omitempty"`
}

type Edge struct {
	ID              string  `json:"id"`
	SourceSectionID string  `json:"sourceSectionId"`
	SourceVariantID string  `json:"sourceVariantId"`
	SourcePortID    string  `json:"sourcePortId"`
	TargetSectionID string  `json:"targetSectionId"`
	TargetVariantID string  `json:"targetVariantId"`
	TargetPortID    string  `json:"targetPortId"`
	Type            string  `json:"type,omitempty"`
	Label           *string `json:"label,omitempty"`
	Style           RawJSON `json:"style,omitempty"`
	Animated        bool    `json:"animated,omitempty"`
	Hidden          bool    `json:"hidden,omitempty"`
	ZIndex          int     `json:"zIndex,omitempty"`
	Data            RawJSON `json:"data,omitempty"`
	Selected        bool    `json:"selected,omitempty"`
}

type AgenticEdge struct {
	ID              string  `json:"id"`
	SourceSectionID string  `json:"sourceSectionId"`
	TargetSectionID string  `json:"targetSectionId"`
	Kind            string  `json:"kind"`
	ContextMode     string  `json:"contextMode,omitempty"`
	Style           RawJSON `json:"style,omitempty"`
	Hidden          bool    `json:"hidden,omitempty"`
	ZIndex          int     `json:"zIndex,omitempty"`
	Selected        bool    `json:"selected,omitempty"`
}

type CodeObject struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	DisplayName      string   `json:"displayName,omitempty"`
	VariantIDs       []string `json:"variantIds,omitempty"`
	DefaultVariantID string   `json:"defaultVariantId,omitempty"`
	SharedModifier   RawJSON  `json:"sharedModifier,omitempty"`
	UnsharedKeys     []string `json:"unsharedKeys,omitempty"`
}

type CodeObjectVariant struct {
	ID               string   `json:"id"`
	Name             string   `json:"name,omitempty"`
	ImplID           string   `json:"implId"`
	NonPresetImplIDs []string `json:"nonPresetImplIds,omitempty"`
	Modifier         RawJSON  `json:"modifier,omitempty"`
	IsFrozen         bool     `json:"isFrozen,omitempty"`
}

type CodeObjectImpl struct {
	ID      string  `json:"id"`
	Type    string  `json:"type"`
	Payload RawJSON `json:"payload,omitempty"`
}

type AppRoute struct {
	Path    string `json:"path"`
	Name    string `json:"name,omitempty"`
	RootKey string `json:"rootKey,omitempty"`
}

type AppDefinition struct {
	AppSpecVersion string     `json:"appSpecVersion,omitempty"`
	CatalogID      string     `json:"catalogId,omitempty"`
	AppSpecPath    string     `json:"appSpecPath,omitempty"`
	Routes         []AppRoute `json:"routes,omitempty"`
	DataBindings   RawJSON    `json:"dataBindings,omitempty"`
	Actions        RawJSON    `json:"actions,omitempty"`
	Theme          RawJSON    `json:"theme,omitempty"`
	Assets         RawJSON    `json:"assets,omitempty"`
}

func (v ViewMode) Clone() ViewMode {
	cloned := v
	cloned.VisibilityBySectionID = cloneBoolMap(v.VisibilityBySectionID)
	cloned.Viewport = cloneViewport(v.Viewport)
	if v.TopLevelSections != nil {
		cloned.TopLevelSections = make(map[string]TopLevelSectionLayout, len(v.TopLevelSections))
		for sectionID, layout := range v.TopLevelSections {
			cloned.TopLevelSections[sectionID] = layout.Clone()
		}
	}
	return cloned
}

func (l TopLevelSectionLayout) Clone() TopLevelSectionLayout {
	cloned := l
	cloned.W = cloneFloat64Pointer(l.W)
	cloned.H = cloneFloat64Pointer(l.H)
	return cloned
}

func (e Edge) Clone() Edge {
	cloned := e
	cloned.Label = cloneStringPointer(e.Label)
	cloned.Style = cloneRawJSON(e.Style)
	cloned.Data = cloneRawJSON(e.Data)
	return cloned
}

func (e AgenticEdge) Clone() AgenticEdge {
	cloned := e
	cloned.Style = cloneRawJSON(e.Style)
	return cloned
}

func (c CodeObject) Clone() CodeObject {
	cloned := c
	cloned.VariantIDs = append([]string(nil), c.VariantIDs...)
	cloned.SharedModifier = cloneRawJSON(c.SharedModifier)
	cloned.UnsharedKeys = append([]string(nil), c.UnsharedKeys...)
	return cloned
}

func (v CodeObjectVariant) Clone() CodeObjectVariant {
	cloned := v
	cloned.NonPresetImplIDs = append([]string(nil), v.NonPresetImplIDs...)
	cloned.Modifier = cloneRawJSON(v.Modifier)
	return cloned
}

func (i CodeObjectImpl) Clone() CodeObjectImpl {
	cloned := i
	cloned.Payload = cloneRawJSON(i.Payload)
	return cloned
}

func (r AppRoute) Normalized() (AppRoute, error) {
	normalized := AppRoute{
		Path:    strings.TrimSpace(r.Path),
		Name:    strings.TrimSpace(r.Name),
		RootKey: strings.TrimSpace(r.RootKey),
	}
	if normalized.Path == "" {
		return AppRoute{}, ErrAppRoutePathRequired
	}
	return normalized, nil
}

func (d AppDefinition) Clone() AppDefinition {
	cloned := d
	cloned.Routes = append([]AppRoute(nil), d.Routes...)
	cloned.DataBindings = cloneRawJSON(d.DataBindings)
	cloned.Actions = cloneRawJSON(d.Actions)
	cloned.Theme = cloneRawJSON(d.Theme)
	cloned.Assets = cloneRawJSON(d.Assets)
	return cloned
}

func (d AppDefinition) Normalized() (AppDefinition, error) {
	normalized := d.Clone()
	normalized.AppSpecVersion = strings.TrimSpace(normalized.AppSpecVersion)
	normalized.CatalogID = strings.TrimSpace(normalized.CatalogID)
	normalized.AppSpecPath = strings.TrimSpace(normalized.AppSpecPath)

	var err error
	normalized.DataBindings, err = normalizeRawJSON(normalized.DataBindings, "appDefinition.dataBindings")
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Actions, err = normalizeRawJSON(normalized.Actions, "appDefinition.actions")
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Theme, err = normalizeRawJSON(normalized.Theme, "appDefinition.theme")
	if err != nil {
		return AppDefinition{}, err
	}
	normalized.Assets, err = normalizeRawJSON(normalized.Assets, "appDefinition.assets")
	if err != nil {
		return AppDefinition{}, err
	}

	for index, route := range normalized.Routes {
		normalizedRoute, err := route.Normalized()
		if err != nil {
			return AppDefinition{}, fmt.Errorf("normalize app route %d: %w", index, err)
		}
		normalized.Routes[index] = normalizedRoute
	}

	return normalized, nil
}

func cloneViewport(viewport *Viewport) *Viewport {
	if viewport == nil {
		return nil
	}
	cloned := *viewport
	return &cloned
}

func cloneFloat64Pointer(value *float64) *float64 {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneBoolMap(input map[string]bool) map[string]bool {
	if input == nil {
		return nil
	}
	cloned := make(map[string]bool, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func cloneRawJSON(raw RawJSON) RawJSON {
	if len(raw) == 0 {
		return nil
	}
	cloned := make(RawJSON, len(raw))
	copy(cloned, raw)
	return cloned
}

func normalizeRawJSON(raw RawJSON, field string) (RawJSON, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}
	if !json.Valid(trimmed) {
		return nil, fmt.Errorf("%w: %s", ErrFrontendPayloadInvalid, field)
	}
	return cloneRawJSON(trimmed), nil
}
