package projectstate

import (
	"fmt"
	"strings"
)

func buildCreatedSectionPayload(
	implID string,
	implType string,
	base map[string]any,
	settings StructuralMutationSettings,
	overrides map[string]any,
) (RawJSON, error) {
	payload, err := buildCreatedSectionObject(implID, implType, base, settings, overrides)
	if err != nil {
		return nil, err
	}
	return marshalProjectObject(payload)
}

func buildCreatedCodeObjectPayload(implID string, implType string, base map[string]any) (RawJSON, error) {
	payload := cloneProjectObject(base)
	payload["id"] = implID
	payload["type"] = implType
	return marshalProjectObject(payload)
}

func (p *Project) resolveCreateTopLevelSectionLayout(
	policy AutoLayoutSectionSizingPolicy,
	input CreateTopLevelSectionInput,
	impl SectionImpl,
) (TopLevelSectionLayout, *Position, error) {
	nextZIndex := p.nextCreateTopLevelSectionZIndex()
	if input.Position != nil {
		return TopLevelSectionLayout{
			X:      input.Position.X,
			Y:      input.Position.Y,
			ZIndex: nextZIndex,
		}, nil, nil
	}

	position, panTo, err := p.resolveCreateTopLevelSectionPosition(
		policy,
		input.ImplType,
		impl.Payload,
		input.ViewportBounds,
	)
	if err != nil {
		return TopLevelSectionLayout{}, nil, err
	}
	return TopLevelSectionLayout{
		X:      position.X,
		Y:      position.Y,
		ZIndex: nextZIndex,
	}, panTo, nil
}

func (p Project) resolveCreateTopLevelSectionPosition(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	rawPayload RawJSON,
	viewportBounds *ViewportBounds,
) (Position, *Position, error) {
	spec, err := p.resolveCreateTopLevelSectionPlacementSpec(policy, implType, rawPayload)
	if err != nil {
		return Position{}, nil, err
	}
	if position, panTo, ok := resolveCreateTopLevelSectionViewportPosition(spec, policy, implType, viewportBounds); ok {
		return position, panTo, nil
	}
	return findPositionAfterExisting(spec.rects, spec.width, spec.height, spec.padding, spec.step), nil, nil
}

func (p Project) resolveDeterministicCreateTopLevelSectionPosition(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	rawPayload RawJSON,
) (Position, error) {
	spec, err := p.resolveCreateTopLevelSectionPlacementSpec(policy, implType, rawPayload)
	if err != nil {
		return Position{}, err
	}
	return findDeterministicPositionAfterExisting(spec.rects, spec.width, spec.height, spec.padding, spec.step), nil
}

type createTopLevelSectionLayoutRect struct {
	X float64
	Y float64
	W float64
	H float64
}

type createTopLevelSectionPlacementSpec struct {
	rects   []createTopLevelSectionLayoutRect
	width   float64
	height  float64
	padding float64
	step    float64
}

func (p Project) resolveCreateTopLevelSectionPlacementSpec(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	rawPayload RawJSON,
) (createTopLevelSectionPlacementSpec, error) {
	payload, err := rawObjectFromProjectPayload(rawPayload)
	if err != nil {
		return createTopLevelSectionPlacementSpec{}, err
	}
	newWidth, newHeight, err := resolveCreateTopLevelSectionPlacementSize(policy, implType, payload)
	if err != nil {
		return createTopLevelSectionPlacementSpec{}, err
	}
	rects, err := p.buildCreateTopLevelSectionLayoutRects(policy)
	if err != nil {
		return createTopLevelSectionPlacementSpec{}, err
	}
	return createTopLevelSectionPlacementSpec{
		rects:   rects,
		width:   newWidth,
		height:  newHeight,
		padding: 24.0,
		step:    gridStepForCreateTopLevelSection(newWidth, newHeight),
	}, nil
}

