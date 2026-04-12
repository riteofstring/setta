package tools

import (
	"fmt"
	"regexp"
	"slices"
	"strings"
)

type Kind string

const (
	KindInit         Kind = "init"
	KindDiscoverable Kind = "discoverable"
)

type AccessType string

const (
	AccessTypeRead       AccessType = "read"
	AccessTypeWrite      AccessType = "write"
	AccessTypeStructural AccessType = "structural"
)

type IDType string

const (
	IDTypeSection        IDType = "section"
	IDTypeSectionVariant IDType = "sectionVariant"
	IDTypeCodeObject     IDType = "codeObj"
)

type ResultFilter string

const (
	ResultFilterProjectStateSummary ResultFilter = "project_state_summary"
	ResultFilterLSPDiagnostics      ResultFilter = "lsp_diagnostics"
)

type PreviewKind string

const (
	PreviewKindCode         PreviewKind = "code"
	PreviewKindParamValue   PreviewKind = "paramValue"
	PreviewKindCallableName PreviewKind = "callableName"
	PreviewKindAppSpecPatch PreviewKind = "appSpecPatch"
)

type ToolArgumentPreviewMetadata struct {
	TargetIDPathsByType map[IDType][]string
	PreviewValuePath    string
	PreviewKind         PreviewKind
}

type ToolAnnotationsMetadata struct {
	DestructiveHint *bool
	IdempotentHint  *bool
	OpenWorldHint   *bool
	Title           string
}

type Metadata struct {
	Kind                          Kind
	AccessType                    AccessType
	RequiresLLM                   bool
	StartsRun                     bool
	IDPathsByType                 map[IDType][]string
	ResultIDPathsByType           map[IDType][]string
	ToolArgumentPreview           *ToolArgumentPreviewMetadata
	ToolAnnotations               *ToolAnnotationsMetadata
	DefaultTargetSingletonSection string
	ResultFilter                  ResultFilter
	SearchTags                    []string
	SearchCategory                string
}

var (
	ErrToolKindRequired        = fmt.Errorf("tools: tool kind is required")
	ErrToolKindInvalid         = fmt.Errorf("tools: tool kind is invalid")
	ErrToolAccessTypeInvalid   = fmt.Errorf("tools: tool access type is invalid")
	ErrToolIDTypeInvalid       = fmt.Errorf("tools: tool id type is invalid")
	ErrToolResultFilterInvalid = fmt.Errorf("tools: tool result filter is invalid")
	ErrToolPreviewKindInvalid  = fmt.Errorf("tools: tool preview kind is invalid")
	ErrToolPreviewPathRequired = fmt.Errorf("tools: tool preview value path is required")
)

var camelSplitPattern = regexp.MustCompile(`([a-z0-9])([A-Z])`)

var toolSearchSynonyms = map[string][]string{
	"add":      {"create", "new", "insert"},
	"bind":     {"wire", "connect", "link"},
	"callable": {"function", "call"},
	"chat":     {"conversation", "message"},
	"clear":    {"reset", "remove"},
	"code":     {"python", "script"},
	"config":   {"settings"},
	"create":   {"add", "new", "insert"},
	"delete":   {"remove", "drop"},
	"disable":  {"toggle", "switch", "flip"},
	"enable":   {"toggle", "switch", "flip"},
	"gen":      {"generate", "generated"},
	"get":      {"fetch", "read"},
	"impl":     {"implementation"},
	"layout":   {"position", "arrangement"},
	"list":     {"show", "enumerate"},
	"listener": {"subscription", "event"},
	"move":     {"reorder", "relocate"},
	"param":    {"parameter", "argument", "input"},
	"params":   {"parameters", "arguments", "inputs"},
	"project":  {"config", "workspace"},
	"remove":   {"delete", "drop"},
	"rename":   {"retitle", "relabel"},
	"section":  {"panel", "node"},
	"sections": {"panels", "nodes"},
	"set":      {"update", "change"},
	"size":     {"dimension", "scale"},
	"terminal": {"shell", "cli"},
	"toggle":   {"switch", "flip", "enable", "disable"},
	"variant":  {"version", "mode"},
}

