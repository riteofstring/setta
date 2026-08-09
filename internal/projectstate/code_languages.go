package projectstate

import "strings"

const defaultCodeLanguageExtension = "txt"

var codeLanguageExtensions = map[CodeLanguage]string{
	CodeLanguagePython:     "py",
	CodeLanguageBash:       "sh",
	CodeLanguageJavaScript: "js",
	CodeLanguageTypeScript: "ts",
	CodeLanguageJSON:       "json",
	CodeLanguageYAML:       "yml",
	CodeLanguageTOML:       "toml",
	CodeLanguageMarkdown:   "md",
	CodeLanguagePlaintext:  "txt",
}

func normalizeCodeLanguage(language CodeLanguage) CodeLanguage {
	return CodeLanguage(strings.ToLower(strings.TrimSpace(string(language))))
}

func codeLanguageExtension(language CodeLanguage) string {
	normalized := normalizeCodeLanguage(language)
	if extension, ok := codeLanguageExtensions[normalized]; ok {
		return extension
	}

	languageKey := string(normalized)
	var builder strings.Builder
	builder.Grow(len(languageKey))
	lastWasUnderscore := false
	for _, r := range languageKey {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			builder.WriteRune(r)
			lastWasUnderscore = false
		case !lastWasUnderscore:
			builder.WriteByte('_')
			lastWasUnderscore = true
		}
	}

	normalizedExtension := strings.Trim(builder.String(), "_")
	if normalizedExtension == "" {
		return defaultCodeLanguageExtension
	}
	return normalizedExtension
}
