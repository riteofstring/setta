package gotypediscovery

import (
	"encoding/json"
	"reflect"
	"sort"
	"strings"
	"time"
	"unicode"

	"setta/internal/frontendbindings"
	"setta/internal/sharedtypes"
	"setta/internal/sharedvalueexports"
)

var frontendContractNameTimeType = reflect.TypeOf(time.Time{})
var frontendContractNameRawJSONType = reflect.TypeOf(json.RawMessage{})

type FrontendContractNameEntry struct {
	Type reflect.Type
	Name string
}

type frontendContractNameKnownWord struct {
	Lower  string
	Pascal string
}

type frontendContractTypeCollector struct {
	seen  map[reflect.Type]struct{}
	named map[reflect.Type]struct{}
}

func DiscoverFrontendContractNameEntries() []FrontendContractNameEntry {
	types := frontendContractNameTypes()
	resolvedNames := resolveFrontendContractNames(
		frontendContractBaseNameGroups(types),
		frontendContractNameKnownWordsFromTypes(types),
	)
	return frontendContractNameEntries(types, resolvedNames)
}

func frontendContractNameTypes() []reflect.Type {
	collector := newFrontendContractTypeCollector()
	collector.visitAll(frontendbindings.DiscoveredConvertibleTypes())
	collector.visitAll(sharedtypes.DiscoveredAdditionalTypesForGeneration())
	for _, export := range sharedvalueexports.DiscoveredValueExports() {
		collector.visit(export.Type)
	}
	return collector.sortedTypes()
}

func newFrontendContractTypeCollector() *frontendContractTypeCollector {
	return &frontendContractTypeCollector{
		seen:  map[reflect.Type]struct{}{},
		named: map[reflect.Type]struct{}{},
	}
}

func (collector *frontendContractTypeCollector) visitAll(types []reflect.Type) {
	for _, t := range types {
		collector.visit(t)
	}
}

func (collector *frontendContractTypeCollector) visit(t reflect.Type) {
	t = frontendbindings.CanonicalBindingType(t)
	if t == nil || collector.markSeen(t) {
		return
	}
	collector.recordNamedType(t)
	if frontendContractTypeWalkStopsAt(t) {
		return
	}
	collector.visitChildren(t)
}

func (collector *frontendContractTypeCollector) markSeen(t reflect.Type) bool {
	if _, ok := collector.seen[t]; ok {
		return true
	}
	collector.seen[t] = struct{}{}
	return false
}

func (collector *frontendContractTypeCollector) recordNamedType(t reflect.Type) {
	if !frontendContractIsNamedType(t) {
		return
	}
	collector.named[t] = struct{}{}
}

func frontendContractIsNamedType(t reflect.Type) bool {
	return t != frontendContractNameTimeType &&
		t != frontendContractNameRawJSONType &&
		strings.TrimSpace(t.Name()) != "" &&
		strings.TrimSpace(t.PkgPath()) != ""
}

func frontendContractTypeWalkStopsAt(t reflect.Type) bool {
	return t == frontendContractNameTimeType || t == frontendContractNameRawJSONType
}

func (collector *frontendContractTypeCollector) visitChildren(t reflect.Type) {
	switch t.Kind() {
	case reflect.Pointer, reflect.Slice, reflect.Array, reflect.Chan:
		collector.visit(t.Elem())
	case reflect.Map:
		collector.visit(t.Key())
		collector.visit(t.Elem())
	case reflect.Struct:
		collector.visitStructFields(t)
	case reflect.Func:
		collector.visitFuncTypes(t)
	case reflect.Interface:
		collector.visitInterfaceMethods(t)
	}
}

func (collector *frontendContractTypeCollector) visitStructFields(t reflect.Type) {
	for index := 0; index < t.NumField(); index++ {
		collector.visit(t.Field(index).Type)
	}
}

func (collector *frontendContractTypeCollector) visitFuncTypes(t reflect.Type) {
	for index := 0; index < t.NumIn(); index++ {
		collector.visit(t.In(index))
	}
	for index := 0; index < t.NumOut(); index++ {
		collector.visit(t.Out(index))
	}
}

func (collector *frontendContractTypeCollector) visitInterfaceMethods(t reflect.Type) {
	for index := 0; index < t.NumMethod(); index++ {
		collector.visit(t.Method(index).Type)
	}
}

func (collector *frontendContractTypeCollector) sortedTypes() []reflect.Type {
	types := make([]reflect.Type, 0, len(collector.named))
	for t := range collector.named {
		types = append(types, t)
	}
	types = preferredFrontendContractNameTypes(types)
	sort.Slice(types, func(i, j int) bool {
		if types[i].PkgPath() == types[j].PkgPath() {
			return types[i].Name() < types[j].Name()
		}
		return types[i].PkgPath() < types[j].PkgPath()
	})
	return types
}

