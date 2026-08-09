package tools

import (
	"fmt"
	"sort"
	"strings"
	"unicode"
)

var (
	ErrToolSearchQueryRequired     = fmt.Errorf("tools: search query is required")
	ErrToolSearchQueryUnsearchable = fmt.Errorf("tools: search query must include at least one searchable token")
)

type SearchEntry struct {
	Name        string
	Description string
	Metadata    Metadata
	InputSchema map[string]any
}

type SearchResult struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category,omitempty"`
}

type SearchIndex struct {
	entries []searchIndexEntry
}

type searchIndexEntry struct {
	entry             SearchEntry
	fullText          string
	nameText          string
	nameTokens        map[string]int
	descriptionText   string
	descriptionTokens map[string]int
	metadataText      string
	metadataTokens    map[string]int
	schemaText        string
	schemaTokens      map[string]int
}

type scoredSearchResult struct {
	result SearchResult
	score  int
}

func BuildSearchIndex(entries []SearchEntry) *SearchIndex {
	if len(entries) == 0 {
		return nil
	}

	indexEntries := make([]searchIndexEntry, 0, len(entries))
	for _, entry := range entries {
		nameText := buildSearchTextFromName(entry.Name)
		descriptionText := normalizeSearchText(entry.Description)
		metadataText := buildSearchTextFromMetadata(entry.Metadata)
		schemaText := buildSearchTextFromSchema(entry.InputSchema)
		fullText := strings.TrimSpace(strings.Join([]string{
			nameText,
			descriptionText,
			metadataText,
			schemaText,
		}, " "))

		indexEntries = append(indexEntries, searchIndexEntry{
			entry:             entry,
			fullText:          fullText,
			nameText:          nameText,
			nameTokens:        searchTokenCounts(nameText),
			descriptionText:   descriptionText,
			descriptionTokens: searchTokenCounts(descriptionText),
			metadataText:      metadataText,
			metadataTokens:    searchTokenCounts(metadataText),
			schemaText:        schemaText,
			schemaTokens:      searchTokenCounts(schemaText),
		})
	}

	return &SearchIndex{entries: indexEntries}
}

func (i *SearchIndex) Search(query string, limit int) ([]SearchResult, error) {
	if i == nil || len(i.entries) == 0 {
		return []SearchResult{}, nil
	}

	normalizedQuery := strings.TrimSpace(query)
	if normalizedQuery == "" {
		return nil, ErrToolSearchQueryRequired
	}

	queryText := normalizeSearchText(normalizedQuery)
	queryTokens := searchTokens(queryText)
	if len(queryTokens) == 0 {
		return nil, ErrToolSearchQueryUnsearchable
	}

	normalizedLimit := limit
	if normalizedLimit <= 0 {
		normalizedLimit = 2
	}

	scored := make([]scoredSearchResult, 0, len(i.entries))
	for _, entry := range i.entries {
		score := scoreSearchEntry(entry, queryText, queryTokens)
		if score <= 0 {
			continue
		}
		scored = append(scored, scoredSearchResult{
			result: SearchResult{
				Name:        entry.entry.Name,
				Description: entry.entry.Description,
				Category:    entry.entry.Metadata.SearchCategory,
			},
			score: score,
		})
	}

	sort.Slice(scored, func(left int, right int) bool {
		if scored[left].score != scored[right].score {
			return scored[left].score > scored[right].score
		}
		return scored[left].result.Name < scored[right].result.Name
	})

	if normalizedLimit > len(scored) {
		normalizedLimit = len(scored)
	}
	results := make([]SearchResult, 0, normalizedLimit)
	for _, item := range scored[:normalizedLimit] {
		results = append(results, item.result)
	}
	return results, nil
}

func scoreSearchEntry(entry searchIndexEntry, queryText string, queryTokens []string) int {
	score := 0

	if strings.Contains(entry.nameText, queryText) {
		score += 120
	}
	if strings.Contains(entry.descriptionText, queryText) {
		score += 30
	}
	if strings.Contains(entry.metadataText, queryText) {
		score += 25
	}
	if strings.Contains(entry.schemaText, queryText) {
		score += 20
	}

	for _, token := range queryTokens {
		score += scoreTokenMatches(entry.nameTokens, token, 18, 5)
		score += scoreTokenMatches(entry.metadataTokens, token, 12, 4)
		score += scoreTokenMatches(entry.schemaTokens, token, 8, 3)
		score += scoreTokenMatches(entry.descriptionTokens, token, 6, 2)
	}

	return score
}

func scoreTokenMatches(tokens map[string]int, queryToken string, exactWeight int, prefixWeight int) int {
	if len(tokens) == 0 {
		return 0
	}

	score := tokens[queryToken] * exactWeight
	for token, count := range tokens {
		if token == queryToken || !strings.HasPrefix(token, queryToken) {
			continue
		}
		score += count * prefixWeight
	}
	return score
}

func buildSearchTextFromName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	spaced := strings.Join(tokenizeToolName(name), " ")
	if spaced == "" || spaced == name {
		return normalizeSearchText(name)
	}
	return normalizeSearchText(name + " " + spaced)
}

