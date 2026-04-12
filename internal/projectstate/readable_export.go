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

type readableProjectConfigSections struct {
	Sections                []ReadableSectionExport
	ParamNamePathsBySection map[string]map[string][]string
	OutputPortsBySection    map[string]map[string]string
}

type readableProjectExportSource struct {
	ID        string
	Name      string
	Project   Project
	IsDefault bool
}

type readableResolvedEdgeExport struct {
	SourcePath     string
	TargetPath     string
	SourceAccessor string
	TargetNamePath []string
}

func (d Document) BuildReadableProjectExport(opts ReadableExportOptions) (ReadableProjectExport, error) {
	defaultProject, orderedProjects, err := d.readableProjectExportSources()
	if err != nil {
		return ReadableProjectExport{}, err
	}
	configs, err := buildReadableProjectConfigExports(orderedProjects, opts)
	if err != nil {
		return ReadableProjectExport{}, err
	}

	return ReadableProjectExport{
		Version: 1,
		Project: ReadableProjectExportProject{
			DefaultConfig: defaultProject.Name,
		},
		Configs: configs,
	}, nil
}

func (d Document) readableProjectExportSources() (Project, []readableProjectExportSource, error) {
	defaultProjectID := strings.TrimSpace(d.DefaultProjectID)
	if defaultProjectID == "" {
		return Project{}, nil, fmt.Errorf("missing default project id")
	}
	defaultProject, err := d.ProjectByID(defaultProjectID)
	if err != nil {
		return Project{}, nil, err
	}

	sources := make([]readableProjectExportSource, 0, len(d.Projects))
	for projectID, project := range d.Projects {
		sources = append(sources, readableProjectExportSource{
			ID:        projectID,
			Name:      project.Name,
			Project:   project,
			IsDefault: projectID == defaultProjectID,
		})
	}
	sort.Slice(sources, func(leftIndex int, rightIndex int) bool {
		return readableProjectExportSourceLess(sources[leftIndex], sources[rightIndex])
	})
	return defaultProject, sources, nil
}

func readableProjectExportSourceLess(left readableProjectExportSource, right readableProjectExportSource) bool {
	if left.IsDefault != right.IsDefault {
		return left.IsDefault
	}
	if left.Name != right.Name {
		return left.Name < right.Name
	}
	return left.ID < right.ID
}

func buildReadableProjectConfigExports(
	sources []readableProjectExportSource,
	opts ReadableExportOptions,
) ([]ReadableProjectConfigExport, error) {
	configs := make([]ReadableProjectConfigExport, 0, len(sources))
	for _, source := range sources {
		configExport, err := buildReadableProjectConfigExport(source.Project, opts)
		if err != nil {
			return nil, err
		}
		configs = append(configs, configExport)
	}
	return configs, nil
}

func buildReadableProjectConfigExport(project Project, opts ReadableExportOptions) (ReadableProjectConfigExport, error) {
	sectionPathByID, orderedSectionIDs, err := buildReadableSectionPathIndex(project)
	if err != nil {
		return ReadableProjectConfigExport{}, err
	}

	sectionData, err := buildReadableProjectConfigSections(project, orderedSectionIDs, sectionPathByID, opts)
	if err != nil {
		return ReadableProjectConfigExport{}, err
	}

	edges, err := buildReadableEdgeExports(
		project,
		sectionPathByID,
		sectionData.ParamNamePathsBySection,
		sectionData.OutputPortsBySection,
	)
	if err != nil {
		return ReadableProjectConfigExport{}, err
	}

	exported := ReadableProjectConfigExport{
		Name:     project.Name,
		Sections: sectionData.Sections,
		Edges:    edges,
	}

	if err := applyReadableEntrySection(&exported, project, sectionPathByID); err != nil {
		return ReadableProjectConfigExport{}, err
	}

	return exported, nil
}

