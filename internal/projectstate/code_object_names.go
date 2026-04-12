package projectstate

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

var (
	ErrCodeObjRenameUnsupported       = errors.New("code object rename is not supported for this section or code object type")
	ErrCodeObjActiveReferenceNotFound = errors.New("code object is not referenced by any active section")
	pythonIdentifierRegexp            = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
)

type InvalidCodeObjectNameError struct {
	Message string
}

func (e *InvalidCodeObjectNameError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func (d *Document) SetCodeObjectName(projectID string, codeObjID string, name string) error {
	if d == nil {
		return ErrProjectNotFound
	}

	project, err := d.ProjectByID(projectID)
	if err != nil {
		return err
	}
	if err := project.SetCodeObjectName(codeObjID, name); err != nil {
		return err
	}
	d.Projects[project.ID] = project
	return nil
}

func (r *Runtime) SetCodeObjectName(ctx context.Context, projectID string, codeObjID string, name string) (Snapshot, error) {
	if r == nil {
		return Snapshot{}, ErrRuntimeClosed
	}
	return r.MutateAndSave(ctx, func(document Document) (Document, error) {
		if err := document.SetCodeObjectName(projectID, codeObjID, name); err != nil {
			return document, err
		}
		return document, nil
	})
}

func (p *Project) SetCodeObjectName(codeObjID string, name string) error {
	if p == nil {
		return ErrProjectNotFound
	}

	trimmedCodeObjID := strings.TrimSpace(codeObjID)
	if trimmedCodeObjID == "" {
		return ErrCodeObjIDRequired
	}
	if _, ok := p.CodeObjs[trimmedCodeObjID]; !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, trimmedCodeObjID)
	}

	sectionIDs, err := activeSectionIDsForCodeObject(*p, trimmedCodeObjID)
	if err != nil {
		return err
	}

	var normalized string
	for _, sectionID := range sectionIDs {
		normalized, err = validateCodeObjectNameForSection(*p, sectionID, trimmedCodeObjID, name)
		if err != nil {
			return err
		}
	}

	codeObj := p.CodeObjs[trimmedCodeObjID]
	codeObj.Name = normalized
	p.CodeObjs[codeObj.ID] = codeObj
	return nil
}

func activeSectionIDsForCodeObject(project Project, codeObjID string) ([]string, error) {
	matches := make([]string, 0, len(project.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		section, variant, impl, err := project.ResolveSection(sectionID)
		if err != nil {
			return nil, err
		}
		payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
		if err != nil {
			return nil, err
		}
		sectionType := payloadStringField(payload, "type")
		if sectionType == "" {
			sectionType = fallbackSectionType(impl)
		}
		if sectionType == "" {
			continue
		}
		if _, ok := payloadStringMapField(payload, "codeObjVariantMap")[codeObjID]; ok {
			matches = append(matches, section.ID)
		}
	}
	if len(matches) == 0 {
		return nil, fmt.Errorf("%w: %q", ErrCodeObjActiveReferenceNotFound, codeObjID)
	}
	return matches, nil
}

type codeObjectNameValidationSection struct {
	sectionID         string
	sectionType       string
	sectionPayload    map[string]any
	codeObjVariantMap map[string]string
}

func resolveCodeObjectNameValidationSection(project Project, sectionID string) (codeObjectNameValidationSection, error) {
	section, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return codeObjectNameValidationSection{}, err
	}
	sectionPayload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		return codeObjectNameValidationSection{}, err
	}
	sectionType := payloadStringField(sectionPayload, "type")
	if sectionType == "" {
		sectionType = fallbackSectionType(impl)
	}
	return codeObjectNameValidationSection{
		sectionID:         section.ID,
		sectionType:       sectionType,
		sectionPayload:    sectionPayload,
		codeObjVariantMap: payloadStringMapField(sectionPayload, "codeObjVariantMap"),
	}, nil
}

func validateCodeObjectNameForSection(project Project, sectionID string, codeObjID string, name string) (string, error) {
	context, err := resolveCodeObjectNameValidationSection(project, sectionID)
	if err != nil {
		return "", err
	}
	return validateCodeObjectNameForResolvedSection(project, context, codeObjID, name)
}

func validateCodeObjectNameForResolvedSection(
	project Project,
	context codeObjectNameValidationSection,
	codeObjID string,
	name string,
) (string, error) {
	normalized, err := validateCodeObjectNameFormat(
		project,
		context.sectionPayload,
		context.sectionType,
		context.sectionID,
		codeObjID,
		name,
	)
	if err != nil {
		return "", err
	}
	if context.sectionType == "MetaControl" {
		return normalized, nil
	}
	if err := validateCodeObjectSiblingConflict(project, context, codeObjID, normalized); err != nil {
		return "", err
	}
	return normalized, nil
}

