package agenticsummarycache

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"setta/internal/projectstate"
	"setta/internal/statefs"
)

const (
	FileName              = "agentic_summary_cache.json"
	currentCacheVersion   = 1
	MaxSummariesPerRun    = 6
	maxSummaryPromptChars = 18_000
	drawLayerNameLimit    = 8
	drawAssetPathLimit    = 8
	valuePreviewCharLimit = 120
	truncationSuffix      = "\n\n[...truncated...]"
	commandSectionType    = "Code"
	textBlockSectionType  = "TextBlock"
	imageSectionType      = "Image"
	callableSectionType   = "Callable"
	chartSectionType      = "Chart"
	drawSectionType       = "Draw"
	promptSectionType     = "Prompt"
	socialSectionType     = "Social"
	browserSectionType    = "Browser"
	summaryContextMode    = "summary"
	sectionChatEdgeKind   = "section_chat"
)

var (
	ErrSettaFilesRootRequired = errors.New("agentic summary cache setta files root is required")
	ErrChatSectionNotFound    = errors.New("chat section not found in project")
)

type Status struct {
	MaxSummariesPerRun     int      `json:"maxSummariesPerRun"`
	SummarySectionIDs      []string `json:"summarySectionIds"`
	CachedSectionIDs       []string `json:"cachedSectionIds"`
	MissingSectionIDs      []string `json:"missingSectionIds"`
	EmptySourceSectionIDs  []string `json:"emptySourceSectionIds"`
	ConsideredSectionIDs   []string `json:"consideredSectionIds"`
	WouldAttemptSectionIDs []string `json:"wouldAttemptSectionIds"`
}

type Service struct {
	path string
}

func NewService(settaFilesRoot string) (*Service, error) {
	resolvedRoot, err := statefs.NormalizePath(settaFilesRoot, "")
	if err != nil {
		if strings.TrimSpace(settaFilesRoot) == "" {
			return nil, ErrSettaFilesRootRequired
		}
		return nil, err
	}
	return &Service{
		path: filepath.Join(resolvedRoot, FileName),
	}, nil
}

func (s *Service) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Service) BuildStatusForChat(project projectstate.Project, chatSectionID string) (Status, error) {
	status := Status{
		MaxSummariesPerRun:     MaxSummariesPerRun,
		SummarySectionIDs:      []string{},
		CachedSectionIDs:       []string{},
		MissingSectionIDs:      []string{},
		EmptySourceSectionIDs:  []string{},
		ConsideredSectionIDs:   []string{},
		WouldAttemptSectionIDs: []string{},
	}
	if s == nil || strings.TrimSpace(s.path) == "" {
		return status, ErrSettaFilesRootRequired
	}

	normalizedChatSectionID := strings.TrimSpace(chatSectionID)
	if normalizedChatSectionID == "" {
		return status, fmt.Errorf("%w: chat section id is required", ErrChatSectionNotFound)
	}
	if _, ok := project.Sections[normalizedChatSectionID]; !ok {
		return status, fmt.Errorf("%w: %q", ErrChatSectionNotFound, normalizedChatSectionID)
	}

	summarySectionIDs := resolveSummarySectionIDs(project, normalizedChatSectionID)
	if len(summarySectionIDs) == 0 {
		return status, nil
	}
	status.SummarySectionIDs = append([]string(nil), summarySectionIDs...)

	entries, err := s.readEntries()
	if err != nil {
		return Status{}, err
	}

	emptyBySectionID := make(map[string]bool, len(summarySectionIDs))
	for _, sectionID := range summarySectionIDs {
		source, err := buildSectionSummarySource(project, sectionID)
		if err != nil {
			return Status{}, err
		}

		isEmptySource := strings.TrimSpace(source.RawText) == ""
		emptyBySectionID[sectionID] = isEmptySource
		if isEmptySource {
			status.EmptySourceSectionIDs = append(status.EmptySourceSectionIDs, sectionID)
		}

		cacheKey := buildCacheKey(project.ID, sectionID, source.VariantID, source.ContentHash)
		if cachedSummaryFromEntry(entries[cacheKey]) != "" {
			status.CachedSectionIDs = append(status.CachedSectionIDs, sectionID)
			continue
		}
		status.MissingSectionIDs = append(status.MissingSectionIDs, sectionID)
	}

	if len(status.MissingSectionIDs) > MaxSummariesPerRun {
		status.ConsideredSectionIDs = append([]string(nil), status.MissingSectionIDs[:MaxSummariesPerRun]...)
	} else {
		status.ConsideredSectionIDs = append([]string(nil), status.MissingSectionIDs...)
	}
	for _, sectionID := range status.ConsideredSectionIDs {
		if emptyBySectionID[sectionID] {
			continue
		}
		status.WouldAttemptSectionIDs = append(status.WouldAttemptSectionIDs, sectionID)
	}

	return status, nil
}

