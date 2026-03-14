package projectstate

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/statefs"
)

type ReadableExportOptions struct {
	IncludeVariants bool
	WorkspaceRoot   string
	SettaFilesRoot  string
}

type ReadableProjectExport struct {
	Version int                           `yaml:"version"`
	Project ReadableProjectExportProject  `yaml:"project"`
	Configs []ReadableProjectConfigExport `yaml:"configs"`
}

type ReadableProjectExportProject struct {
	DefaultConfig string `yaml:"defaultConfig"`
}

type ReadableProjectConfigExport struct {
	Name         string                  `yaml:"name"`
	EntrySection string                  `yaml:"entrySection,omitempty"`
	Sections     []ReadableSectionExport `yaml:"sections"`
	Edges        []ReadableEdgeExport    `yaml:"edges"`
}

type ReadableSectionExport struct {
	Path           string          `yaml:"path"`
	Type           string          `yaml:"type"`
	Variant        *string         `yaml:"variant,omitempty"`
	Callable       *string         `yaml:"callable,omitempty"`
	Params         *map[string]any `yaml:"params,omitempty"`
	JSONSourceKeys []string        `yaml:"jsonSourceKeys,omitempty"`
	Children       []string        `yaml:"children,omitempty"`
	Text           *string         `yaml:"text,omitempty"`
	Format         *string         `yaml:"format,omitempty"`
	URL            *string         `yaml:"url,omitempty"`
	Folder         *string         `yaml:"folder,omitempty"`
	Files          map[string]any  `yaml:"files,omitempty"`
}

type ReadableEdgeExport struct {
	From string `yaml:"from"`
	To   string `yaml:"to"`
}

type readableSectionParamData struct {
	NamePaths     map[string][]string
	Values        map[string]any
	IncludeParams bool
}

type readableParamHierarchy struct {
	NamePaths map[string][]string
	Values    map[string]any
}

func (d Document) BuildReadableProjectExport(opts ReadableExportOptions) (ReadableProjectExport, error) {
	defaultProjectID := strings.TrimSpace(d.DefaultProjectID)
	if defaultProjectID == "" {
		return ReadableProjectExport{}, fmt.Errorf("missing default project id")
	}

	defaultProject, err := d.ProjectByID(defaultProjectID)
	if err != nil {
		return ReadableProjectExport{}, err
	}

	projectIDs := make([]string, 0, len(d.Projects))
	for projectID := range d.Projects {
		projectIDs = append(projectIDs, projectID)
	}
	sort.Slice(projectIDs, func(leftIndex int, rightIndex int) bool {
		leftID := projectIDs[leftIndex]
		rightID := projectIDs[rightIndex]
		if leftID == defaultProjectID && rightID != defaultProjectID {
			return true
		}
		if rightID == defaultProjectID && leftID != defaultProjectID {
			return false
		}
		leftProject := d.Projects[leftID]
		rightProject := d.Projects[rightID]
		if leftProject.Name != rightProject.Name {
			return leftProject.Name < rightProject.Name
		}
		return leftID < rightID
	})

	configs := make([]ReadableProjectConfigExport, 0, len(projectIDs))
	for _, projectID := range projectIDs {
		project, err := d.ProjectByID(projectID)
		if err != nil {
			return ReadableProjectExport{}, err
		}
		configExport, err := buildReadableProjectConfigExport(project, opts)
		if err != nil {
			return ReadableProjectExport{}, err
		}
		configs = append(configs, configExport)
	}

	return ReadableProjectExport{
		Version: 1,
		Project: ReadableProjectExportProject{
			DefaultConfig: defaultProject.Name,
		},
		Configs: configs,
	}, nil
}

