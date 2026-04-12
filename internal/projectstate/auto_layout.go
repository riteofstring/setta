package projectstate

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
)

type AutoLayoutSectionMinDimensions struct {
	MinWidth  float64
	MinHeight float64
	MaxWidth  float64
	MaxHeight float64
}

type AutoLayoutSectionSizingPolicy struct {
	ByType map[string]AutoLayoutSectionMinDimensions
}

type InvalidAutoLayoutError struct {
	Message string
}

func (e *InvalidAutoLayoutError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func ResolveAutoLayoutSectionSizingPolicy(document Document) (AutoLayoutSectionSizingPolicy, error) {
	policy := defaultAutoLayoutSectionSizingPolicy()
	settingsSource, ok, err := resolveAutoLayoutSectionSizingSettings(document)
	if err != nil {
		return AutoLayoutSectionSizingPolicy{}, err
	}
	if !ok {
		return policy, nil
	}
	if err := applyAutoLayoutSectionSizingOverrides(&policy, settingsSource); err != nil {
		return AutoLayoutSectionSizingPolicy{}, err
	}

	return policy, nil
}

type autoLayoutSectionSizingSettingsSource struct {
	project           Project
	codeObjVariantMap map[string]string
	byTypePayload     map[string]any
}

func resolveAutoLayoutSectionSizingSettings(
	document Document,
) (autoLayoutSectionSizingSettingsSource, bool, error) {
	settingsProject, ok, err := resolveSettingsProject(document)
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	if !ok {
		return autoLayoutSectionSizingSettingsSource{}, false, nil
	}

	sectionID, ok, err := findSectionIDByName(settingsProject, "sectionSizingPolicy")
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	if !ok {
		return autoLayoutSectionSizingSettingsSource{}, false, nil
	}

	_, sectionVariant, _, err := settingsProject.ResolveSection(sectionID)
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	sectionPayload, err := effectiveSectionPayload(settingsProject, sectionID, sectionVariant.ID)
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	codeObjVariantMap := payloadStringMapField(sectionPayload, "codeObjVariantMap")
	topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return autoLayoutSectionSizingSettingsSource{}, false, nil
	}

	topLevelPayload, _, _, _, err := effectiveCodeObjectPayload(settingsProject, codeObjVariantMap, topLevelParamID)
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	byTypePayload, ok, err := findSettingsChildPayload(settingsProject, codeObjVariantMap, topLevelPayload, "byType")
	if err != nil {
		return autoLayoutSectionSizingSettingsSource{}, false, err
	}
	if !ok {
		return autoLayoutSectionSizingSettingsSource{}, false, nil
	}

	return autoLayoutSectionSizingSettingsSource{
		project:           settingsProject,
		codeObjVariantMap: codeObjVariantMap,
		byTypePayload:     byTypePayload,
	}, true, nil
}

func applyAutoLayoutSectionSizingOverrides(
	policy *AutoLayoutSectionSizingPolicy,
	settings autoLayoutSectionSizingSettingsSource,
) error {
	for sectionType, defaults := range policy.ByType {
		overrides, ok, err := resolveAutoLayoutSectionSizingTypeOverrides(
			settings.project,
			settings.codeObjVariantMap,
			settings.byTypePayload,
			sectionType,
			defaults,
		)
		if err != nil {
			return err
		}
		if ok {
			policy.ByType[sectionType] = overrides
		}
	}
	return nil
}

