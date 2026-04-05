package projectstate

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrDrawAreaLayerIndexInvalid    = errors.New("draw layer index is invalid")
	ErrDrawAreaLayerItemTypeInvalid = errors.New("draw layer item type is invalid")
)

type DrawAreaLayerItemType string

const (
	DrawAreaLayerItemTypeImage       DrawAreaLayerItemType = "Image"
	DrawAreaLayerItemTypeBrushStroke DrawAreaLayerItemType = "BrushStroke"
)

type DrawAreaLayerItem struct {
	Type        DrawAreaLayerItemType `json:"type" ts_type:"typeof ArtifactTypeEnum.Image | typeof ArtifactTypeEnum.BrushStroke"`
	DataPath    string                `json:"dataPath"`
	TransformID string                `json:"transformId"`
}

func (p *Project) AppendDrawAreaLayerItem(sectionID string, layerIdx int, element DrawAreaLayerItem) error {
	section, _, payload, err := p.resolveDrawSectionMutationState(sectionID)
	if err != nil {
		return err
	}

	normalizedElement, err := normalizeDrawAreaLayerItem(element)
	if err != nil {
		return err
	}

	layers, err := cloneDrawAreaLayers(payload)
	if err != nil {
		return err
	}
	if layerIdx < 0 || layerIdx >= len(layers) {
		return fmt.Errorf("%w: %d", ErrDrawAreaLayerIndexInvalid, layerIdx)
	}

	targetLayer, ok := layers[layerIdx].(map[string]any)
	if !ok {
		return fmt.Errorf("draw layer payload %d must be an object", layerIdx)
	}

	elements, err := cloneDrawAreaLayerElements(targetLayer)
	if err != nil {
		return err
	}
	for _, rawElement := range elements {
		elementObject, ok := rawElement.(map[string]any)
		if !ok {
			return fmt.Errorf("draw layer element payload %d must be an object", layerIdx)
		}
		if payloadRawStringField(elementObject, "dataPath") == normalizedElement.DataPath {
			return nil
		}
	}

	targetLayer["elements"] = append(elements, drawAreaLayerItemObject(normalizedElement))
	layers[layerIdx] = targetLayer
	return p.setCurrentSectionField(section.ID, "layers", layers)
}

func (d *Document) AppendDrawAreaLayerItem(projectID string, sectionID string, layerIdx int, element DrawAreaLayerItem) error {
	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.AppendDrawAreaLayerItem(sectionID, layerIdx, element); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) AppendDrawAreaLayerItem(
	ctx context.Context,
	projectID string,
	sectionID string,
	layerIdx int,
	element DrawAreaLayerItem,
) (Snapshot, error) {
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.AppendDrawAreaLayerItem(projectID, sectionID, layerIdx, element); err != nil {
			return Document{}, err
		}
		return document, nil
	})
}

func (p *Project) resolveDrawSectionMutationState(sectionID string) (Section, SectionVariant, map[string]any, error) {
	return p.resolveTypedSectionMutationState(sectionID, "Draw", ErrDrawSectionRequired)
}

func normalizeDrawAreaLayerItem(element DrawAreaLayerItem) (DrawAreaLayerItem, error) {
	normalizedType, err := normalizeDrawAreaLayerItemType(element.Type)
	if err != nil {
		return DrawAreaLayerItem{}, err
	}
	return DrawAreaLayerItem{
		Type:        normalizedType,
		DataPath:    element.DataPath,
		TransformID: element.TransformID,
	}, nil
}

func normalizeDrawAreaLayerItemType(itemType DrawAreaLayerItemType) (DrawAreaLayerItemType, error) {
	switch DrawAreaLayerItemType(strings.TrimSpace(string(itemType))) {
	case DrawAreaLayerItemTypeImage:
		return DrawAreaLayerItemTypeImage, nil
	case DrawAreaLayerItemTypeBrushStroke:
		return DrawAreaLayerItemTypeBrushStroke, nil
	default:
		return "", ErrDrawAreaLayerItemTypeInvalid
	}
}

func cloneDrawAreaLayers(payload map[string]any) ([]any, error) {
	rawLayers, ok := payload["layers"]
	if !ok {
		return []any{}, nil
	}
	layers, ok := cloneProjectValue(rawLayers).([]any)
	if !ok {
		return nil, fmt.Errorf("draw section layers payload must be an array")
	}
	return layers, nil
}

func cloneDrawAreaLayerElements(layer map[string]any) ([]any, error) {
	rawElements, ok := layer["elements"]
	if !ok {
		return []any{}, nil
	}
	elements, ok := cloneProjectValue(rawElements).([]any)
	if !ok {
		return nil, fmt.Errorf("draw layer elements payload must be an array")
	}
	return elements, nil
}

func drawAreaLayerItemObject(element DrawAreaLayerItem) map[string]any {
	return map[string]any{
		"type":        string(element.Type),
		"dataPath":    element.DataPath,
		"transformId": element.TransformID,
	}
}