func buildReadableSectionPathIndex(project Project) (map[string]string, []string, error) {
	sectionPathByID := make(map[string]string, len(project.SectionVariantMap))
	for _, sectionID := range sortedProjectSectionIDs(project.SectionVariantMap) {
		fullName, err := activeSectionPathFullName(project, sectionID)
		if err != nil {
			return nil, nil, err
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

	return sectionPathByID, orderedSectionIDs, nil
}

func buildReadableProjectConfigSections(
	project Project,
	orderedSectionIDs []string,
	sectionPathByID map[string]string,
	opts ReadableExportOptions,
) (readableProjectConfigSections, error) {
	output := readableProjectConfigSections{
		Sections:                make([]ReadableSectionExport, 0, len(orderedSectionIDs)),
		ParamNamePathsBySection: make(map[string]map[string][]string, len(orderedSectionIDs)),
		OutputPortsBySection:    make(map[string]map[string]string, len(orderedSectionIDs)),
	}

	for _, sectionID := range orderedSectionIDs {
		section, variant, impl, payload, err := resolveReadableProjectSection(project, sectionID)
		if err != nil {
			return readableProjectConfigSections{}, err
		}

		paramData, err := collectReadableSectionParamData(project, payload)
		if err != nil {
			return readableProjectConfigSections{}, err
		}
		output.ParamNamePathsBySection[section.ID] = paramData.NamePaths
		output.OutputPortsBySection[section.ID] = collectReadableSectionOutputPorts(payload)

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
			return readableProjectConfigSections{}, err
		}
		output.Sections = append(output.Sections, sectionExport)
	}

	return output, nil
}

func resolveReadableProjectSection(project Project, sectionID string) (Section, SectionVariant, SectionImpl, map[string]any, error) {
	variantID, ok := project.SectionVariantMap[sectionID]
	if !ok {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, sectionID)
	}
	section, variant, impl, err := project.ResolveSectionWithVariant(sectionID, variantID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	payload, err := effectiveSectionPayload(project, section.ID, variant.ID)
	if err != nil {
		return Section{}, SectionVariant{}, SectionImpl{}, nil, err
	}
	return section, variant, impl, payload, nil
}

func applyReadableEntrySection(
	exported *ReadableProjectConfigExport,
	project Project,
	sectionPathByID map[string]string,
) error {
	entrySectionID := strings.TrimSpace(project.EntryCodeBlockID)
	if entrySectionID == "" {
		return nil
	}
	entryPath, ok := sectionPathByID[entrySectionID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrEntrySectionNotFound, entrySectionID)
	}
	exported.EntrySection = entryPath
	return nil
}

func collectReadableSectionParamData(project Project, payload map[string]any) (readableSectionParamData, error) {
	sectionType := resolveReadableSectionType(payload, SectionImpl{})
	codeObjVariantMap := payloadStringMapField(payload, "codeObjVariantMap")

	if data, handled, err := collectReadableMetaControlParamData(project, payload, sectionType, codeObjVariantMap); handled || err != nil {
		return data, err
	}
	if data, handled, err := collectReadableTopLevelParamData(project, payload, codeObjVariantMap); handled || err != nil {
		return data, err
	}
	if data, handled := collectReadableStaticSectionParamData(payload, sectionType); handled {
		return data, nil
	}
	if data, handled, err := collectReadableCallableParamData(project, payload, sectionType, codeObjVariantMap); handled || err != nil {
		return data, err
	}
	return readableSectionParamData{NamePaths: map[string][]string{}}, nil
}

func collectReadableMetaControlParamData(
	project Project,
	payload map[string]any,
	sectionType string,
	codeObjVariantMap map[string]string,
) (readableSectionParamData, bool, error) {
	paramID := payloadStringField(payload, "metaControlParamId")
	if strings.TrimSpace(paramID) == "" && sectionType != "MetaControl" {
		return readableSectionParamData{}, false, nil
	}
	if paramID == "" {
		return readableIncludedSectionParamData(readableParamHierarchy{
			NamePaths: map[string][]string{},
			Values:    map[string]any{},
		}), true, nil
	}
	hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, []string{paramID}, nil, true)
	if err != nil {
		return readableSectionParamData{}, true, err
	}
	return readableIncludedSectionParamData(hierarchy), true, nil
}

func collectReadableTopLevelParamData(
	project Project,
	payload map[string]any,
	codeObjVariantMap map[string]string,
) (readableSectionParamData, bool, error) {
	topLevelParamID := payloadStringField(payload, "topLevelParamId")
	if strings.TrimSpace(topLevelParamID) == "" {
		return readableSectionParamData{}, false, nil
	}
	rootPayload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, topLevelParamID)
	if err != nil {
		return readableSectionParamData{}, true, err
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
			return readableSectionParamData{}, true, err
		}
		return readableNamePathOnlySectionParamData(hierarchy), true, nil
	}
	hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, topLevelIDs, nil, true)
	if err != nil {
		return readableSectionParamData{}, true, err
	}
	return readableIncludedSectionParamData(hierarchy), true, nil
}