func buildReadableProjectConfigExport(project Project, opts ReadableExportOptions) (ReadableProjectConfigExport, error) {
	sectionPathByID := make(map[string]string, len(project.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		fullName, err := activeSectionPathFullName(project, sectionID)
		if err != nil {
			return ReadableProjectConfigExport{}, err
		}
		sectionPathByID[sectionID] = fullName
	}

	orderedSectionIDs := make([]string, 0, len(project.SectionVariantMap))
	for sectionID := range project.SectionVariantMap {
		orderedSectionIDs = append(orderedSectionIDs, sectionID)
	}
	sort.Slice(orderedSectionIDs, func(leftIndex int, rightIndex int) bool {
		leftID := orderedSectionIDs[leftIndex]
		rightID := orderedSectionIDs[rightIndex]
		leftPath := sectionPathByID[leftID]
		rightPath := sectionPathByID[rightID]
		if leftPath != rightPath {
			return leftPath < rightPath
		}
		return leftID < rightID
	})

	paramNamePathsBySection := make(map[string]map[string][]string, len(orderedSectionIDs))
	outputPortsBySection := make(map[string]map[string]string, len(orderedSectionIDs))
	sections := make([]ReadableSectionExport, 0, len(orderedSectionIDs))

	for _, sectionID := range orderedSectionIDs {
		variantID, ok := project.SectionVariantMap[sectionID]
		if !ok {
			return ReadableProjectConfigExport{}, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, sectionID)
		}
		section, variant, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
		if err != nil {
			return ReadableProjectConfigExport{}, err
		}
		payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
		if err != nil {
			return ReadableProjectConfigExport{}, err
		}

		paramData, err := collectReadableSectionParamData(project, payload)
		if err != nil {
			return ReadableProjectConfigExport{}, err
		}
		paramNamePathsBySection[section.ID] = paramData.NamePaths
		outputPortsBySection[section.ID] = collectReadableSectionOutputPorts(payload)

		sectionExport, err := buildReadableSectionExport(
			project,
			section,
			variant,
			impl,
			payload,
			sectionPathByID,
			paramData,
			opts,
		)
		if err != nil {
			return ReadableProjectConfigExport{}, err
		}
		sections = append(sections, sectionExport)
	}

	edges, err := buildReadableEdgeExports(project, sectionPathByID, paramNamePathsBySection, outputPortsBySection)
	if err != nil {
		return ReadableProjectConfigExport{}, err
	}

	exported := ReadableProjectConfigExport{
		Name:     project.Name,
		Sections: sections,
		Edges:    edges,
	}

	if entrySectionID := strings.TrimSpace(project.EntryCodeBlockID); entrySectionID != "" {
		entryPath, ok := sectionPathByID[entrySectionID]
		if !ok {
			return ReadableProjectConfigExport{}, fmt.Errorf("%w: %q", ErrEntrySectionNotFound, entrySectionID)
		}
		exported.EntrySection = entryPath
	}

	return exported, nil
}

func collectReadableSectionParamData(project Project, payload map[string]any) (readableSectionParamData, error) {
	sectionType := resolveReadableSectionType(payload, SectionImpl{})
	codeObjVariantMap := payloadStringMapField(payload, "codeObjVariantMap")

	switch {
	case strings.TrimSpace(payloadStringField(payload, "metaControlParamId")) != "" || sectionType == "MetaControl":
		paramID := payloadStringField(payload, "metaControlParamId")
		if paramID == "" {
			return readableSectionParamData{
				NamePaths:     map[string][]string{},
				Values:        map[string]any{},
				IncludeParams: true,
			}, nil
		}
		hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, []string{paramID}, nil, true)
		if err != nil {
			return readableSectionParamData{}, err
		}
		return readableSectionParamData{
			NamePaths:     hierarchy.NamePaths,
			Values:        hierarchy.Values,
			IncludeParams: true,
		}, nil
	case strings.TrimSpace(payloadStringField(payload, "topLevelParamId")) != "":
		topLevelParamID := payloadStringField(payload, "topLevelParamId")
		rootPayload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, topLevelParamID)
		if err != nil {
			return readableSectionParamData{}, err
		}
		topLevelIDs := payloadStringArrayField(rootPayload, "children")
		if payloadBoolField(payload, "isJsonSource") {
			hierarchy, err := traverseReadableParamHierarchy(
				project,
				codeObjVariantMap,
				topLevelIDs,
				payloadStringArrayField(payload, "jsonSourceKeys"),
				false,
			)
			if err != nil {
				return readableSectionParamData{}, err
			}
			return readableSectionParamData{
				NamePaths: hierarchy.NamePaths,
			}, nil
		}
		hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, topLevelIDs, nil, true)
		if err != nil {
			return readableSectionParamData{}, err
		}
		return readableSectionParamData{
			NamePaths:     hierarchy.NamePaths,
			Values:        hierarchy.Values,
			IncludeParams: true,
		}, nil
	case sectionType == "Dict" || sectionType == "GlobalVariables":
		return readableSectionParamData{
			NamePaths:     map[string][]string{},
			Values:        map[string]any{},
			IncludeParams: !payloadBoolField(payload, "isJsonSource"),
		}, nil
	case sectionType == "Callable":
		callableID := payloadStringField(payload, "callable")
		if callableID == "" {
			return readableSectionParamData{
				NamePaths:     map[string][]string{},
				Values:        map[string]any{},
				IncludeParams: true,
			}, nil
		}
		callablePayload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, callableID)
		if err != nil {
			return readableSectionParamData{}, err
		}
		topLevelIDs := payloadStringArrayField(callablePayload, "children")
		hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, topLevelIDs, nil, true)
		if err != nil {
			return readableSectionParamData{}, err
		}
		return readableSectionParamData{
			NamePaths:     hierarchy.NamePaths,
			Values:        hierarchy.Values,
			IncludeParams: true,
		}, nil
	default:
		return readableSectionParamData{
			NamePaths: map[string][]string{},
		}, nil
	}
}