func frontendContractBaseNameGroups(types []reflect.Type) map[string][]reflect.Type {
	baseNames := map[string][]reflect.Type{}
	for _, t := range types {
		baseName := normalizedFrontendContractName(t.Name())
		if strings.TrimSpace(baseName) == "" {
			continue
		}
		baseNames[baseName] = append(baseNames[baseName], t)
	}
	return baseNames
}

func resolveFrontendContractNames(
	baseNames map[string][]reflect.Type,
	knownWords []frontendContractNameKnownWord,
) map[reflect.Type]string {
	resolvedNames := map[reflect.Type]string{}
	baseNameOrder := sortedFrontendContractBaseNames(baseNames)
	assignUniqueFrontendContractNames(resolvedNames, baseNames, baseNameOrder)
	assignCollisionFrontendContractNames(resolvedNames, baseNames, baseNameOrder, knownWords)
	return resolvedNames
}

func assignUniqueFrontendContractNames(
	resolvedNames map[reflect.Type]string,
	baseNames map[string][]reflect.Type,
	baseNameOrder []string,
) {
	for _, baseName := range baseNameOrder {
		group := baseNames[baseName]
		if len(group) == 1 {
			resolvedNames[group[0]] = baseName
		}
	}
}

func assignCollisionFrontendContractNames(
	resolvedNames map[reflect.Type]string,
	baseNames map[string][]reflect.Type,
	baseNameOrder []string,
	knownWords []frontendContractNameKnownWord,
) {
	for _, baseName := range baseNameOrder {
		group := baseNames[baseName]
		if len(group) <= 1 {
			continue
		}
		sortFrontendContractTypes(group)
		for _, t := range group {
			resolvedNames[t] = frontendContractCollisionTypeName(t, baseName, knownWords)
		}
	}
}

func sortFrontendContractTypes(types []reflect.Type) {
	sort.Slice(types, func(i, j int) bool {
		if types[i].PkgPath() == types[j].PkgPath() {
			return types[i].Name() < types[j].Name()
		}
		return types[i].PkgPath() < types[j].PkgPath()
	})
}