func collectReadableStaticSectionParamData(payload map[string]any, sectionType string) (readableSectionParamData, bool) {
	if sectionType != "Dict" && sectionType != "GlobalVariables" {
		return readableSectionParamData{}, false
	}
	if payloadBoolField(payload, "isJsonSource") {
		return readableSectionParamData{NamePaths: map[string][]string{}}, true
	}
	return readableIncludedSectionParamData(readableParamHierarchy{
		NamePaths: map[string][]string{},
		Values:    map[string]any{},
	}), true
}

func collectReadableCallableParamData(
	project Project,
	payload map[string]any,
	sectionType string,
	codeObjVariantMap map[string]string,
) (readableSectionParamData, bool, error) {
	if sectionType != "Callable" {
		return readableSectionParamData{}, false, nil
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		return readableIncludedSectionParamData(readableParamHierarchy{
			NamePaths: map[string][]string{},
			Values:    map[string]any{},
		}), true, nil
	}
	callablePayload, _, _, _, err := effectiveCodeObjectPayload(project, codeObjVariantMap, callableID)
	if err != nil {
		return readableSectionParamData{}, true, err
	}
	topLevelIDs := payloadStringArrayField(callablePayload, "children")
	hierarchy, err := traverseReadableParamHierarchy(project, codeObjVariantMap, topLevelIDs, nil, true)
	if err != nil {
		return readableSectionParamData{}, true, err
	}
	return readableIncludedSectionParamData(hierarchy), true, nil
}

func readableIncludedSectionParamData(hierarchy readableParamHierarchy) readableSectionParamData {
	return readableSectionParamData{
		NamePaths:     hierarchy.NamePaths,
		Values:        hierarchy.Values,
		IncludeParams: true,
	}
}

func readableNamePathOnlySectionParamData(hierarchy readableParamHierarchy) readableSectionParamData {
	return readableSectionParamData{
		NamePaths: hierarchy.NamePaths,
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
	exported := newReadableSectionExport(sectionPath, sectionType, variant, opts.IncludeVariants)

	if err := applyReadableCallableSectionExport(&exported, project, payload, sectionType); err != nil {
		return ReadableSectionExport{}, err
	}
	applyReadableSectionParamExport(&exported, payload, paramData)
	if err := applyReadableSectionChildrenExport(&exported, payload, sectionPathByID); err != nil {
		return ReadableSectionExport{}, err
	}
	applyReadableSectionTypeFields(&exported, payload, sectionType)

	files, err := collectReadableSectionFiles(payload, impl, variant, opts)
	if err != nil {
		return ReadableSectionExport{}, err
	}
	if len(files) > 0 {
		exported.Files = files
	}

	return exported, nil
}

func newReadableSectionExport(
	sectionPath string,
	sectionType string,
	variant SectionVariant,
	includeVariants bool,
) ReadableSectionExport {
	exported := ReadableSectionExport{
		Path: sectionPath,
		Type: sectionType,
	}
	if includeVariants {
		exported.Variant = readableStringPointer(variant.Name)
	}
	return exported
}

func applyReadableCallableSectionExport(
	exported *ReadableSectionExport,
	project Project,
	payload map[string]any,
	sectionType string,
) error {
	if sectionType != "Callable" {
		return nil
	}
	callableID := payloadStringField(payload, "callable")
	if callableID == "" {
		return nil
	}
	callable, ok := project.CodeObjs[callableID]
	if !ok {
		return fmt.Errorf("%w: %q", ErrCodeObjNotFound, callableID)
	}
	exported.Callable = readableStringPointer(callable.Name)
	return nil
}

func applyReadableSectionParamExport(
	exported *ReadableSectionExport,
	payload map[string]any,
	paramData readableSectionParamData,
) {
	if paramData.IncludeParams {
		params := cloneProjectObject(paramData.Values)
		exported.Params = &params
		return
	}
	if payloadBoolField(payload, "isJsonSource") {
		exported.JSONSourceKeys = append([]string(nil), payloadStringArrayField(payload, "jsonSourceKeys")...)
	}
}

func applyReadableSectionChildrenExport(
	exported *ReadableSectionExport,
	payload map[string]any,
	sectionPathByID map[string]string,
) error {
	children := payloadStringArrayField(payload, "children")
	if len(children) == 0 {
		return nil
	}
	exported.Children = make([]string, 0, len(children))
	for _, childID := range children {
		childPath, ok := sectionPathByID[childID]
		if !ok {
			return fmt.Errorf("missing child section path for %q", childID)
		}
		exported.Children = append(exported.Children, childPath)
	}
	return nil
}

func applyReadableSectionTypeFields(exported *ReadableSectionExport, payload map[string]any, sectionType string) {
	switch sectionType {
	case "TextBlock":
		exported.Text = readableStringPointer(payloadRawStringField(payload, "text"))
		exported.Format = readableStringPointer(payloadRawStringField(payload, "format"))
	case "Social":
		exported.URL = readableStringPointer(payloadRawStringField(payload, "url"))
	case "Browser":
		exported.Folder = readableStringPointer(payloadRawStringField(payload, "folder"))
	}
}

func collectReadableSectionFiles(
	payload map[string]any,
	impl SectionImpl,
	variant SectionVariant,
	opts ReadableExportOptions,
) (map[string]any, error) {
	files := map[string]any{}

	addReadableSectionFileIfPresent(files, "code", readableCodeFilePath(payload, impl))
	if err := addReadableJSONSourceFile(files, payload, variant, opts); err != nil {
		return nil, err
	}
	addReadableSectionFileIfPresent(files, "image", payloadRawStringField(payload, "imagePath"))
	addReadableSectionFileIfPresent(files, "chartData", payloadRawStringField(payload, "dataPath"))
	if drawAssets := collectReadableDrawAssets(payload); len(drawAssets) > 0 {
		files["drawAssets"] = drawAssets
	}
	addReadableSectionFileIfPresent(files, "drawRender", readableDrawRenderPath(payload, impl))
	if err := addReadableChatFile(files, payload, opts); err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, nil
	}
	return files, nil
}