type sectionSummarySource struct {
	VariantID   string
	RawText     string
	ContentHash string
}

func buildSectionSummarySource(project projectstate.Project, sectionID string) (sectionSummarySource, error) {
	_, variant, impl, err := project.ResolveSection(sectionID)
	if err != nil {
		return sectionSummarySource{}, err
	}
	payload, err := project.EffectiveSectionPayload(sectionID, variant.ID)
	if err != nil {
		return sectionSummarySource{}, err
	}

	sectionType := strings.TrimSpace(stringValue(payload["type"]))
	if sectionType == "" {
		sectionType = strings.TrimSpace(string(impl.Kind))
	}

	rawText, err := extractSectionSummaryText(project, payload, sectionType)
	if err != nil {
		return sectionSummarySource{}, err
	}

	promptBody := truncateRunes(rawText, maxSummaryPromptChars, truncationSuffix)
	hashedPayload := sha256.Sum256([]byte(sectionType + "\n" + promptBody))
	return sectionSummarySource{
		VariantID:   variant.ID,
		RawText:     rawText,
		ContentHash: hex.EncodeToString(hashedPayload[:]),
	}, nil
}

func extractSectionSummaryText(project projectstate.Project, payload map[string]any, sectionType string) (string, error) {
	switch strings.TrimSpace(sectionType) {
	case textBlockSectionType:
		return rawStringValue(payload["text"]), nil
	case imageSectionType:
		imagePath := strings.TrimSpace(rawStringValue(payload["imagePath"]))
		if imagePath == "" {
			return "", nil
		}
		return "imagePath: " + imagePath, nil
	case commandSectionType:
		return rawStringValue(payload["code"]), nil
	case callableSectionType:
		callableID := strings.TrimSpace(stringValue(payload["callable"]))
		callableLine := ""
		if callableID != "" {
			callableLine = "callable: " + callableID
		}
		paramLines, err := buildSectionParamLines(project, payload)
		if err != nil {
			return "", err
		}
		return joinNonEmptyLines(callableLine, paramLines), nil
	case chartSectionType:
		lines := make([]string, 0, 3)
		chartSettings := nestedMapValue(payload["chartSettings"])
		if dataPath := strings.TrimSpace(rawStringValue(payload["dataPath"])); dataPath != "" {
			lines = append(lines, "dataPath: "+dataPath)
		}
		if chartType := strings.TrimSpace(stringValue(chartSettings["type"])); chartType != "" {
			lines = append(lines, "chartType: "+chartType)
		}
		if xAxisColumn := strings.TrimSpace(rawStringValue(chartSettings["xAxisColumn"])); xAxisColumn != "" {
			lines = append(lines, "xAxisColumn: "+xAxisColumn)
		}
		return strings.Join(lines, "\n"), nil
	case drawSectionType:
		return buildDrawSummaryText(payload), nil
	case promptSectionType:
		if rendered := rawStringValue(payload["renderedText"]); rendered != "" {
			return rendered, nil
		}
		return rawStringValue(payload["template"]), nil
	case socialSectionType:
		return rawStringValue(payload["url"]), nil
	case browserSectionType:
		folder := rawStringValue(payload["folder"])
		viewMode := stringValue(payload["viewMode"])
		return joinNonEmptyLines(
			prefixIfNonEmpty("folder: ", folder),
			prefixIfNonEmpty("view: ", viewMode),
		), nil
	default:
		paramLines, err := buildSectionParamLines(project, payload)
		if err != nil {
			return "", err
		}
		if paramLines != "" {
			return paramLines, nil
		}
		if code := rawStringValue(payload["code"]); code != "" {
			return code, nil
		}
		return "", nil
	}
}

