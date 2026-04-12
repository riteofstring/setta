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
	chatSectionEdgeKind   = "chat_section"
)

var (
	ErrSettaFilesRootRequired = errors.New("agentic summary cache setta files root is required")
	ErrChatSectionNotFound    = errors.New("chat section not found in project")
)

type AgenticSummaryCacheStatus struct {
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

func (s *Service) BuildStatusForChat(project projectstate.Project, chatSectionID string) (AgenticSummaryCacheStatus, error) {
	status := newAgenticSummaryCacheStatus()
	normalizedChatSectionID, err := validateChatStatusRequest(s, project, chatSectionID)
	if err != nil {
		return status, err
	}

	summarySectionIDs := resolveSummarySectionIDs(project, normalizedChatSectionID)
	if len(summarySectionIDs) == 0 {
		return status, nil
	}
	status.SummarySectionIDs = append([]string(nil), summarySectionIDs...)

	entries, err := s.readEntries()
	if err != nil {
		return AgenticSummaryCacheStatus{}, err
	}

	emptyBySectionID, err := collectSummarySectionStatus(&status, project, summarySectionIDs, entries)
	if err != nil {
		return AgenticSummaryCacheStatus{}, err
	}
	populateAttemptStatus(&status, emptyBySectionID)

	return status, nil
}

type sectionSummarySource struct {
	VariantID   string
	RawText     string
	ContentHash string
}

type sectionSummaryExtractor func(projectstate.Project, map[string]any) (string, error)

var sectionSummaryExtractors = map[string]sectionSummaryExtractor{
	textBlockSectionType: func(_ projectstate.Project, payload map[string]any) (string, error) {
		return rawStringValue(payload["text"]), nil
	},
	imageSectionType: func(_ projectstate.Project, payload map[string]any) (string, error) {
		return prefixIfNonEmpty("imagePath: ", rawStringValue(payload["imagePath"])), nil
	},
	commandSectionType: func(_ projectstate.Project, payload map[string]any) (string, error) {
		return rawStringValue(payload["code"]), nil
	},
	callableSectionType: extractCallableSummaryText,
	chartSectionType:    extractChartSummaryText,
	drawSectionType: func(_ projectstate.Project, payload map[string]any) (string, error) {
		return buildDrawSummaryText(payload), nil
	},
	promptSectionType: extractPromptSummaryText,
	socialSectionType: func(_ projectstate.Project, payload map[string]any) (string, error) {
		return rawStringValue(payload["url"]), nil
	},
	browserSectionType: extractBrowserSummaryText,
}

func newAgenticSummaryCacheStatus() AgenticSummaryCacheStatus {
	return AgenticSummaryCacheStatus{
		MaxSummariesPerRun:     MaxSummariesPerRun,
		SummarySectionIDs:      []string{},
		CachedSectionIDs:       []string{},
		MissingSectionIDs:      []string{},
		EmptySourceSectionIDs:  []string{},
		ConsideredSectionIDs:   []string{},
		WouldAttemptSectionIDs: []string{},
	}
}

func validateChatStatusRequest(s *Service, project projectstate.Project, chatSectionID string) (string, error) {
	if s == nil || strings.TrimSpace(s.path) == "" {
		return "", ErrSettaFilesRootRequired
	}

	normalizedChatSectionID := strings.TrimSpace(chatSectionID)
	if normalizedChatSectionID == "" {
		return "", fmt.Errorf("%w: chat section id is required", ErrChatSectionNotFound)
	}
	if _, ok := project.Sections[normalizedChatSectionID]; !ok {
		return "", fmt.Errorf("%w: %q", ErrChatSectionNotFound, normalizedChatSectionID)
	}
	return normalizedChatSectionID, nil
}

func collectSummarySectionStatus(
	status *AgenticSummaryCacheStatus,
	project projectstate.Project,
	summarySectionIDs []string,
	entries map[string]any,
) (map[string]bool, error) {
	emptyBySectionID := make(map[string]bool, len(summarySectionIDs))
	for _, sectionID := range summarySectionIDs {
		source, err := buildSectionSummarySource(project, sectionID)
		if err != nil {
			return nil, err
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
	return emptyBySectionID, nil
}

func populateAttemptStatus(status *AgenticSummaryCacheStatus, emptyBySectionID map[string]bool) {
	status.ConsideredSectionIDs = append([]string(nil), cappedSummarySectionIDs(status.MissingSectionIDs)...)
	for _, sectionID := range status.ConsideredSectionIDs {
		if emptyBySectionID[sectionID] {
			continue
		}
		status.WouldAttemptSectionIDs = append(status.WouldAttemptSectionIDs, sectionID)
	}
}

func cappedSummarySectionIDs(sectionIDs []string) []string {
	if len(sectionIDs) <= MaxSummariesPerRun {
		return sectionIDs
	}
	return sectionIDs[:MaxSummariesPerRun]
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
	if extractor, ok := sectionSummaryExtractors[strings.TrimSpace(sectionType)]; ok {
		return extractor(project, payload)
	}
	return extractDefaultSectionSummaryText(project, payload)
}

func extractCallableSummaryText(project projectstate.Project, payload map[string]any) (string, error) {
	callableLine := prefixIfNonEmpty("callable: ", stringValue(payload["callable"]))
	paramLines, err := buildSectionParamLines(project, payload)
	if err != nil {
		return "", err
	}
	return joinNonEmptyLines(callableLine, paramLines), nil
}

func extractChartSummaryText(_ projectstate.Project, payload map[string]any) (string, error) {
	chartSettings := nestedMapValue(payload["chartSettings"])
	return joinNonEmptyLines(
		prefixIfNonEmpty("dataPath: ", rawStringValue(payload["dataPath"])),
		prefixIfNonEmpty("chartType: ", stringValue(chartSettings["type"])),
		prefixIfNonEmpty("xAxisColumn: ", rawStringValue(chartSettings["xAxisColumn"])),
	), nil
}

func extractPromptSummaryText(_ projectstate.Project, payload map[string]any) (string, error) {
	return firstNonEmptyRawString(payload["renderedText"], payload["template"]), nil
}

func extractBrowserSummaryText(_ projectstate.Project, payload map[string]any) (string, error) {
	return joinNonEmptyLines(
		prefixIfNonEmpty("folder: ", rawStringValue(payload["folder"])),
		prefixIfNonEmpty("view: ", stringValue(payload["viewMode"])),
	), nil
}

func extractDefaultSectionSummaryText(project projectstate.Project, payload map[string]any) (string, error) {
	paramLines, err := buildSectionParamLines(project, payload)
	if err != nil {
		return "", err
	}
	if paramLines != "" {
		return paramLines, nil
	}
	return rawStringValue(payload["code"]), nil
}

func buildDrawSummaryText(payload map[string]any) string {
	layerObjects := mapListValue(payload["layers"])
	lines := []string{fmt.Sprintf("layerCount: %d", len(layerObjects))}

	if renderedImageLine := prefixIfNonEmpty("renderedImagePath: ", rawStringValue(payload["renderedImagePath"])); renderedImageLine != "" {
		lines = append(lines, renderedImageLine)
	}

	layerNames, assetPaths := collectDrawSummaryLists(layerObjects)
	lines = appendLimitedSummaryList(lines, "layers:", layerNames, drawLayerNameLimit)
	lines = appendLimitedSummaryList(lines, "assetPaths:", assetPaths, drawAssetPathLimit)

	return strings.Join(lines, "\n")
}

func collectDrawSummaryLists(layerObjects []map[string]any) ([]string, []string) {
	layerNames := make([]string, 0, len(layerObjects))
	assetPaths := make([]string, 0)
	seenAssetPaths := map[string]struct{}{}
	for _, layer := range layerObjects {
		if name := stringValue(layer["name"]); name != "" {
			layerNames = append(layerNames, name)
		}
		for _, element := range mapListValue(layer["elements"]) {
			path := stringValue(element["dataPath"])
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
	return layerNames, assetPaths
}

func appendLimitedSummaryList(lines []string, header string, values []string, limit int) []string {
	if len(values) == 0 {
		return lines
	}
	lines = append(lines, header)
	limitedCount := min(len(values), limit)
	for _, value := range values[:limitedCount] {
		lines = append(lines, "- "+value)
	}
	if len(values) > limit {
		lines = append(lines, fmt.Sprintf("... (%d more)", len(values)-limit))
	}
	return lines
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
			if edges[i].TargetSectionID == edges[j].TargetSectionID {
				return edges[i].ContextMode < edges[j].ContextMode
			}
			return edges[i].TargetSectionID < edges[j].TargetSectionID
		}
		return edges[i].SourceSectionID < edges[j].SourceSectionID
	})

	seen := map[string]struct{}{}
	sectionIDs := make([]string, 0)
	for _, edge := range edges {
		if strings.TrimSpace(string(edge.Kind)) != chatSectionEdgeKind {
			continue
		}
		if strings.TrimSpace(edge.SourceSectionID) != chatSectionID {
			continue
		}
		if strings.TrimSpace(string(edge.ContextMode)) != summaryContextMode {
			continue
		}
		targetSectionID := strings.TrimSpace(edge.TargetSectionID)
		if targetSectionID == "" {
			continue
		}
		if _, ok := project.Sections[targetSectionID]; !ok {
			continue
		}
		if _, seenTarget := seen[targetSectionID]; seenTarget {
			continue
		}
		seen[targetSectionID] = struct{}{}
		sectionIDs = append(sectionIDs, targetSectionID)
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

func firstNonEmptyRawString(values ...any) string {
	for _, value := range values {
		if rawValue := rawStringValue(value); rawValue != "" {
			return rawValue
		}
	}
	return ""
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