func resolveAutoLayoutSectionSizingTypeOverrides(
	project Project,
	codeObjVariantMap map[string]string,
	byTypePayload map[string]any,
	sectionType string,
	defaults AutoLayoutSectionMinDimensions,
) (AutoLayoutSectionMinDimensions, bool, error) {
	typePayload, ok, err := findSettingsChildPayload(project, codeObjVariantMap, byTypePayload, sectionType)
	if err != nil {
		return AutoLayoutSectionMinDimensions{}, false, err
	}
	if !ok {
		return AutoLayoutSectionMinDimensions{}, false, nil
	}

	minWidth, err := resolveSettingsChildFloat(
		project,
		codeObjVariantMap,
		typePayload,
		"minWidth",
		defaults.MinWidth,
		fmt.Sprintf("sectionSizingPolicy.byType.%s.minWidth", sectionType),
	)
	if err != nil {
		return AutoLayoutSectionMinDimensions{}, false, err
	}
	minHeight, err := resolveSettingsChildFloat(
		project,
		codeObjVariantMap,
		typePayload,
		"minHeight",
		defaults.MinHeight,
		fmt.Sprintf("sectionSizingPolicy.byType.%s.minHeight", sectionType),
	)
	if err != nil {
		return AutoLayoutSectionMinDimensions{}, false, err
	}
	maxWidth, err := resolveSettingsChildFloat(
		project,
		codeObjVariantMap,
		typePayload,
		"maxWidth",
		defaults.MaxWidth,
		fmt.Sprintf("sectionSizingPolicy.byType.%s.maxWidth", sectionType),
	)
	if err != nil {
		return AutoLayoutSectionMinDimensions{}, false, err
	}
	maxHeight, err := resolveSettingsChildFloat(
		project,
		codeObjVariantMap,
		typePayload,
		"maxHeight",
		defaults.MaxHeight,
		fmt.Sprintf("sectionSizingPolicy.byType.%s.maxHeight", sectionType),
	)
	if err != nil {
		return AutoLayoutSectionMinDimensions{}, false, err
	}

	return AutoLayoutSectionMinDimensions{
		MinWidth:  max(0, minWidth),
		MinHeight: max(0, minHeight),
		MaxWidth:  maxWidth,
		MaxHeight: maxHeight,
	}, true, nil
}

func (d *Document) AutoLayoutTopLevelSections(projectID string, policy AutoLayoutSectionSizingPolicy, margin int) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.AutoLayoutTopLevelSections(policy, margin); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) AutoLayoutTopLevelSections(
	ctx context.Context,
	projectID string,
	settings StructuralMutationSettings,
	margin int,
) (Snapshot, error) {
	policy := normalizeStructuralMutationSettings(settings).SectionSizingPolicy

	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.AutoLayoutTopLevelSections(projectID, policy, margin); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) AutoLayoutTopLevelSections(policy AutoLayoutSectionSizingPolicy, margin int) error {
	if margin < 0 {
		return &InvalidAutoLayoutError{Message: "Auto layout margin must be non-negative."}
	}
	if len(p.TopLevelSections) == 0 {
		return nil
	}

	rects, minX, minY, err := p.collectAutoLayoutRects(policy, margin)
	if err != nil {
		return err
	}
	if len(rects) == 0 {
		return nil
	}

	placements := packAutoLayoutRects(rects)
	newMinX := placements[0].X
	newMinY := placements[0].Y
	for _, placement := range placements[1:] {
		if placement.X < newMinX {
			newMinX = placement.X
		}
		if placement.Y < newMinY {
			newMinY = placement.Y
		}
	}

	shiftX := minX - newMinX
	shiftY := minY - newMinY

	nextLayouts := cloneTopLevelSectionsMap(p.TopLevelSections)
	for _, placement := range placements {
		layout := nextLayouts[placement.SectionID]
		layout.X = placement.X + shiftX
		layout.Y = placement.Y + shiftY
		nextLayouts[placement.SectionID] = layout
	}

	return p.SetTopLevelSectionLayout(nextLayouts)
}

func (p Project) collectAutoLayoutRects(
	policy AutoLayoutSectionSizingPolicy,
	margin int,
) ([]autoLayoutRect, float64, float64, error) {
	rects := make([]autoLayoutRect, 0, len(p.TopLevelSections))
	minX := 0.0
	minY := 0.0
	first := true

	for sectionID, layout := range p.TopLevelSections {
		rect, err := p.buildAutoLayoutRect(sectionID, layout, policy, margin)
		if err != nil {
			return nil, 0, 0, err
		}
		rects = append(rects, rect)
		if first || layout.X < minX {
			minX = layout.X
		}
		if first || layout.Y < minY {
			minY = layout.Y
		}
		first = false
	}

	if err := validateAutoLayoutRects(rects); err != nil {
		return nil, 0, 0, err
	}

	sort.Slice(rects, func(i int, j int) bool {
		return autoLayoutRectLess(rects[i], rects[j])
	})

	return rects, minX, minY, nil
}