func addReadableSectionFileIfPresent(files map[string]any, key string, value string) {
	if strings.TrimSpace(value) == "" {
		return
	}
	files[key] = value
}

func addReadableJSONSourceFile(
	files map[string]any,
	payload map[string]any,
	variant SectionVariant,
	opts ReadableExportOptions,
) error {
	if !payloadBoolField(payload, "isJsonSource") {
		return nil
	}
	resolvedPath, err := statefs.NormalizePath(variant.Name, strings.TrimSpace(opts.WorkspaceRoot))
	if err != nil {
		return fmt.Errorf("resolve readable json source path %q: %w", variant.Name, err)
	}
	files["jsonSource"] = resolvedPath
	return nil
}

func readableDrawRenderPath(payload map[string]any, impl SectionImpl) string {
	drawRenderPath := payloadRawStringField(payload, "renderedImagePath")
	if drawRenderPath == "" && impl.Draw != nil {
		drawRenderPath = strings.TrimSpace(impl.Draw.RenderedImagePath)
	}
	return drawRenderPath
}

func addReadableChatFile(files map[string]any, payload map[string]any, opts ReadableExportOptions) error {
	chatID := payloadStringField(payload, "chatId")
	if chatID == "" {
		return nil
	}
	settaFilesRoot := strings.TrimSpace(opts.SettaFilesRoot)
	if settaFilesRoot == "" {
		return fmt.Errorf("missing setta files root for readable chat export")
	}
	chatPath, err := statefs.NormalizePath(filepath.Join(settaFilesRoot, "chats", chatID+".json"), "")
	if err != nil {
		return fmt.Errorf("resolve readable chat path for %q: %w", chatID, err)
	}
	files["chat"] = chatPath
	return nil
}

func readableCodeFilePath(payload map[string]any, impl SectionImpl) string {
	rawBinding, ok := payload["codeFileBinding"]
	if ok {
		if binding, ok := rawBinding.(map[string]any); ok {
			if canonicalPath := payloadRawStringField(binding, "canonical_path"); canonicalPath != "" {
				return canonicalPath
			}
		}
	}
	if impl.Code != nil && impl.Code.Binding != nil {
		return strings.TrimSpace(impl.Code.Binding.Path)
	}
	return ""
}

func collectReadableDrawAssets(payload map[string]any) []string {
	layers, ok := payload["layers"].([]any)
	if !ok {
		return nil
	}
	seen := map[string]struct{}{}
	assets := make([]string, 0)
	for _, rawLayer := range layers {
		for _, rawElement := range readableLayerElements(rawLayer) {
			dataPath := readableDrawAssetPath(rawElement)
			if dataPath == "" || readableStringSetHas(seen, dataPath) {
				continue
			}
			readableStringSetAdd(seen, dataPath)
			assets = append(assets, dataPath)
		}
	}
	if len(assets) == 0 {
		return nil
	}
	return assets
}

func readableLayerElements(rawLayer any) []any {
	layer, ok := rawLayer.(map[string]any)
	if !ok {
		return nil
	}
	elements, _ := layer["elements"].([]any)
	return elements
}

func readableDrawAssetPath(rawElement any) string {
	element, ok := rawElement.(map[string]any)
	if !ok {
		return ""
	}
	return strings.TrimSpace(payloadRawStringField(element, "dataPath"))
}

