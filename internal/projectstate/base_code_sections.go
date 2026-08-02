package projectstate

import "strings"

func isBaseCodeSectionTypeName(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "Code", "GenPythonCode", "GenPythonMetadata":
		return true
	default:
		return false
	}
}

func supportsBaseCodeSectionSemantics(impl SectionImpl, payload map[string]any) bool {
	if impl.IsBaseCodeSection() {
		return true
	}
	return isBaseCodeSectionTypeName(payloadStringField(payload, "type"))
}

func baseCodeSectionAttachmentState(impl SectionImpl, payload map[string]any) (string, []string) {
	children := payloadStringArrayField(payload, "children")
	attachedTerminalID := strings.TrimSpace(payloadStringField(payload, "attachedTerminalSectionId"))
	if impl.Code != nil {
		if len(children) == 0 && len(impl.Code.Children) != 0 {
			children = append([]string(nil), impl.Code.Children...)
		}
		if attachedTerminalID == "" {
			attachedTerminalID = strings.TrimSpace(impl.Code.AttachedTerminalSectionID)
		}
	}
	return attachedTerminalID, children
}

func setBaseCodeSectionAttachmentState(payload map[string]any, impl *SectionImpl, childIDs []string) {
	normalizedChildIDs := append([]string{}, childIDs...)
	payload["children"] = normalizedChildIDs

	attachedTerminalID := ""
	if len(normalizedChildIDs) != 0 {
		attachedTerminalID = normalizedChildIDs[0]
		payload["attachedTerminalSectionId"] = attachedTerminalID
	} else {
		delete(payload, "attachedTerminalSectionId")
	}

	if impl == nil || impl.Code == nil {
		return
	}
	impl.Code.Children = normalizedChildIDs
	impl.Code.AttachedTerminalSectionID = attachedTerminalID
}