func buildDrawSummaryText(payload map[string]any) string {
	lines := []string{}
	layerObjects := mapListValue(payload["layers"])
	lines = append(lines, fmt.Sprintf("layerCount: %d", len(layerObjects)))

	if renderedImagePath := strings.TrimSpace(rawStringValue(payload["renderedImagePath"])); renderedImagePath != "" {
		lines = append(lines, "renderedImagePath: "+renderedImagePath)
	}

	layerNames := make([]string, 0, len(layerObjects))
	assetPaths := make([]string, 0)
	seenAssetPaths := map[string]struct{}{}
	for _, layer := range layerObjects {
		if name := strings.TrimSpace(rawStringValue(layer["name"])); name != "" {
			layerNames = append(layerNames, name)
		}
		for _, element := range mapListValue(layer["elements"]) {
			path := strings.TrimSpace(rawStringValue(element["dataPath"]))
			if path == "" {
				continue
			}
			if _, seen := seenAssetPaths[path]; seen {
				continue
			}
			seenAssetPaths[path] = struct{}{}
			assetPaths = append(assetPaths, path)
		}
	}

	if len(layerNames) > 0 {
		lines = append(lines, "layers:")
		limit := min(len(layerNames), drawLayerNameLimit)
		for _, name := range layerNames[:limit] {
			lines = append(lines, "- "+name)
		}
		if len(layerNames) > drawLayerNameLimit {
			lines = append(lines, fmt.Sprintf("... (%d more)", len(layerNames)-drawLayerNameLimit))
		}
	}

	if len(assetPaths) > 0 {
		lines = append(lines, "assetPaths:")
		limit := min(len(assetPaths), drawAssetPathLimit)
		for _, path := range assetPaths[:limit] {
			lines = append(lines, "- "+path)
		}
		if len(assetPaths) > drawAssetPathLimit {
			lines = append(lines, fmt.Sprintf("... (%d more)", len(assetPaths)-drawAssetPathLimit))
		}
	}

	return strings.Join(lines, "\n")
}

func buildSectionParamLines(project projectstate.Project, sectionPayload map[string]any) (string, error) {
	metaControlParamID := strings.TrimSpace(stringValue(sectionPayload["metaControlParamId"]))
	if metaControlParamID != "" {
		line, err := buildParamLine(project, stringMapValue(sectionPayload["codeObjVariantMap"]), metaControlParamID)
		if err != nil {
			return "", err
		}
		return line, nil
	}

	rootCodeObjectID := strings.TrimSpace(stringValue(sectionPayload["callable"]))
	if rootCodeObjectID == "" {
		rootCodeObjectID = strings.TrimSpace(stringValue(sectionPayload["topLevelParamId"]))
	}
	if rootCodeObjectID == "" {
		return "", nil
	}

	codeObjVariantMap := stringMapValue(sectionPayload["codeObjVariantMap"])
	if len(codeObjVariantMap) == 0 {
		return "", nil
	}
	if _, ok := codeObjVariantMap[rootCodeObjectID]; !ok {
		return "", nil
	}

	rootPayload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, rootCodeObjectID)
	if err != nil {
		return "", err
	}

	childIDs := stringListValue(rootPayload["children"])
	lines := make([]string, 0, len(childIDs))
	for _, childID := range childIDs {
		line, err := buildParamLine(project, codeObjVariantMap, childID)
		if err != nil {
			return "", err
		}
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n"), nil
}

func buildParamLine(project projectstate.Project, codeObjVariantMap map[string]string, codeObjID string) (string, error) {
	normalizedCodeObjectID := strings.TrimSpace(codeObjID)
	if normalizedCodeObjectID == "" {
		return "", nil
	}
	codeObj, ok := project.CodeObjs[normalizedCodeObjectID]
	if !ok {
		return "", nil
	}
	if strings.TrimSpace(codeObjVariantMap[normalizedCodeObjectID]) == "" {
		return "", nil
	}

	payload, _, _, _, err := project.EffectiveCodeObjectPayload(codeObjVariantMap, normalizedCodeObjectID)
	if err != nil {
		return "", err
	}

	preview, ok := truncatedValuePreview(payload["value"])
	if ok {
		return fmt.Sprintf("- %s: %s", codeObj.Name, preview), nil
	}
	return "- " + codeObj.Name, nil
}