func (p Project) buildAutoLayoutRect(
	sectionID string,
	layout TopLevelSectionLayout,
	policy AutoLayoutSectionSizingPolicy,
	margin int,
) (autoLayoutRect, error) {
	width, height, err := p.resolveAutoLayoutSectionDimensions(sectionID, layout, policy)
	if err != nil {
		return autoLayoutRect{}, err
	}

	return autoLayoutRect{
		SectionID:      sectionID,
		Layout:         layout.Clone(),
		Width:          width,
		Height:         height,
		PaddedWidth:    int(math.Ceil(width + float64(margin))),
		PaddedHeight:   int(math.Ceil(height + float64(margin))),
		OriginalZIndex: layout.ZIndex,
	}, nil
}

func validateAutoLayoutRects(rects []autoLayoutRect) error {
	for _, rect := range rects {
		if rect.PaddedWidth > 0 && rect.PaddedHeight > 0 {
			continue
		}
		return &InvalidAutoLayoutError{
			Message: "Auto layout expects positive integer dimensions for packing.",
		}
	}
	return nil
}

func autoLayoutRectLess(left autoLayoutRect, right autoLayoutRect) bool {
	if left.PaddedHeight != right.PaddedHeight {
		return left.PaddedHeight > right.PaddedHeight
	}
	if left.PaddedWidth != right.PaddedWidth {
		return left.PaddedWidth > right.PaddedWidth
	}
	if left.OriginalZIndex != right.OriginalZIndex {
		return left.OriginalZIndex < right.OriginalZIndex
	}
	if left.Layout.Y != right.Layout.Y {
		return left.Layout.Y < right.Layout.Y
	}
	if left.Layout.X != right.Layout.X {
		return left.Layout.X < right.Layout.X
	}
	return left.SectionID < right.SectionID
}

func (p Project) resolveAutoLayoutSectionDimensions(
	sectionID string,
	layout TopLevelSectionLayout,
	policy AutoLayoutSectionSizingPolicy,
) (float64, float64, error) {
	_, variant, _, err := p.ResolveSection(sectionID)
	if err != nil {
		return 0, 0, err
	}

	payload, err := effectiveSectionPayload(p, sectionID, variant.ID)
	if err != nil {
		return 0, 0, err
	}

	sectionType := strings.TrimSpace(payloadStringField(payload, "type"))
	if sectionType == "" {
		return 0, 0, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q is missing a type for auto layout.", sectionID),
		}
	}

	width, err := resolveAutoLayoutDimension(policy, sectionID, sectionType, "width", layout.W, payload)
	if err != nil {
		return 0, 0, err
	}
	height, err := resolveAutoLayoutDimension(policy, sectionID, sectionType, "height", layout.H, payload)
	if err != nil {
		return 0, 0, err
	}

	if width <= 0 || height <= 0 {
		return 0, 0, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q has non-positive dimensions (%v, %v).", sectionID, width, height),
		}
	}

	return width, height, nil
}

func resolveAutoLayoutDimension(
	policy AutoLayoutSectionSizingPolicy,
	sectionID string,
	sectionType string,
	dimension string,
	layoutValue *float64,
	payload map[string]any,
) (float64, error) {
	if layoutValue != nil {
		return *layoutValue, nil
	}

	sizeObject, ok := payloadObjectField(payload, "size")
	if ok {
		value, isAuto, present, err := payloadAutoLayoutSizeValue(sizeObject, dimension)
		if err != nil {
			return 0, err
		}
		if present && !isAuto {
			return value, nil
		}
	}

	dimensions, ok := policy.ByType[sectionType]
	if !ok {
		return 0, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section %q has unsupported type %q for auto layout.", sectionID, sectionType),
		}
	}
	if dimension == "width" {
		return max(1, dimensions.MinWidth), nil
	}
	return max(1, dimensions.MinHeight), nil
}