func resolveCreateTopLevelSectionPlacementSize(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	payload map[string]any,
) (float64, float64, error) {
	newWidth, err := resolveAutoLayoutDimension(policy, "new-section", implType, "width", nil, payload)
	if err != nil {
		return 0, 0, err
	}
	newHeight, err := resolveAutoLayoutDimension(policy, "new-section", implType, "height", nil, payload)
	if err != nil {
		return 0, 0, err
	}
	if newWidth <= 0 || newHeight <= 0 {
		return 0, 0, &InvalidAutoLayoutError{
			Message: fmt.Sprintf("Section type %q has non-positive dimensions (%v, %v).", implType, newWidth, newHeight),
		}
	}
	return newWidth, newHeight, nil
}

func (p Project) buildCreateTopLevelSectionLayoutRects(policy AutoLayoutSectionSizingPolicy) ([]createTopLevelSectionLayoutRect, error) {
	rects := make([]createTopLevelSectionLayoutRect, 0, len(p.TopLevelSections))
	for sectionID, layout := range p.TopLevelSections {
		section, ok := p.Sections[sectionID]
		if !ok || strings.TrimSpace(section.ParentSectionID) != "" {
			continue
		}
		width, height, err := p.resolveAutoLayoutSectionDimensions(sectionID, layout, policy)
		if err != nil {
			return nil, err
		}
		rects = append(rects, createTopLevelSectionLayoutRect{
			X: layout.X,
			Y: layout.Y,
			W: width,
			H: height,
		})
	}
	return rects, nil
}

func gridStepForCreateTopLevelSection(newWidth float64, newHeight float64) float64 {
	base := min(newWidth, newHeight) / 3
	return max(20.0, min(80.0, base))
}

func findPositionInBounds(
	bounds createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	rects []createTopLevelSectionLayoutRect,
	padding float64,
	step float64,
) (Position, bool) {
	if bounds.W <= 0 || bounds.H <= 0 {
		return Position{}, false
	}
	startX := bounds.X + padding
	startY := bounds.Y + padding
	endX := bounds.X + bounds.W - newWidth - padding
	endY := bounds.Y + bounds.H - newHeight - padding
	if endX < startX || endY < startY {
		return Position{}, false
	}

	expanded := make([]createTopLevelSectionLayoutRect, 0, len(rects))
	for _, rect := range rects {
		expanded = append(expanded, expandCreateTopLevelSectionRect(rect, padding))
	}

	for y := startY; y <= endY; y += step {
		for x := startX; x <= endX; x += step {
			candidate := createTopLevelSectionLayoutRect{X: x, Y: y, W: newWidth, H: newHeight}
			if !createTopLevelSectionRectsIntersectAny(candidate, expanded) {
				return Position{X: x, Y: y}, true
			}
		}
	}
	return Position{}, false
}

func boundsIntersectAny(bounds createTopLevelSectionLayoutRect, rects []createTopLevelSectionLayoutRect) bool {
	return createTopLevelSectionRectsIntersectAny(bounds, rects)
}

func findPositionAdjacentToBounds(
	bounds createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	rects []createTopLevelSectionLayoutRect,
	padding float64,
	step float64,
) (Position, bool) {
	rightBounds := createTopLevelSectionLayoutRect{
		X: bounds.X + bounds.W,
		Y: bounds.Y,
		W: newWidth + padding*2,
		H: bounds.H,
	}
	if position, ok := findPositionInBounds(rightBounds, newWidth, newHeight, rects, padding, step); ok {
		return position, true
	}

	bottomBounds := createTopLevelSectionLayoutRect{
		X: bounds.X,
		Y: bounds.Y + bounds.H,
		W: bounds.W,
		H: newHeight + padding*2,
	}
	return findPositionInBounds(bottomBounds, newWidth, newHeight, rects, padding, step)
}