func traverseReadableParamHierarchy(
	project Project,
	codeObjVariantMap map[string]string,
	topLevelIDs []string,
	namePathPrefix []string,
	buildNested bool,
) (readableParamHierarchy, error) {
	output := readableParamHierarchy{
		NamePaths: map[string][]string{},
		Values:    map[string]any{},
	}
	type stackEntry struct {
		CodeObjID string
		NamePath  []string
	}

	stack := make([]stackEntry, 0, len(topLevelIDs))
	for index := len(topLevelIDs) - 1; index >= 0; index-- {
		codeObjID := strings.TrimSpace(topLevelIDs[index])
		if codeObjID == "" {
			continue
		}
		stack = append(stack, stackEntry{
			CodeObjID: codeObjID,
			NamePath:  append([]string(nil), namePathPrefix...),
		})
	}

	visited := map[string]struct{}{}
	for len(stack) > 0 {
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if _, ok := visited[current.CodeObjID]; ok {
			continue
		}
		visited[current.CodeObjID] = struct{}{}

		payload, codeObj, _, impl, err := effectiveCodeObjectPayload(project, codeObjVariantMap, current.CodeObjID)
		if err != nil {
			return readableParamHierarchy{}, err
		}

		namePath := append(append([]string(nil), current.NamePath...), codeObj.Name)
		output.NamePaths[current.CodeObjID] = append([]string(nil), namePath...)
		if buildNested && len(namePath) > 0 {
			if readableCodeObjectIsParent(payload, impl) {
				setReadableNestedValue(output.Values, namePath, map[string]any{})
			} else {
				setReadableNestedValue(output.Values, namePath, readableCodeObjectValue(payload))
			}
		}

		children := payloadStringArrayField(payload, "children")
		for index := len(children) - 1; index >= 0; index-- {
			childID := strings.TrimSpace(children[index])
			if childID == "" {
				continue
			}
			stack = append(stack, stackEntry{
				CodeObjID: childID,
				NamePath:  namePath,
			})
		}
	}

	return output, nil
}

func readableCodeObjectIsParent(payload map[string]any, impl CodeObjectImpl) bool {
	switch strings.TrimSpace(payloadStringField(payload, "type")) {
	case "NestedParam", "CodeCallable":
		return true
	}
	if len(payloadStringArrayField(payload, "children")) > 0 {
		return true
	}
	return impl.Type == "NestedParam" || impl.Type == "CodeCallable"
}

func readableCodeObjectValue(payload map[string]any) any {
	value, ok := payload["value"]
	if !ok {
		return nil
	}
	typedString, ok := value.(string)
	if !ok {
		return cloneProjectValue(value)
	}
	var decoded any
	if err := json.Unmarshal([]byte(typedString), &decoded); err == nil {
		return decoded
	}
	return typedString
}

func setReadableNestedValue(root map[string]any, path []string, value any) {
	if len(path) == 0 {
		return
	}
	current := root
	for _, key := range path[:len(path)-1] {
		next, ok := current[key].(map[string]any)
		if !ok {
			next = map[string]any{}
			current[key] = next
		}
		current = next
	}
	current[path[len(path)-1]] = cloneProjectValue(value)
}

func collectReadableSectionOutputPorts(payload map[string]any) map[string]string {
	rawPorts, ok := payload["edgeOutputPorts"]
	if !ok {
		return map[string]string{}
	}
	portEntries, ok := rawPorts.([]any)
	if !ok {
		return map[string]string{}
	}
	output := make(map[string]string, len(portEntries))
	for _, rawEntry := range portEntries {
		entry, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		portID := strings.TrimSpace(payloadRawStringField(entry, "id"))
		if portID == "" {
			continue
		}
		output[portID] = payloadRawStringField(entry, "accessor")
	}
	return output
}