func readableStringSetHas(values map[string]struct{}, key string) bool {
	_, exists := values[key]
	return exists
}

func readableStringSetAdd(values map[string]struct{}, key string) {
	values[key] = struct{}{}
}

func buildReadableEdgeExports(
	project Project,
	sectionPathByID map[string]string,
	paramNamePathsBySection map[string]map[string][]string,
	outputPortsBySection map[string]map[string]string,
) ([]ReadableEdgeExport, error) {
	output := make([]ReadableEdgeExport, 0, len(project.Edges))
	for _, edge := range project.Edges {
		resolved, include, err := resolveReadableEdgeExport(
			project,
			edge,
			sectionPathByID,
			paramNamePathsBySection,
			outputPortsBySection,
		)
		if err != nil {
			return nil, err
		}
		if !include {
			continue
		}
		output = append(output, ReadableEdgeExport{
			From: formatReadableEdgeSource(resolved.SourcePath, resolved.SourceAccessor),
			To:   formatReadableEdgeTarget(resolved.TargetPath, resolved.TargetNamePath),
		})
	}
	return output, nil
}

func resolveReadableEdgeExport(
	project Project,
	edge Edge,
	sectionPathByID map[string]string,
	paramNamePathsBySection map[string]map[string][]string,
	outputPortsBySection map[string]map[string]string,
) (readableResolvedEdgeExport, bool, error) {
	active, err := readableEdgeUsesActiveVariants(project.SectionVariantMap, edge)
	if err != nil || !active {
		return readableResolvedEdgeExport{}, active, err
	}

	sourcePath, err := readableSectionPathForEdge(sectionPathByID, edge.SourceSectionID)
	if err != nil {
		return readableResolvedEdgeExport{}, false, err
	}
	targetPath, err := readableSectionPathForEdge(sectionPathByID, edge.TargetSectionID)
	if err != nil {
		return readableResolvedEdgeExport{}, false, err
	}
	accessor, err := readableEdgeSourceAccessor(outputPortsBySection, edge)
	if err != nil {
		return readableResolvedEdgeExport{}, false, err
	}
	namePath, err := readableEdgeTargetNamePath(paramNamePathsBySection, edge)
	if err != nil {
		return readableResolvedEdgeExport{}, false, err
	}

	return readableResolvedEdgeExport{
		SourcePath:     sourcePath,
		TargetPath:     targetPath,
		SourceAccessor: accessor,
		TargetNamePath: namePath,
	}, true, nil
}

func readableEdgeUsesActiveVariants(sectionVariantMap map[string]string, edge Edge) (bool, error) {
	activeSourceVariantID, ok := sectionVariantMap[edge.SourceSectionID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, edge.SourceSectionID)
	}
	activeTargetVariantID, ok := sectionVariantMap[edge.TargetSectionID]
	if !ok {
		return false, fmt.Errorf("%w: %q", ErrSectionActiveVariantNotFound, edge.TargetSectionID)
	}
	return activeSourceVariantID == edge.SourceVariantID && activeTargetVariantID == edge.TargetVariantID, nil
}

func readableSectionPathForEdge(sectionPathByID map[string]string, sectionID string) (string, error) {
	sectionPath, ok := sectionPathByID[sectionID]
	if !ok {
		return "", fmt.Errorf("%w: %q", ErrSectionNotFound, sectionID)
	}
	return sectionPath, nil
}

func readableEdgeSourceAccessor(outputPortsBySection map[string]map[string]string, edge Edge) (string, error) {
	outputPorts, ok := outputPortsBySection[edge.SourceSectionID]
	if !ok {
		return "", fmt.Errorf("missing output ports for %q", edge.SourceSectionID)
	}
	accessor, ok := outputPorts[edge.SourcePortID]
	if !ok {
		return "", fmt.Errorf("missing edge output port %q for %q", edge.SourcePortID, edge.SourceSectionID)
	}
	return accessor, nil
}

func readableEdgeTargetNamePath(paramNamePathsBySection map[string]map[string][]string, edge Edge) ([]string, error) {
	namePaths, ok := paramNamePathsBySection[edge.TargetSectionID]
	if !ok {
		return nil, fmt.Errorf("missing params for %q", edge.TargetSectionID)
	}
	namePath, ok := namePaths[edge.TargetPortID]
	if !ok {
		return nil, fmt.Errorf("missing edge target param %q for %q", edge.TargetPortID, edge.TargetSectionID)
	}
	return namePath, nil
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