func findPositionAfterExisting(
	rects []createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	padding float64,
	step float64,
) Position {
	bounds, ok := layoutBounds(rects)
	if !ok {
		return defaultCreateTopLevelSectionPosition(padding)
	}
	if position, ok := findPositionInBounds(
		expandCreateTopLevelSectionRect(bounds, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	); ok {
		return position
	}
	rightPosition, rightOK := findPositionInBounds(
		rightCreateTopLevelSectionBounds(bounds, newWidth, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	)
	bottomPosition, bottomOK := findPositionInBounds(
		bottomCreateTopLevelSectionBounds(bounds, newHeight, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	)
	return chooseCreateTopLevelSectionAdjacentPosition(
		bounds,
		rects,
		newWidth,
		newHeight,
		padding,
		rightPosition,
		rightOK,
		bottomPosition,
		bottomOK,
	)
}

func findDeterministicPositionAfterExisting(
	rects []createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	padding float64,
	step float64,
) Position {
	bounds, ok := layoutBounds(rects)
	if !ok {
		return defaultCreateTopLevelSectionPosition(padding)
	}

	if position, ok := findPositionInBounds(
		expandCreateTopLevelSectionRect(bounds, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	); ok {
		return position
	}
	if position, ok := findPositionInBounds(
		rightCreateTopLevelSectionBounds(bounds, newWidth, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	); ok {
		return position
	}
	if position, ok := findPositionInBounds(
		bottomCreateTopLevelSectionBounds(bounds, newHeight, padding),
		newWidth,
		newHeight,
		rects,
		padding,
		step,
	); ok {
		return position
	}
	return fallbackCreateTopLevelSectionPosition(rects, padding)
}

func resolveCreateTopLevelSectionViewportPosition(
	spec createTopLevelSectionPlacementSpec,
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	viewportBounds *ViewportBounds,
) (Position, *Position, bool) {
	bounds, ok := createTopLevelSectionViewportRect(viewportBounds)
	if !ok {
		return Position{}, nil, false
	}
	if !shouldUseCreateTopLevelSectionViewport(bounds, spec.rects) {
		position, panTo := createTopLevelSectionPositionWithPan(
			policy,
			implType,
			findPositionAfterExisting(spec.rects, spec.width, spec.height, spec.padding, spec.step),
			spec.width,
			spec.height,
		)
		return position, panTo, true
	}
	if position, ok := findPositionInBounds(bounds, spec.width, spec.height, spec.rects, spec.padding, spec.step); ok {
		return position, nil, true
	}
	position, ok := findPositionAdjacentToBounds(bounds, spec.width, spec.height, spec.rects, spec.padding, spec.step)
	if !ok {
		position = findPositionAfterExisting(spec.rects, spec.width, spec.height, spec.padding, spec.step)
	}
	position, panTo := createTopLevelSectionPositionWithPan(policy, implType, position, spec.width, spec.height)
	return position, panTo, true
}

func createTopLevelSectionViewportRect(bounds *ViewportBounds) (createTopLevelSectionLayoutRect, bool) {
	if bounds == nil || bounds.W <= 0 || bounds.H <= 0 {
		return createTopLevelSectionLayoutRect{}, false
	}
	return createTopLevelSectionLayoutRect{
		X: bounds.X,
		Y: bounds.Y,
		W: bounds.W,
		H: bounds.H,
	}, true
}

func shouldUseCreateTopLevelSectionViewport(
	bounds createTopLevelSectionLayoutRect,
	rects []createTopLevelSectionLayoutRect,
) bool {
	return len(rects) == 0 || boundsIntersectAny(bounds, rects)
}

func createTopLevelSectionPositionWithPan(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	position Position,
	newWidth float64,
	newHeight float64,
) (Position, *Position) {
	panTo := resolveCreateTopLevelSectionPanTarget(policy, implType, position, newWidth, newHeight)
	return position, &panTo
}

func defaultCreateTopLevelSectionPosition(padding float64) Position {
	return Position{X: padding, Y: padding}
}

func rightCreateTopLevelSectionBounds(
	bounds createTopLevelSectionLayoutRect,
	newWidth float64,
	padding float64,
) createTopLevelSectionLayoutRect {
	return createTopLevelSectionLayoutRect{
		X: bounds.X + bounds.W,
		Y: bounds.Y - padding,
		W: newWidth + padding*2,
		H: bounds.H + padding*2,
	}
}

func bottomCreateTopLevelSectionBounds(
	bounds createTopLevelSectionLayoutRect,
	newHeight float64,
	padding float64,
) createTopLevelSectionLayoutRect {
	return createTopLevelSectionLayoutRect{
		X: bounds.X - padding,
		Y: bounds.Y + bounds.H,
		W: bounds.W + padding*2,
		H: newHeight + padding*2,
	}
}

func chooseCreateTopLevelSectionAdjacentPosition(
	bounds createTopLevelSectionLayoutRect,
	rects []createTopLevelSectionLayoutRect,
	newWidth float64,
	newHeight float64,
	padding float64,
	rightPosition Position,
	rightOK bool,
	bottomPosition Position,
	bottomOK bool,
) Position {
	switch {
	case !rightOK && !bottomOK:
		return fallbackCreateTopLevelSectionPosition(rects, padding)
	case !rightOK:
		return bottomPosition
	case !bottomOK:
		return rightPosition
	}
	rightScore := candidateAspectScore(bounds, rightPosition, newWidth, newHeight)
	bottomScore := candidateAspectScore(bounds, bottomPosition, newWidth, newHeight)
	if rightScore != bottomScore {
		if bottomScore < rightScore {
			return bottomPosition
		}
		return rightPosition
	}
	if bounds.W < bounds.H {
		return rightPosition
	}
	return bottomPosition
}

func fallbackCreateTopLevelSectionPosition(
	rects []createTopLevelSectionLayoutRect,
	padding float64,
) Position {
	maxX := rects[0].X + rects[0].W
	minY := rects[0].Y
	for _, rect := range rects[1:] {
		maxX = max(maxX, rect.X+rect.W)
		minY = min(minY, rect.Y)
	}
	return Position{X: maxX + padding, Y: minY}
}

func candidateAspectScore(
	bounds createTopLevelSectionLayoutRect,
	candidate Position,
	newWidth float64,
	newHeight float64,
) float64 {
	minX := min(bounds.X, candidate.X)
	minY := min(bounds.Y, candidate.Y)
	maxX := max(bounds.X+bounds.W, candidate.X+newWidth)
	maxY := max(bounds.Y+bounds.H, candidate.Y+newHeight)
	width := maxX - minX
	height := maxY - minY
	if width <= 0 || height <= 0 {
		return 1.0e308
	}
	return max(width, height) / min(width, height)
}

func layoutBounds(rects []createTopLevelSectionLayoutRect) (createTopLevelSectionLayoutRect, bool) {
	if len(rects) == 0 {
		return createTopLevelSectionLayoutRect{}, false
	}
	minX := rects[0].X
	minY := rects[0].Y
	maxX := rects[0].X + rects[0].W
	maxY := rects[0].Y + rects[0].H
	for _, rect := range rects[1:] {
		minX = min(minX, rect.X)
		minY = min(minY, rect.Y)
		maxX = max(maxX, rect.X+rect.W)
		maxY = max(maxY, rect.Y+rect.H)
	}
	return createTopLevelSectionLayoutRect{
		X: minX,
		Y: minY,
		W: maxX - minX,
		H: maxY - minY,
	}, true
}

func createTopLevelSectionRectsIntersectAny(candidate createTopLevelSectionLayoutRect, rects []createTopLevelSectionLayoutRect) bool {
	for _, rect := range rects {
		if createTopLevelSectionRectsIntersect(candidate, rect) {
			return true
		}
	}
	return false
}

func createTopLevelSectionRectsIntersect(left createTopLevelSectionLayoutRect, right createTopLevelSectionLayoutRect) bool {
	return left.X < right.X+right.W &&
		left.X+left.W > right.X &&
		left.Y < right.Y+right.H &&
		left.Y+left.H > right.Y
}

func expandCreateTopLevelSectionRect(rect createTopLevelSectionLayoutRect, padding float64) createTopLevelSectionLayoutRect {
	return createTopLevelSectionLayoutRect{
		X: rect.X - padding,
		Y: rect.Y - padding,
		W: rect.W + padding*2,
		H: rect.H + padding*2,
	}
}

func resolveCreateTopLevelSectionPanTarget(
	policy AutoLayoutSectionSizingPolicy,
	implType string,
	position Position,
	newWidth float64,
	newHeight float64,
) Position {
	panXOffset := newWidth / 2
	if dimensions, ok := policy.ByType[implType]; ok {
		panXOffset = max(panXOffset, dimensions.MinWidth)
	}
	return Position{
		X: position.X + panXOffset,
		Y: position.Y + newHeight/2,
	}
}