func payloadAutoLayoutSizeValue(
	sizeObject map[string]any,
	dimension string,
) (float64, bool, bool, error) {
	value, ok := sizeObject[dimension]
	if !ok {
		return 0, false, false, nil
	}

	switch typed := value.(type) {
	case float64:
		return typed, false, true, nil
	case float32:
		return float64(typed), false, true, nil
	case int:
		return float64(typed), false, true, nil
	case int32:
		return float64(typed), false, true, nil
	case int64:
		return float64(typed), false, true, nil
	case string:
		trimmed := strings.TrimSpace(typed)
		if trimmed == "" {
			return 0, false, false, nil
		}
		if strings.EqualFold(trimmed, "auto") {
			return 0, true, true, nil
		}
		numeric, err := strconv.ParseFloat(trimmed, 64)
		if err != nil {
			return 0, false, false, &InvalidAutoLayoutError{
				Message: fmt.Sprintf("Auto layout size %q must be numeric or 'auto'.", dimension),
			}
		}
		return numeric, false, true, nil
	default:
		return 0, false, false, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Auto layout size %q must be numeric or 'auto'.", dimension),
		}
	}
}

func findSettingsChildPayload(
	project Project,
	codeObjVariantMap map[string]string,
	parentPayload map[string]any,
	childName string,
) (map[string]any, bool, error) {
	childID, ok, err := findChildCodeObjectIDByName(project, codeObjVariantMap, parentPayload, childName)
	if err != nil {
		return nil, false, err
	}
	if !ok {
		return nil, false, nil
	}
	childPayload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, childID)
	if err != nil {
		return nil, false, err
	}
	return childPayload, true, nil
}

func resolveSettingsChildFloat(
	project Project,
	codeObjVariantMap map[string]string,
	parentPayload map[string]any,
	childName string,
	defaultValue float64,
	fieldPath string,
) (float64, error) {
	childPayload, ok, err := findSettingsChildPayload(project, codeObjVariantMap, parentPayload, childName)
	if err != nil {
		return 0, err
	}
	if !ok {
		return defaultValue, nil
	}

	rawValue, present := payloadRawStringFieldWithPresence(childPayload, "value")
	if !present || strings.TrimSpace(rawValue) == "" {
		return defaultValue, nil
	}

	numeric, err := strconv.ParseFloat(strings.TrimSpace(rawValue), 64)
	if err != nil {
		return 0, fmt.Errorf("%w: %s=%q", ErrSettingsValueInvalid, fieldPath, rawValue)
	}
	return numeric, nil
}

