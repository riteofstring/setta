package frontendbindings

import (
	"reflect"
	"sort"
	"strings"
	"sync"
	"unicode"
)

type frontendBindingKnownWord struct {
	Lower  string
	Pascal string
}

var frontendBindingTypeNamesOnce sync.Once
var frontendBindingTypeNamesByType map[reflect.Type]string

func normalizedFrontendBindingTypeName(name string) string {
	name = strings.TrimSpace(name)
	if strings.HasPrefix(name, "Frontend") && len(name) > len("Frontend") {
		return strings.TrimPrefix(name, "Frontend")
	}
	return name
}

func frontendBindingPublicTypeNames() map[reflect.Type]string {
	frontendBindingTypeNamesOnce.Do(func() {
		frontendBindingTypeNamesByType = buildFrontendBindingTypeNames()
	})
	return frontendBindingTypeNamesByType
}

func buildFrontendBindingTypeNames() map[reflect.Type]string {
	types := frontendBindingNamedTypes()
	knownWords := frontendBindingKnownWordsFromTypes(types)
	baseNames := map[string][]reflect.Type{}
	for _, t := range types {
		baseName := normalizedFrontendBindingTypeName(t.Name())
		if strings.TrimSpace(baseName) == "" {
			continue
		}
		baseNames[baseName] = append(baseNames[baseName], t)
	}

	names := map[reflect.Type]string{}
	reserved := map[string]reflect.Type{}
	baseNameOrder := sortedFrontendBindingBaseNames(baseNames)

	for _, baseName := range baseNameOrder {
		group := baseNames[baseName]
		if len(group) != 1 {
			continue
		}
		names[group[0]] = baseName
		reserved[baseName] = group[0]
	}

	for _, baseName := range baseNameOrder {
		group := baseNames[baseName]
		if len(group) <= 1 {
			continue
		}
		sort.Slice(group, func(i, j int) bool {
			if group[i].PkgPath() == group[j].PkgPath() {
				return group[i].Name() < group[j].Name()
			}
			return group[i].PkgPath() < group[j].PkgPath()
		})
		for _, t := range group {
			candidate := frontendBindingCollisionTypeName(t, baseName, knownWords)
			if other, ok := reserved[candidate]; ok && other != t {
				candidate = frontendBindingFallbackCollisionTypeName(t, baseName, knownWords)
			}
			names[t] = candidate
			reserved[candidate] = t
		}
	}

	return names
}

func frontendBindingNamedTypes() []reflect.Type {
	seen := map[reflect.Type]struct{}{}
	named := map[reflect.Type]struct{}{}
	var visit func(reflect.Type)
	visit = func(t reflect.Type) {
		t = canonicalFrontendBindingType(t)
		if t == nil {
			return
		}
		if _, ok := seen[t]; ok {
			return
		}
		seen[t] = struct{}{}
		if t != timeType && t != rawJSONType && strings.TrimSpace(t.Name()) != "" && strings.TrimSpace(t.PkgPath()) != "" {
			named[t] = struct{}{}
		}

		switch t.Kind() {
		case reflect.Pointer, reflect.Slice, reflect.Array, reflect.Chan:
			visit(t.Elem())
		case reflect.Map:
			visit(t.Key())
			visit(t.Elem())
		case reflect.Struct:
			for i := 0; i < t.NumField(); i++ {
				visit(t.Field(i).Type)
			}
		case reflect.Func:
			for i := 0; i < t.NumIn(); i++ {
				visit(t.In(i))
			}
			for i := 0; i < t.NumOut(); i++ {
				visit(t.Out(i))
			}
		case reflect.Interface:
			for i := 0; i < t.NumMethod(); i++ {
				visit(t.Method(i).Type)
			}
		}
	}

	for _, t := range DiscoveredConvertibleTypes() {
		visit(t)
	}
	for _, t := range DiscoveredEndpointContractTypes() {
		if !frontendBindingRenderableEndpointContractSeed(t) {
			continue
		}
		visit(t)
	}
	for _, export := range DiscoveredFrontendValueExports() {
		visit(export.Type)
	}

	types := make([]reflect.Type, 0, len(named))
	for t := range named {
		types = append(types, t)
	}
	types = frontendBindingPreferredNamedTypes(types)
	sort.Slice(types, func(i, j int) bool {
		if types[i].PkgPath() == types[j].PkgPath() {
			return types[i].Name() < types[j].Name()
		}
		return types[i].PkgPath() < types[j].PkgPath()
	})
	return types
}

func frontendBindingRenderableEndpointContractSeed(t reflect.Type) bool {
	t = canonicalFrontendBindingType(t)
	if t == nil || t.Kind() == reflect.Interface {
		return false
	}
	name := strings.TrimSpace(t.Name())
	if name == "" {
		return false
	}
	for _, suffix := range []string{"RouteDependencies", "Dependencies", "Service", "Provider"} {
		if strings.HasSuffix(name, suffix) {
			return false
		}
	}
	return true
}