func buildSearchTextFromMetadata(metadata Metadata) string {
	segments := make([]string, 0, len(metadata.SearchTags)+1)
	if strings.TrimSpace(metadata.SearchCategory) != "" {
		segments = append(segments, metadata.SearchCategory)
	}
	segments = append(segments, metadata.SearchTags...)
	return normalizeSearchText(strings.Join(segments, " "))
}

func buildSearchTextFromSchema(schema map[string]any) string {
	if len(schema) == 0 {
		return ""
	}

	segments := collectSchemaText(schema, schema, nil)
	return normalizeSearchText(strings.Join(segments, " "))
}

func collectSchemaText(schema any, rootSchema map[string]any, seenRefs map[string]struct{}) []string {
	object, ok := schema.(map[string]any)
	if !ok {
		return nil
	}
	if seenRefs == nil {
		seenRefs = map[string]struct{}{}
	}

	segments := collectSchemaLabelText(object)
	segments = append(segments, collectReferencedSchemaText(object, rootSchema, seenRefs)...)
	segments = append(segments, collectCompositeSchemaText(object, rootSchema, seenRefs)...)
	segments = append(segments, collectSchemaItemsText(object, rootSchema, seenRefs)...)
	segments = append(segments, collectSchemaPropertiesText(object, rootSchema, seenRefs)...)
	return append(segments, collectSchemaText(object["additionalProperties"], rootSchema, seenRefs)...)
}

func collectSchemaLabelText(object map[string]any) []string {
	segments := []string{}
	if description, ok := object["description"].(string); ok {
		segments = append(segments, description)
	}
	if title, ok := object["title"].(string); ok {
		segments = append(segments, title)
	}
	return segments
}

func collectReferencedSchemaText(schema map[string]any, rootSchema map[string]any, seenRefs map[string]struct{}) []string {
	ref, ok := schema["$ref"].(string)
	if !ok {
		return nil
	}
	if _, seen := seenRefs[ref]; seen {
		return nil
	}

	resolved := resolveJSONPointer(rootSchema, ref)
	if resolved == nil {
		return nil
	}

	seenRefs[ref] = struct{}{}
	defer delete(seenRefs, ref)
	return collectSchemaText(resolved, rootSchema, seenRefs)
}

func collectCompositeSchemaText(schema map[string]any, rootSchema map[string]any, seenRefs map[string]struct{}) []string {
	segments := []string{}
	for _, keyword := range []string{"anyOf", "allOf", "oneOf"} {
		options, ok := schema[keyword].([]any)
		if !ok {
			continue
		}
		for _, option := range options {
			segments = append(segments, collectSchemaText(option, rootSchema, seenRefs)...)
		}
	}
	return segments
}

func collectSchemaItemsText(schema map[string]any, rootSchema map[string]any, seenRefs map[string]struct{}) []string {
	switch items := schema["items"].(type) {
	case map[string]any:
		return collectSchemaText(items, rootSchema, seenRefs)
	case []any:
		segments := make([]string, 0, len(items))
		for _, item := range items {
			segments = append(segments, collectSchemaText(item, rootSchema, seenRefs)...)
		}
		return segments
	default:
		return nil
	}
}

func collectSchemaPropertiesText(schema map[string]any, rootSchema map[string]any, seenRefs map[string]struct{}) []string {
	properties, ok := schema["properties"].(map[string]any)
	if !ok {
		return nil
	}

	propertyNames := make([]string, 0, len(properties))
	for name := range properties {
		propertyNames = append(propertyNames, name)
	}
	sort.Strings(propertyNames)

	segments := make([]string, 0, len(propertyNames))
	for _, name := range propertyNames {
		segments = append(segments, name)
		segments = append(segments, collectSchemaText(properties[name], rootSchema, seenRefs)...)
	}
	return segments
}

func resolveJSONPointer(schema map[string]any, pointer string) any {
	if !strings.HasPrefix(pointer, "#/") {
		return nil
	}

	current := any(schema)
	for _, rawPart := range strings.Split(pointer[2:], "/") {
		part := strings.ReplaceAll(strings.ReplaceAll(rawPart, "~1", "/"), "~0", "~")
		switch typed := current.(type) {
		case map[string]any:
			current = typed[part]
		case []any:
			return nil
		default:
			return nil
		}
		if current == nil {
			return nil
		}
	}
	return current
}

func normalizeSearchText(value string) string {
	return strings.Join(searchTokens(value), " ")
}

func searchTokenCounts(value string) map[string]int {
	tokens := searchTokens(value)
	counts := make(map[string]int, len(tokens))
	for _, token := range tokens {
		counts[token]++
	}
	return counts
}

func searchTokens(value string) []string {
	var builder strings.Builder
	builder.Grow(len(value))
	for _, r := range value {
		switch {
		case unicode.IsLetter(r), unicode.IsNumber(r):
			builder.WriteRune(unicode.ToLower(r))
		default:
			builder.WriteByte(' ')
		}
	}

	rawTokens := strings.Fields(builder.String())
	tokens := make([]string, 0, len(rawTokens))
	for _, token := range rawTokens {
		if token != "" {
			tokens = append(tokens, token)
		}
	}
	return tokens
}
