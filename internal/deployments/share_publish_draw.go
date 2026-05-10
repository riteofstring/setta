package deployments

import (
	"strings"

	"setta/internal/projectstate"
)

func rawAttachmentList(value any) []any {
	attachments, ok := value.([]any)
	if !ok {
		return nil
	}
	return attachments
}

func (p *SharePublisher) rewriteDrawLayers(payload map[string]any, deploymentRoot string, pathMap map[string]string) ([]any, bool, error) {
	layers, ok := rawDrawLayerList(payload["layers"])
	if !ok {
		return nil, false, nil
	}

	return p.rewriteDrawLayerList(layers, deploymentRoot, pathMap)
}

func rawDrawLayerList(value any) ([]any, bool) {
	layers, ok := value.([]any)
	return layers, ok
}

func (p *SharePublisher) rewriteDrawLayerList(
	layers []any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	changed := false
	updatedLayers := make([]any, len(layers))
	for layerIndex, rawLayer := range layers {
		updatedLayer, layerChanged, err := p.rewriteDrawLayer(rawLayer, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		updatedLayers[layerIndex] = updatedLayer
		if layerChanged {
			changed = true
		}
	}

	return updatedLayers, changed, nil
}

func (p *SharePublisher) rewriteDrawLayer(
	rawLayer any,
	deploymentRoot string,
	pathMap map[string]string,
) (any, bool, error) {
	layerObject, ok := rawLayer.(map[string]any)
	if !ok {
		return rawLayer, false, nil
	}

	nextLayer := cloneJSONObject(layerObject)
	updatedElements, changed, err := p.rewriteDrawElements(nextLayer["elements"], deploymentRoot, pathMap)
	if err != nil {
		return nil, false, err
	}
	if updatedElements != nil {
		nextLayer["elements"] = updatedElements
	}
	return nextLayer, changed, nil
}

func (p *SharePublisher) rewriteDrawElements(
	rawElements any,
	deploymentRoot string,
	pathMap map[string]string,
) ([]any, bool, error) {
	elements, ok := rawElements.([]any)
	if !ok {
		return nil, false, nil
	}

	changed := false
	updatedElements := make([]any, len(elements))
	for elementIndex, rawElement := range elements {
		updatedElement, elementChanged, err := p.rewriteDrawElement(rawElement, deploymentRoot, pathMap)
		if err != nil {
			return nil, false, err
		}
		updatedElements[elementIndex] = updatedElement
		if elementChanged {
			changed = true
		}
	}
	return updatedElements, changed, nil
}

func (p *SharePublisher) rewriteDrawElement(
	rawElement any,
	deploymentRoot string,
	pathMap map[string]string,
) (any, bool, error) {
	elementObject, ok := rawElement.(map[string]any)
	if !ok {
		return rawElement, false, nil
	}

	nextElement := cloneJSONObject(elementObject)
	changed, err := p.rewriteArtifactObjectFields(nextElement, deploymentRoot, pathMap, "dataPath", "transformId")
	if err != nil {
		return nil, false, err
	}
	return nextElement, changed, nil
}

func (p *SharePublisher) rewriteArtifactObjectFields(
	payload map[string]any,
	deploymentRoot string,
	pathMap map[string]string,
	fieldNames ...string,
) (bool, error) {
	changed := false
	for _, fieldName := range fieldNames {
		fieldChanged, err := p.rewriteArtifactObjectField(payload, fieldName, deploymentRoot, pathMap)
		if err != nil {
			return false, err
		}
		if fieldChanged {
			changed = true
		}
	}
	return changed, nil
}

func (p *SharePublisher) rewriteArtifactObjectField(
	payload map[string]any,
	fieldName string,
	deploymentRoot string,
	pathMap map[string]string,
) (bool, error) {
	sourcePath := stringField(payload, fieldName)
	if sourcePath == "" {
		return false, nil
	}

	rebased, err := p.copyArtifactPath(sourcePath, deploymentRoot, pathMap)
	if err != nil {
		return false, err
	}
	payload[fieldName] = rebased
	return true, nil
}

func buildJSONSourcePayload(project projectstate.Project, sectionPayload map[string]any) (map[string]any, error) {
	payload := map[string]any{}
	keyPath := stringSliceField(sectionPayload, "jsonSourceKeys")
	addKeyPath(payload, keyPath)

	topLevelParamID := stringField(sectionPayload, "topLevelParamId")
	if topLevelParamID == "" {
		return payload, nil
	}

	codeObjVariantMap := stringMapField(sectionPayload, "codeObjVariantMap")
	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, topLevelParamID)
	if err != nil {
		return nil, err
	}

	for _, childID := range stringSliceField(rootPayload, "children") {
		if err := buildJSONSourcePayloadForCodeObject(payload, keyPath, project, codeObjVariantMap, childID); err != nil {
			return nil, err
		}
	}
	return payload, nil
}

func buildJSONSourcePayloadForCodeObject(
	root map[string]any,
	parentPath []string,
	project projectstate.Project,
	codeObjVariantMap map[string]string,
	codeObjID string,
) error {
	payload, codeObj, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, codeObjID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(codeObj.Name) == "" {
		return projectstate.ErrCodeObjNameRequired
	}

	currentPath := append(append([]string(nil), parentPath...), codeObj.Name)
	children := stringSliceField(payload, "children")
	if len(children) == 0 {
		setKeyPathValue(root, currentPath, tryJSONValue(rawStringField(payload, "value")))
		return nil
	}

	addKeyPath(root, currentPath)
	for _, childID := range children {
		if err := buildJSONSourcePayloadForCodeObject(root, currentPath, project, codeObjVariantMap, childID); err != nil {
			return err
		}
	}
	return nil
}