func buildReadableSectionExport(
	project Project,
	section Section,
	variant SectionVariant,
	impl SectionImpl,
	payload map[string]any,
	sectionPathByID map[string]string,
	paramData readableSectionParamData,
	opts ReadableExportOptions,
) (ReadableSectionExport, error) {
	sectionPath, ok := sectionPathByID[section.ID]
	if !ok {
		return ReadableSectionExport{}, fmt.Errorf("missing section path for %q", section.ID)
	}

	sectionType := resolveReadableSectionType(payload, impl)
	exported := ReadableSectionExport{
		Path: sectionPath,
		Type: sectionType,
	}

	if opts.IncludeVariants {
		exported.Variant = readableStringPointer(variant.Name)
	}

	if sectionType == "Callable" {
		callableID := payloadStringField(payload, "callable")
		if callableID != "" {
			callable, ok := project.CodeObjs[callableID]
			if !ok {
				return ReadableSectionExport{}, fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
			}
			exported.Callable = readableStringPointer(callable.Name)
		}
	}

	if paramData.IncludeParams {
		params := cloneProjectObject(paramData.Values)
		exported.Params = &params
	} else if payloadBoolField(payload, "isJsonSource") {
		exported.JSONSourceKeys = append([]string(nil), payloadStringArrayField(payload, "jsonSourceKeys")...)
	}

	children := payloadStringArrayField(payload, "children")
	if len(children) > 0 {
		exported.Children = make([]string, 0, len(children))
		for _, childID := range children {
			childPath, ok := sectionPathByID[childID]
			if !ok {
				return ReadableSectionExport{}, fmt.Errorf("missing child section path for %q", childID)
			}
			exported.Children = append(exported.Children, childPath)
		}
	}

	switch sectionType {
	case "TextBlock":
		exported.Text = readableStringPointer(payloadRawStringField(payload, "text"))
		exported.Format = readableStringPointer(payloadRawStringField(payload, "format"))
	case "Social":
		exported.URL = readableStringPointer(payloadRawStringField(payload, "url"))
	case "Browser":
		exported.Folder = readableStringPointer(payloadRawStringField(payload, "folder"))
	}

	files, err := collectReadableSectionFiles(payload, impl, variant, opts)
	if err != nil {
		return ReadableSectionExport{}, err
	}
	if len(files) > 0 {
		exported.Files = files
	}

	return exported, nil
}

func collectReadableSectionFiles(
	payload map[string]any,
	impl SectionImpl,
	variant SectionVariant,
	opts ReadableExportOptions,
) (map[string]any, error) {
	files := map[string]any{}

	if codePath := readableCodeFilePath(payload, impl); codePath != "" {
		files["code"] = codePath
	}
	if payloadBoolField(payload, "isJsonSource") {
		resolvedPath, err := statefs.NormalizePath(variant.Name, strings.TrimSpace(opts.WorkspaceRoot))
		if err != nil {
			return nil, fmt.Errorf("resolve readable json source path %q: %w", variant.Name, err)
		}
		files["jsonSource"] = resolvedPath
	}
	if imagePath := payloadRawStringField(payload, "imagePath"); imagePath != "" {
		files["image"] = imagePath
	}
	if chartDataPath := payloadRawStringField(payload, "dataPath"); chartDataPath != "" {
		files["chartData"] = chartDataPath
	}
	if drawAssets := collectReadableDrawAssets(payload); len(drawAssets) > 0 {
		files["drawAssets"] = drawAssets
	}

	drawRenderPath := payloadRawStringField(payload, "renderedImagePath")
	if drawRenderPath == "" && impl.Draw != nil {
		drawRenderPath = strings.TrimSpace(impl.Draw.RenderedImagePath)
	}
	if drawRenderPath != "" {
		files["drawRender"] = drawRenderPath
	}

	if chatID := payloadStringField(payload, "chatId"); chatID != "" {
		settaFilesRoot := strings.TrimSpace(opts.SettaFilesRoot)
		if settaFilesRoot == "" {
			return nil, fmt.Errorf("missing setta files root for readable chat export")
		}
		chatPath, err := statefs.NormalizePath(filepath.Join(settaFilesRoot, "chats", chatID+".json"), "")
		if err != nil {
			return nil, fmt.Errorf("resolve readable chat path for %q: %w", chatID, err)
		}
		files["chat"] = chatPath
	}

	if len(files) == 0 {
		return nil, nil
	}
	return files, nil
}