func frontendBindingPreferredNamedTypes(types []reflect.Type) []reflect.Type {
	if len(types) == 0 {
		return nil
	}

	frontendByGroup := map[string]struct{}{}
	for _, t := range types {
		name := strings.TrimSpace(t.Name())
		if !strings.HasPrefix(name, "Frontend") || len(name) <= len("Frontend") {
			continue
		}
		frontendByGroup[frontendBindingTypeGroupKey(t)] = struct{}{}
	}

	filtered := make([]reflect.Type, 0, len(types))
	for _, t := range types {
		if _, ok := frontendByGroup[frontendBindingTypeGroupKey(t)]; ok &&
			!strings.HasPrefix(strings.TrimSpace(t.Name()), "Frontend") {
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

func frontendBindingTypeGroupKey(t reflect.Type) string {
	return t.PkgPath() + ":" + normalizedFrontendBindingTypeName(t.Name())
}

func sortedFrontendBindingBaseNames(baseNames map[string][]reflect.Type) []string {
	names := make([]string, 0, len(baseNames))
	for name := range baseNames {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func frontendBindingKnownWordsFromTypes(types []reflect.Type) []frontendBindingKnownWord {
	wordsByLower := map[string]string{}
	for _, t := range types {
		for _, word := range splitFrontendBindingWords(normalizedFrontendBindingTypeName(t.Name())) {
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
	words := make([]frontendBindingKnownWord, 0, len(wordsByLower))
	for lower, pascal := range wordsByLower {
		words = append(words, frontendBindingKnownWord{
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

func splitFrontendBindingWords(name string) []string {
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

func frontendBindingCollisionTypeName(
	t reflect.Type,
	baseName string,
	knownWords []frontendBindingKnownWord,
) string {
	prefix := frontendBindingPackagePrefix(t, baseName, knownWords)
	if prefix == "" {
		return baseName
	}
	if strings.HasSuffix(prefix, baseName) {
		return prefix
	}
	return prefix + baseName
}

func frontendBindingFallbackCollisionTypeName(
	t reflect.Type,
	baseName string,
	knownWords []frontendBindingKnownWord,
) string {
	prefix := frontendBindingPackagePrefixFromFullPath(t.PkgPath(), knownWords)
	if prefix == "" {
		return baseName
	}
	if strings.HasSuffix(prefix, baseName) {
		return prefix
	}
	return prefix + baseName
}

func frontendBindingPackagePrefix(
	t reflect.Type,
	baseName string,
	knownWords []frontendBindingKnownWord,
) string {
	packageName := frontendBindingPackageName(t.PkgPath())
	for _, stem := range frontendBindingPackageStems(packageName, baseName) {
		prefix := frontendBindingPascalizePackageStem(stem, knownWords)
		if prefix != "" {
			return prefix
		}
	}
	return ""
}

func frontendBindingPackagePrefixFromFullPath(
	packagePath string,
	knownWords []frontendBindingKnownWord,
) string {
	segments := strings.Split(strings.TrimSpace(packagePath), "/")
	filtered := make([]string, 0, len(segments))
	for _, segment := range segments {
		segment = strings.TrimSpace(segment)
		if segment == "" || segment == "setta" || segment == "internal" {
			continue
		}
		filtered = append(filtered, frontendBindingPascalizePackageStem(segment, knownWords))
	}
	return strings.Join(filtered, "")
}

func frontendBindingPackageStems(packageName string, baseName string) []string {
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

	add(frontendBindingTrimBaseNameSuffix(packageName, baseName))
	add(frontendBindingTrimCollectionSuffix(packageName))
	add(packageName)
	return candidates
}

func frontendBindingTrimBaseNameSuffix(packageName string, baseName string) string {
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

func frontendBindingTrimCollectionSuffix(packageName string) string {
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

func frontendBindingPascalizePackageStem(
	stem string,
	knownWords []frontendBindingKnownWord,
) string {
	stem = strings.TrimSpace(strings.ToLower(stem))
	if stem == "" {
		return ""
	}

	var builder strings.Builder
	for len(stem) > 0 {
		match := frontendBindingMatchKnownWordPrefix(stem, knownWords)
		if match != nil {
			builder.WriteString(match.Pascal)
			stem = stem[len(match.Lower):]
			continue
		}
		builder.WriteRune(unicode.ToUpper(rune(stem[0])))
		stem = stem[1:]
	}
	return builder.String()
}

func frontendBindingMatchKnownWordPrefix(
	stem string,
	knownWords []frontendBindingKnownWord,
) *frontendBindingKnownWord {
	for i := range knownWords {
		word := &knownWords[i]
		if strings.HasPrefix(stem, word.Lower) {
			return word
		}
	}
	return nil
}

func frontendBindingPackageName(packagePath string) string {
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

func BindingTypeName(t reflect.Type) string {
	return frontendBindingTypeName(t)
}