var toolCategoryKeywords = []struct {
	category string
	keywords []string
}{
	{
		category: "sections",
		keywords: []string{"section", "sections", "child", "top", "layout", "position", "size", "sizes", "variant"},
	},
	{
		category: "code",
		keywords: []string{"code", "callable", "gen", "python", "prefix", "suffix", "binding"},
	},
	{
		category: "params",
		keywords: []string{"param", "params", "parameter", "paraminfo", "impl"},
	},
	{
		category: "artifacts",
		keywords: []string{"artifact", "artifacts"},
	},
	{
		category: "listeners",
		keywords: []string{"listener", "listeners"},
	},
	{
		category: "project",
		keywords: []string{"project", "config", "settings", "state"},
	},
	{
		category: "terminal",
		keywords: []string{"terminal"},
	},
	{
		category: "chat",
		keywords: []string{"chat", "llm", "message"},
	},
	{
		category: "lsp",
		keywords: []string{"lsp", "completion", "signature", "diagnostic", "diagnostics"},
	},
	{
		category: "files",
		keywords: []string{"file", "files", "path"},
	},
}

func (m Metadata) Normalize(toolName string) (Metadata, error) {
	normalizedKind, err := normalizeKind(m.Kind)
	if err != nil {
		return Metadata{}, err
	}
	normalizedAccessType, err := normalizeAccessType(m.AccessType)
	if err != nil {
		return Metadata{}, err
	}
	normalizedResultFilter, err := normalizeResultFilter(m.ResultFilter)
	if err != nil {
		return Metadata{}, err
	}

	idPathsByType := make(map[IDType][]string, len(m.IDPathsByType))
	for rawIDType, paths := range m.IDPathsByType {
		idType, err := normalizeIDType(rawIDType)
		if err != nil {
			return Metadata{}, err
		}
		idPathsByType[idType] = normalizePathList(paths)
	}
	resultIDPathsByType := make(map[IDType][]string, len(m.ResultIDPathsByType))
	for rawIDType, paths := range m.ResultIDPathsByType {
		idType, err := normalizeIDType(rawIDType)
		if err != nil {
			return Metadata{}, err
		}
		resultIDPathsByType[idType] = normalizePathList(paths)
	}
	var toolArgumentPreview *ToolArgumentPreviewMetadata
	if m.ToolArgumentPreview != nil {
		normalizedPreview, err := normalizeToolArgumentPreviewMetadata(*m.ToolArgumentPreview)
		if err != nil {
			return Metadata{}, err
		}
		toolArgumentPreview = &normalizedPreview
	}
	var toolAnnotations *ToolAnnotationsMetadata
	if m.ToolAnnotations != nil {
		normalizedAnnotations := normalizeToolAnnotationsMetadata(*m.ToolAnnotations)
		toolAnnotations = &normalizedAnnotations
	}

	searchTags, searchCategory := buildSearchMetadata(
		toolName,
		m.SearchTags,
		m.SearchCategory,
	)

	return Metadata{
		Kind:                          normalizedKind,
		AccessType:                    normalizedAccessType,
		RequiresLLM:                   m.RequiresLLM,
		StartsRun:                     m.StartsRun,
		IDPathsByType:                 idPathsByType,
		ResultIDPathsByType:           resultIDPathsByType,
		ToolArgumentPreview:           toolArgumentPreview,
		ToolAnnotations:               toolAnnotations,
		DefaultTargetSingletonSection: strings.TrimSpace(m.DefaultTargetSingletonSection),
		ResultFilter:                  normalizedResultFilter,
		SearchTags:                    searchTags,
		SearchCategory:                searchCategory,
	}, nil
}

func buildSearchMetadata(toolName string, explicitTags []string, explicitCategory string) ([]string, string) {
	tokens := tokenizeToolName(toolName)
	derivedTags := deriveSearchTags(tokens)
	derivedCategory := deriveSearchCategory(tokens)

	searchTags := normalizeSearchTags(append(explicitTags, derivedTags...))
	searchCategory := strings.ToLower(strings.TrimSpace(explicitCategory))
	if searchCategory == "" {
		searchCategory = derivedCategory
	}
	return searchTags, searchCategory
}

func tokenizeToolName(toolName string) []string {
	normalized := camelSplitPattern.ReplaceAllString(strings.ReplaceAll(strings.ReplaceAll(toolName, "_", " "), "-", " "), `${1} ${2}`)
	rawTokens := strings.Fields(normalized)
	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		clean := strings.ToLower(strings.TrimSpace(token))
		if clean == "" {
			continue
		}
		tokens = append(tokens, clean)
	}
	return tokens
}

func deriveSearchTags(tokens []string) []string {
	var tags []string
	seen := map[string]struct{}{}
	for _, token := range tokens {
		for _, synonym := range toolSearchSynonyms[token] {
			normalized := strings.ToLower(strings.TrimSpace(synonym))
			if normalized == "" {
				continue
			}
			if _, ok := seen[normalized]; ok {
				continue
			}
			seen[normalized] = struct{}{}
			tags = append(tags, normalized)
		}
	}
	return tags
}