func validateParamCodeObjectNameForSection(project Project, sectionID string, codeObjID string, name string) (string, error) {
	context, err := resolveCodeObjectNameValidationSection(project, sectionID)
	if err != nil {
		return "", err
	}
	if context.sectionType == "MetaControl" {
		return "", fmt.Errorf("%w: section=%q type=%q", ErrCodeObjRenameUnsupported, context.sectionID, context.sectionType)
	}
	return validateCodeObjectNameForResolvedSection(project, context, codeObjID, name)
}

func validateCodeObjectNameFormat(
	project Project,
	sectionPayload map[string]any,
	sectionType string,
	sectionID string,
	codeObjID string,
	name string,
) (string, error) {
	normalized := strings.TrimSpace(name)
	payload, codeObjType, err := resolveCodeObjectRenamePayload(project, sectionID, codeObjID)
	if err != nil {
		return "", err
	}
	if err := ensureRenamableCodeObjectType(codeObjID, codeObjType); err != nil {
		return "", err
	}

	if normalized == "" {
		return normalized, validateEmptyCodeObjectName(sectionPayload, payload, codeObjID)
	}
	if err := validateNonEmptyCodeObjectName(project, sectionType, normalized); err != nil {
		return "", err
	}

	return normalized, nil
}

func validateCodeObjectSiblingConflict(
	project Project,
	context codeObjectNameValidationSection,
	codeObjID string,
	normalized string,
) error {
	rootCodeObjID := codeObjectRenameRootID(context.sectionPayload)
	if rootCodeObjID == "" {
		return fmt.Errorf("%w: section=%q type=%q", ErrCodeObjRenameUnsupported, context.sectionID, context.sectionType)
	}
	parentByID, childrenByID, err := collectCodeObjectHierarchy(project, context.codeObjVariantMap, rootCodeObjID)
	if err != nil {
		return err
	}
	parentID, ok := parentByID[codeObjID]
	if !ok {
		return fmt.Errorf("%w: section=%q codeObj=%q", ErrCodeObjActiveReferenceNotFound, context.sectionID, codeObjID)
	}
	if parentID == "" {
		return nil
	}
	return validateSiblingCodeObjectName(project, childrenByID[parentID], codeObjID, normalized)
}

func validateSiblingCodeObjectName(project Project, siblingIDs []string, codeObjID string, normalized string) error {
	for _, siblingID := range siblingIDs {
		if siblingID == codeObjID {
			continue
		}
		sibling, ok := project.CodeObjs[siblingID]
		if !ok {
			return fmt.Errorf("%w: %q", ErrCodeObjNotFound, siblingID)
		}
		if strings.TrimSpace(sibling.Name) == normalized {
			return &InvalidCodeObjectNameError{
				Message: fmt.Sprintf(`Param name "%s" already exists under this parent.`, normalized),
			}
		}
	}
	return nil
}

func resolveCodeObjectRenamePayload(project Project, sectionID string, codeObjID string) (map[string]any, string, error) {
	payload, _, _, impl, err := project.ResolveSectionCodeObject(sectionID, codeObjID)
	if err != nil {
		return nil, "", err
	}
	codeObjType := payloadStringField(payload, "type")
	if codeObjType == "" {
		codeObjType = strings.TrimSpace(impl.Type)
	}
	return payload, codeObjType, nil
}

func ensureRenamableCodeObjectType(codeObjID string, codeObjType string) error {
	if isRenamableCodeObjectType(codeObjType) {
		return nil
	}
	return fmt.Errorf("%w: codeObj=%q type=%q", ErrCodeObjRenameUnsupported, codeObjID, codeObjType)
}

func validateEmptyCodeObjectName(sectionPayload map[string]any, codeObjPayload map[string]any, codeObjID string) error {
	if payloadBoolField(codeObjPayload, "coreNameEditable") {
		return nil
	}
	if payloadStringField(sectionPayload, "topLevelParamId") == codeObjID {
		return nil
	}
	return &InvalidCodeObjectNameError{Message: "Param name cannot be empty."}
}

func validateNonEmptyCodeObjectName(project Project, sectionType string, normalized string) error {
	if containsControlChars(normalized) {
		return &InvalidCodeObjectNameError{Message: "Param name cannot include control characters."}
	}
	if sectionAllowsDictStyleParamNames(sectionType) {
		return nil
	}
	if err := validateCodeObjectNamePathShape(normalized); err != nil {
		return err
	}
	if !project.HasPythonCodegenTarget() {
		return nil
	}
	return validatePythonCodeObjectIdentifier(normalized)
}

func validateCodeObjectNamePathShape(normalized string) error {
	if strings.Contains(normalized, "/") || strings.Contains(normalized, "\\") {
		return &InvalidCodeObjectNameError{Message: "Param name cannot include path separators."}
	}
	if strings.Contains(normalized, "..") {
		return &InvalidCodeObjectNameError{Message: "Param name cannot include '..' path segments."}
	}
	return nil
}