func readableCodeFilePath(payload map[string]any, impl SectionImpl) string {
	rawBinding, ok := payload["codeFileBinding"]
	if ok {
		if binding, ok := rawBinding.(map[string]any); ok {
			if canonicalPath := payloadRawStringField(binding, "canonical_path"); canonicalPath != "" {
				return canonicalPath
			}
			if path := payloadRawStringField(binding, "path"); path != "" {
				return path
			}
		}
	}
	if impl.Code != nil && impl.Code.Binding != nil {
		return strings.TrimSpace(impl.Code.Binding.Path)
	}
	return ""
}

func collectReadableDrawAssets(payload map[string]any) []string {
	rawLayers, ok := payload["layers"]
	if !ok {
		return nil
	}
	layers, ok := rawLayers.([]any)
	if !ok {
		return nil
	}
	seen := map[string]struct{}{}
	assets := make([]string, 0)
	for _, rawLayer := range layers {
		layer, ok := rawLayer.(map[string]any)
		if !ok {
			continue
		}
		rawElements, ok := layer["elements"]
		if !ok {
			continue
		}
		elements, ok := rawElements.([]any)
		if !ok {
			continue
		}
		for _, rawElement := range elements {
			element, ok := rawElement.(map[string]any)
			if !ok {
				continue
			}
			dataPath := strings.TrimSpace(payloadRawStringField(element, "dataPath"))
			if dataPath == "" {
				continue
			}
			if _, exists := seen[dataPath]; exists {
				continue
			}
			seen[dataPath] = struct{}{}
			assets = append(assets, dataPath)
		}
	}
	if len(assets) == 0 {
		return nil
	}
	return assets
}

func buildReadableEdgeExports(
	project Project,
	sectionPathByID map[string]string,
	paramNamePathsBySection map[string]map[string][]string,
	outputPortsBySection map[string]map[string]string,
) ([]ReadableEdgeExport, error) {
	output := make([]ReadableEdgeExport, 0, len(project.Edges))
	for _, edge := range project.Edges {
		activeSourceVariantID, ok := project.SectionVariantMap[edge.SourceSectionID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, edge.SourceSectionID)
		}
		activeTargetVariantID, ok := project.SectionVariantMap[edge.TargetSectionID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, edge.TargetSectionID)
		}
		if activeSourceVariantID != edge.SourceVariantID || activeTargetVariantID != edge.TargetVariantID {
			continue
		}

		sourcePath, ok := sectionPathByID[edge.SourceSectionID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, edge.SourceSectionID)
		}
		targetPath, ok := sectionPathByID[edge.TargetSectionID]
		if !ok {
			return nil, fmt.Errorf("%w: %q", ErrSectionNotFound, edge.TargetSectionID)
		}

		outputPorts, ok := outputPortsBySection[edge.SourceSectionID]
		if !ok {
			return nil, fmt.Errorf("missing output ports for %q", edge.SourceSectionID)
		}
		accessor, ok := outputPorts[edge.SourcePortID]
		if !ok {
			return nil, fmt.Errorf("missing edge output port %q for %q", edge.SourcePortID, edge.SourceSectionID)
		}

		namePaths, ok := paramNamePathsBySection[edge.TargetSectionID]
		if !ok {
			return nil, fmt.Errorf("missing params for %q", edge.TargetSectionID)
		}
		namePath, ok := namePaths[edge.TargetPortID]
		if !ok {
			return nil, fmt.Errorf("missing edge target param %q for %q", edge.TargetPortID, edge.TargetSectionID)
		}

		output = append(output, ReadableEdgeExport{
			From: formatReadableEdgeSource(sourcePath, accessor),
			To:   formatReadableEdgeTarget(targetPath, namePath),
		})
	}
	return output, nil
}

func formatReadableEdgeSource(sectionPath string, accessor string) string {
	cleaned := strings.TrimSpace(accessor)
	if cleaned == "" {
		return sectionPath + ".out.result"
	}
	if strings.HasPrefix(cleaned, ".") {
		cleaned = cleaned[1:]
	}
	if strings.HasPrefix(cleaned, "[") {
		return sectionPath + ".out" + cleaned
	}
	return sectionPath + ".out." + cleaned
}

func formatReadableEdgeTarget(sectionPath string, paramNamePath []string) string {
	return sectionPath + ".param." + strings.Join(paramNamePath, ".")
}

func resolveReadableSectionType(payload map[string]any, impl SectionImpl) string {
	if sectionType := payloadStringField(payload, "type"); sectionType != "" {
		return sectionType
	}
	return fallbackSectionType(impl)
}

func readableStringPointer(value string) *string {
	return &value
}