func resolveSummarySectionIDs(project projectstate.Project, chatSectionID string) []string {
	edges := append([]projectstate.AgenticEdge(nil), project.AgenticEdges...)
	sort.Slice(edges, func(i int, j int) bool {
		if edges[i].SourceSectionID == edges[j].SourceSectionID {
			return edges[i].ContextMode < edges[j].ContextMode
		}
		return edges[i].SourceSectionID < edges[j].SourceSectionID
	})

	seen := map[string]struct{}{}
	sectionIDs := make([]string, 0)
	for _, edge := range edges {
		if strings.TrimSpace(edge.Kind) != sectionChatEdgeKind {
			continue
		}
		if strings.TrimSpace(edge.TargetSectionID) != chatSectionID {
			continue
		}
		if strings.TrimSpace(edge.ContextMode) != summaryContextMode {
			continue
		}
		sourceSectionID := strings.TrimSpace(edge.SourceSectionID)
		if sourceSectionID == "" {
			continue
		}
		if _, ok := project.Sections[sourceSectionID]; !ok {
			continue
		}
		if _, seenSource := seen[sourceSectionID]; seenSource {
			continue
		}
		seen[sourceSectionID] = struct{}{}
		sectionIDs = append(sectionIDs, sourceSectionID)
	}
	return sectionIDs
}

func buildCacheKey(projectConfigID string, sectionID string, variantID string, contentHash string) string {
	return fmt.Sprintf("%s:%s:%s:%s", projectConfigID, sectionID, variantID, contentHash)
}

func (s *Service) readEntries() (map[string]any, error) {
	content, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return map[string]any{}, nil
		}
		return nil, fmt.Errorf("read agentic summary cache: %w", err)
	}
	if len(strings.TrimSpace(string(content))) == 0 {
		return map[string]any{}, nil
	}

	var payload any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode agentic summary cache: %w", err)
	}

	object, ok := payload.(map[string]any)
	if !ok {
		return map[string]any{}, nil
	}
	if numericValue(object["version"]) != currentCacheVersion {
		return map[string]any{}, nil
	}
	return stringAnyMapValue(object["entries"]), nil
}

func cachedSummaryFromEntry(entry any) string {
	object, ok := entry.(map[string]any)
	if !ok {
		return ""
	}
	summary := strings.TrimSpace(rawStringValue(object["summary"]))
	if summary == "" {
		return ""
	}
	return summary
}

func truncatedValuePreview(value any) (string, bool) {
	if value == nil {
		return "", false
	}
	valueString := fmt.Sprintf("%v", value)
	if valueString == "" {
		return "", false
	}
	return truncateRunes(valueString, valuePreviewCharLimit, "..."), true
}

func truncateRunes(value string, limit int, suffix string) string {
	if limit <= 0 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	trimmed := strings.TrimRight(string(runes[:limit]), " \n\r\t")
	return trimmed + suffix
}

func joinNonEmptyLines(lines ...string) string {
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	return strings.Join(filtered, "\n")
}

func prefixIfNonEmpty(prefix string, value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return prefix + trimmed
}

func numericValue(value any) int {
	switch typed := value.(type) {
	case float64:
		return int(typed)
	case int:
		return typed
	default:
		return 0
	}
}

func rawStringValue(value any) string {
	typed, ok := value.(string)
	if !ok {
		return ""
	}
	return typed
}

func stringValue(value any) string {
	return strings.TrimSpace(rawStringValue(value))
}

func nestedMapValue(value any) map[string]any {
	object, ok := value.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return object
}

func mapListValue(value any) []map[string]any {
	rawList, ok := value.([]any)
	if !ok {
		return nil
	}
	list := make([]map[string]any, 0, len(rawList))
	for _, rawEntry := range rawList {
		object, ok := rawEntry.(map[string]any)
		if !ok {
			continue
		}
		list = append(list, object)
	}
	return list
}

func stringListValue(value any) []string {
	rawList, ok := value.([]any)
	if !ok {
		return nil
	}
	values := make([]string, 0, len(rawList))
	for _, rawEntry := range rawList {
		if entry := strings.TrimSpace(stringValue(rawEntry)); entry != "" {
			values = append(values, entry)
		}
	}
	return values
}

func stringMapValue(value any) map[string]string {
	object, ok := value.(map[string]any)
	if !ok {
		return map[string]string{}
	}
	output := make(map[string]string, len(object))
	for key, rawValue := range object {
		trimmedKey := strings.TrimSpace(key)
		trimmedValue := strings.TrimSpace(stringValue(rawValue))
		if trimmedKey == "" || trimmedValue == "" {
			continue
		}
		output[trimmedKey] = trimmedValue
	}
	return output
}

func stringAnyMapValue(value any) map[string]any {
	object, ok := value.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return object
}

func min(left int, right int) int {
	if left < right {
		return left
	}
	return right
}