func deriveSearchCategory(tokens []string) string {
	for _, candidate := range toolCategoryKeywords {
		for _, token := range tokens {
			if slices.Contains(candidate.keywords, token) {
				return candidate.category
			}
		}
	}
	return ""
}

func normalizeKind(kind Kind) (Kind, error) {
	switch Kind(strings.ToLower(strings.TrimSpace(string(kind)))) {
	case KindInit:
		return KindInit, nil
	case KindDiscoverable:
		return KindDiscoverable, nil
	case "":
		return "", ErrToolKindRequired
	default:
		return "", fmt.Errorf("%w: %q", ErrToolKindInvalid, kind)
	}
}

func normalizeToolArgumentPreviewMetadata(metadata ToolArgumentPreviewMetadata) (ToolArgumentPreviewMetadata, error) {
	normalizedKind, err := normalizePreviewKind(metadata.PreviewKind)
	if err != nil {
		return ToolArgumentPreviewMetadata{}, err
	}
	previewValuePath := strings.TrimSpace(metadata.PreviewValuePath)
	if previewValuePath == "" {
		return ToolArgumentPreviewMetadata{}, ErrToolPreviewPathRequired
	}
	targetIDPathsByType := make(map[IDType][]string, len(metadata.TargetIDPathsByType))
	for rawIDType, paths := range metadata.TargetIDPathsByType {
		idType, err := normalizeIDType(rawIDType)
		if err != nil {
			return ToolArgumentPreviewMetadata{}, err
		}
		targetIDPathsByType[idType] = normalizePathList(paths)
	}
	return ToolArgumentPreviewMetadata{
		TargetIDPathsByType: targetIDPathsByType,
		PreviewValuePath:    previewValuePath,
		PreviewKind:         normalizedKind,
	}, nil
}

func normalizePreviewKind(kind PreviewKind) (PreviewKind, error) {
	switch PreviewKind(strings.TrimSpace(string(kind))) {
	case PreviewKindCode:
		return PreviewKindCode, nil
	case PreviewKindParamValue:
		return PreviewKindParamValue, nil
	case PreviewKindCallableName:
		return PreviewKindCallableName, nil
	case PreviewKindAppSpecPatch:
		return PreviewKindAppSpecPatch, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrToolPreviewKindInvalid, kind)
	}
}

func normalizeToolAnnotationsMetadata(metadata ToolAnnotationsMetadata) ToolAnnotationsMetadata {
	return ToolAnnotationsMetadata{
		DestructiveHint: cloneBoolPointer(metadata.DestructiveHint),
		IdempotentHint:  cloneBoolPointer(metadata.IdempotentHint),
		OpenWorldHint:   cloneBoolPointer(metadata.OpenWorldHint),
		Title:           strings.TrimSpace(metadata.Title),
	}
}

func normalizeAccessType(accessType AccessType) (AccessType, error) {
	switch AccessType(strings.ToLower(strings.TrimSpace(string(accessType)))) {
	case "":
		return AccessTypeStructural, nil
	case AccessTypeRead:
		return AccessTypeRead, nil
	case AccessTypeWrite:
		return AccessTypeWrite, nil
	case AccessTypeStructural:
		return AccessTypeStructural, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrToolAccessTypeInvalid, accessType)
	}
}

func normalizeIDType(idType IDType) (IDType, error) {
	switch IDType(strings.TrimSpace(string(idType))) {
	case IDTypeSection:
		return IDTypeSection, nil
	case IDTypeSectionVariant:
		return IDTypeSectionVariant, nil
	case IDTypeCodeObject:
		return IDTypeCodeObject, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrToolIDTypeInvalid, idType)
	}
}

func normalizeResultFilter(resultFilter ResultFilter) (ResultFilter, error) {
	switch ResultFilter(strings.ToLower(strings.TrimSpace(string(resultFilter)))) {
	case "":
		return "", nil
	case ResultFilterProjectStateSummary:
		return ResultFilterProjectStateSummary, nil
	case ResultFilterLSPDiagnostics:
		return ResultFilterLSPDiagnostics, nil
	default:
		return "", fmt.Errorf("%w: %q", ErrToolResultFilterInvalid, resultFilter)
	}
}

func normalizeSearchTags(values []string) []string {
	normalized := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		clean := strings.ToLower(strings.TrimSpace(value))
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		normalized = append(normalized, clean)
	}
	return normalized
}

func cloneBoolPointer(value *bool) *bool {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func normalizePathList(values []string) []string {
	normalized := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" {
			continue
		}
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		normalized = append(normalized, clean)
	}
	return normalized
}