func validatePythonCodeObjectIdentifier(normalized string) error {
	if !pythonIdentifierRegexp.MatchString(normalized) {
		return &InvalidCodeObjectNameError{Message: "Param name must be a valid Python identifier."}
	}
	if isPythonKeyword(normalized) {
		return &InvalidCodeObjectNameError{Message: "Param name cannot be a Python keyword."}
	}
	return nil
}

func codeObjectRenameRootID(sectionPayload map[string]any) string {
	if callableID := payloadStringField(sectionPayload, "callable"); callableID != "" {
		return callableID
	}
	if topLevelParamID := payloadStringField(sectionPayload, "topLevelParamId"); topLevelParamID != "" {
		return topLevelParamID
	}
	return ""
}

func (p Project) codeObjectAllowsEmptyName(codeObjID string) (bool, error) {
	codeObj, ok := p.CodeObjs[codeObjID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrCodeObjNotFound, codeObjID)
	}

	for _, variantID := range codeObj.VariantIDs {
		variant, ok := p.CodeObjVariants[variantID]
		if !ok {
			return false, fmt.Errorf("%w: %q", ErrCodeObjVariantNotFound, variantID)
		}
		impl, ok := p.CodeObjImpls[variant.ImplID]
		if !ok {
			return false, fmt.Errorf("%w: %q", ErrCodeObjImplNotFound, variant.ImplID)
		}
		payload, err := rawObjectFromProjectPayload(impl.Payload)
		if err != nil {
			return false, err
		}
		if payloadBoolField(payload, "coreNameEditable") {
			return true, nil
		}
	}

	for _, sectionID := range sortedProjectSectionIDs(p.SectionVariantMap) {
		variantID := p.SectionVariantMap[sectionID]
		section, ok := p.Sections[sectionID]
		if !ok {
			return false, fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
		}
		sectionPayload, err := effectiveSectionPayload(p, section.ID, variantID)
		if err != nil {
			return false, err
		}
		if payloadStringField(sectionPayload, "topLevelParamId") == codeObjID {
			return true, nil
		}
	}

	return false, nil
}

func collectCodeObjectHierarchy(project Project, codeObjVariantMap map[string]string, rootCodeObjID string) (map[string]string, map[string][]string, error) {
	parentByID := map[string]string{
		rootCodeObjID: "",
	}
	childrenByID := map[string][]string{}
	visited := map[string]struct{}{}

	var visit func(string) error
	visit = func(codeObjID string) error {
		if _, seen := visited[codeObjID]; seen {
			return nil
		}
		visited[codeObjID] = struct{}{}

		payload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, codeObjID)
		if err != nil {
			return err
		}
		children := payloadStringArrayField(payload, "children")
		childrenByID[codeObjID] = append([]string(nil), children...)
		for _, childID := range children {
			if existingParentID, ok := parentByID[childID]; ok && existingParentID != codeObjID {
				return fmt.Errorf("%w: codeObj=%q", ErrCodeObjRenameUnsupported, childID)
			}
			parentByID[childID] = codeObjID
			if err := visit(childID); err != nil {
				return err
			}
		}
		return nil
	}

	if err := visit(rootCodeObjID); err != nil {
		return nil, nil, err
	}
	return parentByID, childrenByID, nil
}

func sectionAllowsDictStyleParamNames(sectionType string) bool {
	switch strings.TrimSpace(sectionType) {
	case "Dict", "GlobalVariables":
		return true
	default:
		return false
	}
}

func isRenamableCodeObjectType(codeObjType string) bool {
	switch strings.TrimSpace(codeObjType) {
	case "ButtonParam",
		"CodeParam",
		"ColorPickerParam",
		"DateParam",
		"DropdownParam",
		"DropzoneParam",
		"NestedParam",
		"PasswordParam",
		"RotaryParam",
		"SliderParam",
		"SwitchParam",
		"TextAreaParam",
		"TextParam",
		"TimeParam":
		return true
	default:
		return false
	}
}

func isPythonKeyword(name string) bool {
	if name == "_" {
		return false
	}
	_, ok := pythonKeywords[name]
	return ok
}

var pythonKeywords = map[string]struct{}{
	"False":    {},
	"None":     {},
	"True":     {},
	"and":      {},
	"as":       {},
	"assert":   {},
	"async":    {},
	"await":    {},
	"break":    {},
	"case":     {},
	"class":    {},
	"continue": {},
	"def":      {},
	"del":      {},
	"elif":     {},
	"else":     {},
	"except":   {},
	"finally":  {},
	"for":      {},
	"from":     {},
	"global":   {},
	"if":       {},
	"import":   {},
	"in":       {},
	"is":       {},
	"lambda":   {},
	"match":    {},
	"nonlocal": {},
	"not":      {},
	"or":       {},
	"pass":     {},
	"raise":    {},
	"return":   {},
	"try":      {},
	"type":     {},
	"while":    {},
	"with":     {},
	"yield":    {},
}

func IsInvalidCodeObjectNameError(err error) bool {
	var target *InvalidCodeObjectNameError
	return errors.As(err, &target)
}