func frontendContractNameEntries(
	types []reflect.Type,
	resolvedNames map[reflect.Type]string,
) []FrontendContractNameEntry {
	entries := make([]FrontendContractNameEntry, 0, len(types))
	for _, t := range types {
		name := strings.TrimSpace(resolvedNames[t])
		if name == "" {
			continue
		}
		entries = append(entries, FrontendContractNameEntry{
			Type: t,
			Name: name,
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Name == entries[j].Name {
			if entries[i].Type.PkgPath() == entries[j].Type.PkgPath() {
				return entries[i].Type.Name() < entries[j].Type.Name()
			}
			return entries[i].Type.PkgPath() < entries[j].Type.PkgPath()
		}
		return entries[i].Name < entries[j].Name
	})
	return entries
}

func preferredFrontendContractNameTypes(types []reflect.Type) []reflect.Type {
	if len(types) == 0 {
		return nil
	}

	frontendByGroup := map[string]struct{}{}
	for _, t := range types {
		name := strings.TrimSpace(t.Name())
		if !strings.HasPrefix(name, "Frontend") || len(name) <= len("Frontend") {
			continue
		}
		frontendByGroup[frontendContractTypeGroupKey(t)] = struct{}{}
	}

	filtered := make([]reflect.Type, 0, len(types))
	for _, t := range types {
		if _, ok := frontendByGroup[frontendContractTypeGroupKey(t)]; ok &&
			!strings.HasPrefix(strings.TrimSpace(t.Name()), "Frontend") {
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

func frontendContractTypeGroupKey(t reflect.Type) string {
	return t.PkgPath() + ":" + normalizedFrontendContractName(t.Name())
}

func normalizedFrontendContractName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		return strings.TrimPrefix(name, "Frontend")
	}
	return name
}

func sortedFrontendContractBaseNames(baseNames map[string][]reflect.Type) []string {
	names := make([]string, 0, len(baseNames))
	for name := range baseNames {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func frontendContractNameKnownWordsFromTypes(types []reflect.Type) []frontendContractNameKnownWord {
	wordsByLower := map[string]string{}
	for _, t := range types {
		for _, word := range splitFrontendContractWords(normalizedFrontendContractName(t.Name())) {
			lower := strings.ToLower(word)
			if lower == "" {
				continue
			}
			if _, exists := wordsByLower[lower]; exists {
				continue
			}
			wordsByLower[lower] = word
		}
	}
	words := make([]frontendContractNameKnownWord, 0, len(wordsByLower))
	for lower, pascal := range wordsByLower {
		words = append(words, frontendContractNameKnownWord{
			Lower:  lower,
			Pascal: pascal,
		})
	}
	sort.Slice(words, func(i, j int) bool {
		if len(words[i].Lower) == len(words[j].Lower) {
			return words[i].Lower < words[j].Lower
		}
		return len(words[i].Lower) > len(words[j].Lower)
	})
	return words
}

func splitFrontendContractWords(name string) []string {
	runes := []rune(strings.TrimSpace(name))
	if len(runes) == 0 {
		return nil
	}

	words := []string{}
	start := 0
	for i := 1; i < len(runes); i++ {
		prev := runes[i-1]
		curr := runes[i]
		next := rune(0)
		if i+1 < len(runes) {
			next = runes[i+1]
		}

		if unicode.IsUpper(curr) && unicode.IsLower(prev) {
			words = append(words, string(runes[start:i]))
			start = i
			continue
		}
		if unicode.IsUpper(curr) && unicode.IsUpper(prev) && next != 0 && unicode.IsLower(next) {
			words = append(words, string(runes[start:i]))
			start = i
			continue
		}
	}

	words = append(words, string(runes[start:]))
	return words
}

func frontendContractCollisionTypeName(
	t reflect.Type,
	baseName string,
	knownWords []frontendContractNameKnownWord,
) string {
	prefix := frontendContractPackagePrefix(t, baseName, knownWords)
	if prefix == "" {
		return baseName
	}
	if strings.HasSuffix(prefix, baseName) {
		return prefix
	}
	return prefix + baseName
}

func frontendContractPackagePrefix(
	t reflect.Type,
	baseName string,
	knownWords []frontendContractNameKnownWord,
) string {
	packageName := frontendContractPackageName(t.PkgPath())
	for _, stem := range frontendContractPackageStems(packageName, baseName) {
		prefix := frontendContractPascalizePackageStem(stem, knownWords)
		if prefix != "" {
			return prefix
		}
	}
	return ""
}

func frontendContractPackageStems(packageName string, baseName string) []string {
	candidates := []string{}
	add := func(stem string) {
		stem = strings.TrimSpace(stem)
		if stem == "" {
			return
		}
		for _, existing := range candidates {
			if existing == stem {
				return
			}
		}
		candidates = append(candidates, stem)
	}

	add(frontendContractTrimBaseNameSuffix(packageName, baseName))
	add(frontendContractTrimCollectionSuffix(packageName))
	add(packageName)
	return candidates
}

func frontendContractTrimBaseNameSuffix(packageName string, baseName string) string {
	packageName = strings.TrimSpace(packageName)
	lowerBase := strings.ToLower(strings.TrimSpace(baseName))
	if packageName == "" || lowerBase == "" {
		return ""
	}

	suffixes := []string{
		lowerBase,
		lowerBase + "s",
		lowerBase + "es",
	}
	if strings.HasSuffix(lowerBase, "y") {
		suffixes = append(suffixes, strings.TrimSuffix(lowerBase, "y")+"ies")
	}

	for _, suffix := range suffixes {
		if !strings.HasSuffix(packageName, suffix) || len(packageName) <= len(suffix) {
			continue
		}
		return strings.TrimSuffix(packageName, suffix)
	}

	return ""
}

func frontendContractTrimCollectionSuffix(packageName string) string {
	packageName = strings.TrimSpace(packageName)
	if packageName == "" {
		return ""
	}
	for _, suffix := range []string{
		"configs", "profiles", "templates", "runs",
		"config", "profile", "template", "run",
	} {
		if !strings.HasSuffix(packageName, suffix) || len(packageName) <= len(suffix) {
			continue
		}
		return strings.TrimSuffix(packageName, suffix)
	}
	return ""
}

func frontendContractPascalizePackageStem(
	stem string,
	knownWords []frontendContractNameKnownWord,
) string {
	stem = strings.TrimSpace(strings.ToLower(stem))
	if stem == "" {
		return ""
	}

	var builder strings.Builder
	for len(stem) > 0 {
		match := frontendContractMatchKnownWordPrefix(stem, knownWords)
		if match != nil {
			builder.WriteString(match.Pascal)
			stem = stem[len(match.Lower):]
			continue
		}
		nextBoundary := len(stem)
		for i := 1; i < len(stem); i++ {
			if frontendContractMatchKnownWordPrefix(stem[i:], knownWords) != nil {
				nextBoundary = i
				break
			}
		}
		chunk := stem[:nextBoundary]
		builder.WriteRune(unicode.ToUpper(rune(chunk[0])))
		builder.WriteString(chunk[1:])
		stem = stem[nextBoundary:]
	}
	return builder.String()
}

func frontendContractMatchKnownWordPrefix(
	stem string,
	knownWords []frontendContractNameKnownWord,
) *frontendContractNameKnownWord {
	for index := range knownWords {
		word := &knownWords[index]
		if strings.HasPrefix(stem, word.Lower) {
			return word
		}
	}
	return nil
}

func frontendContractPackageName(packagePath string) string {
	packagePath = strings.TrimSpace(packagePath)
	if packagePath == "" {
		return ""
	}
	lastSlash := strings.LastIndex(packagePath, "/")
	if lastSlash < 0 {
		return packagePath
	}
	return packagePath[lastSlash+1:]
}