func defaultAutoLayoutSectionSizingPolicy() AutoLayoutSectionSizingPolicy {
	return AutoLayoutSectionSizingPolicy{
		ByType: map[string]AutoLayoutSectionMinDimensions{
			"Callable":          {MinWidth: 200, MinHeight: 104, MaxWidth: 100000, MaxHeight: 100000},
			"Dict":              {MinWidth: 200, MinHeight: 78, MaxWidth: 100000, MaxHeight: 100000},
			"ListRoot":          {MinWidth: 200, MinHeight: 50, MaxWidth: 100000, MaxHeight: 50},
			"Group":             {MinWidth: 200, MinHeight: 0, MaxWidth: 100000, MaxHeight: 100000},
			"StateMachineStart": {MinWidth: 240, MinHeight: 96, MaxWidth: 100000, MaxHeight: 100000},
			"StateMachineGate":  {MinWidth: 240, MinHeight: 120, MaxWidth: 100000, MaxHeight: 100000},
			"StateMachineEnd":   {MinWidth: 240, MinHeight: 96, MaxWidth: 100000, MaxHeight: 100000},
			"Image":             {MinWidth: 200, MinHeight: 100, MaxWidth: 100000, MaxHeight: 100000},
			"Chart":             {MinWidth: 300, MinHeight: 300, MaxWidth: 100000, MaxHeight: 100000},
			"Draw":              {MinWidth: 402, MinHeight: 100, MaxWidth: 100000, MaxHeight: 100000},
			"Prompt":            {MinWidth: 300, MinHeight: 150, MaxWidth: 100000, MaxHeight: 100000},
			"TextBlock":         {MinWidth: 100, MinHeight: 49, MaxWidth: 100000, MaxHeight: 100000},
			"MetaControl":       {MinWidth: 100, MinHeight: 10, MaxWidth: 100000, MaxHeight: 100000},
			"Social":            {MinWidth: 200, MinHeight: 50, MaxWidth: 100000, MaxHeight: 100000},
			"GlobalVariables":   {MinWidth: 200, MinHeight: 78, MaxWidth: 100000, MaxHeight: 100000},
			"Code":              {MinWidth: 200, MinHeight: 58.2, MaxWidth: 100000, MaxHeight: 100000},
			"GenPythonCode":     {MinWidth: 200, MinHeight: 0, MaxWidth: 100000, MaxHeight: 100000},
			"GenPythonMetadata": {MinWidth: 200, MinHeight: 0, MaxWidth: 100000, MaxHeight: 100000},
			"Terminal":          {MinWidth: 200, MinHeight: 100, MaxWidth: 100000, MaxHeight: 100000},
			"IFrame":            {MinWidth: 200, MinHeight: 0, MaxWidth: 100000, MaxHeight: 100000},
			"Chat":              {MinWidth: 400, MinHeight: 200, MaxWidth: 100000, MaxHeight: 100000},
			"Browser":           {MinWidth: 200, MinHeight: 250, MaxWidth: 100000, MaxHeight: 100000},
			"Plugin":            {MinWidth: 200, MinHeight: 80, MaxWidth: 100000, MaxHeight: 100000},
			"TaskBoard":         {MinWidth: 360, MinHeight: 240, MaxWidth: 100000, MaxHeight: 100000},
			"Spreadsheet":       {MinWidth: 420, MinHeight: 260, MaxWidth: 100000, MaxHeight: 100000},
		},
	}
}

type autoLayoutRect struct {
	SectionID      string
	Layout         TopLevelSectionLayout
	Width          float64
	Height         float64
	PaddedWidth    int
	PaddedHeight   int
	OriginalZIndex int
}

type autoLayoutPlacement struct {
	SectionID string
	X         float64
	Y         float64
}

func packAutoLayoutRects(rects []autoLayoutRect) []autoLayoutPlacement {
	totalArea := 0
	maxWidth := 0
	for _, rect := range rects {
		totalArea += rect.PaddedWidth * rect.PaddedHeight
		if rect.PaddedWidth > maxWidth {
			maxWidth = rect.PaddedWidth
		}
	}
	targetWidth := max(maxWidth, int(math.Ceil(math.Sqrt(float64(totalArea)))))

	placements := make([]autoLayoutPlacement, 0, len(rects))
	cursorX := 0
	cursorY := 0
	rowHeight := 0

	for _, rect := range rects {
		if cursorX > 0 && cursorX+rect.PaddedWidth > targetWidth {
			cursorX = 0
			cursorY += rowHeight
			rowHeight = 0
		}

		placements = append(placements, autoLayoutPlacement{
			SectionID: rect.SectionID,
			X:         float64(cursorX),
			Y:         float64(cursorY),
		})
		cursorX += rect.PaddedWidth
		if rect.PaddedHeight > rowHeight {
			rowHeight = rect.PaddedHeight
		}
	}

	return placements
}

func IsInvalidAutoLayoutError(err error) bool {
	var invalid *InvalidAutoLayoutError
	return errors.As(err, &invalid)
}
