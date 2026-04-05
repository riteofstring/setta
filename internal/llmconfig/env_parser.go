package llmconfig

import (
	"fmt"
	"strings"
	"unicode"
)

func parseEnvContent(raw string) (map[string]string, error) {
	parsed := map[string]string{}
	for lineNumber, line := range strings.Split(raw, "\n") {
		key, value, ok, err := parseEnvLine(strings.TrimSuffix(line, "\r"))
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", lineNumber+1, err)
		}
		if !ok {
			continue
		}
		parsed[key] = value
	}
	return parsed, nil
}

func parseEnvLine(line string) (string, string, bool, error) {
	trimmedLeft := strings.TrimLeftFunc(line, unicode.IsSpace)
	if trimmedLeft == "" || strings.HasPrefix(trimmedLeft, "#") {
		return "", "", false, nil
	}

	remaining := trimmedLeft
	if strings.HasPrefix(remaining, "export") && len(remaining) > len("export") && unicode.IsSpace(rune(remaining[len("export")])) {
		remaining = strings.TrimLeftFunc(remaining[len("export"):], unicode.IsSpace)
	}

	key, rest, err := consumeEnvKey(remaining)
	if err != nil {
		return "", "", false, err
	}
	rest = strings.TrimLeftFunc(rest, unicode.IsSpace)
	if rest == "" || rest[0] != '=' {
		return "", "", false, fmt.Errorf("missing '=' after environment key %q", key)
	}

	value, err := parseEnvValue(rest[1:])
	if err != nil {
		return "", "", false, err
	}
	return key, value, true, nil
}

func consumeEnvKey(raw string) (string, string, error) {
	if raw == "" {
		return "", "", fmt.Errorf("environment key is required")
	}
	first := raw[0]
	if !isEnvKeyStart(first) {
		return "", "", fmt.Errorf("invalid environment key")
	}
	index := 1
	for index < len(raw) && isEnvKeyPart(raw[index]) {
		index++
	}
	return raw[:index], raw[index:], nil
}

func parseEnvValue(raw string) (string, error) {
	trimmedLeft := strings.TrimLeftFunc(raw, unicode.IsSpace)
	if trimmedLeft == "" || trimmedLeft[0] == '#' {
		return "", nil
	}

	switch trimmedLeft[0] {
	case '\'':
		return parseSingleQuotedEnvValue(trimmedLeft[1:])
	case '"':
		return parseDoubleQuotedEnvValue(trimmedLeft[1:])
	default:
		return parseUnquotedEnvValue(trimmedLeft), nil
	}
}

func parseSingleQuotedEnvValue(raw string) (string, error) {
	endIndex := strings.IndexByte(raw, '\'')
	if endIndex < 0 {
		return "", fmt.Errorf("unterminated single-quoted environment value")
	}
	value := raw[:endIndex]
	if err := validateTrailingEnvComment(raw[endIndex+1:]); err != nil {
		return "", err
	}
	return value, nil
}

func parseDoubleQuotedEnvValue(raw string) (string, error) {
	var builder strings.Builder
	escaped := false
	for index := 0; index < len(raw); index++ {
		ch := raw[index]
		switch {
		case escaped:
			builder.WriteString(resolveDoubleQuotedEscape(ch))
			escaped = false
		case ch == '\\':
			escaped = true
		case ch == '"':
			if err := validateTrailingEnvComment(raw[index+1:]); err != nil {
				return "", err
			}
			return builder.String(), nil
		default:
			builder.WriteByte(ch)
		}
	}
	if escaped {
		return "", fmt.Errorf("unterminated double-quoted environment value")
	}
	return "", fmt.Errorf("unterminated double-quoted environment value")
}

func resolveDoubleQuotedEscape(ch byte) string {
	switch ch {
	case 'n':
		return "\n"
	case 'r':
		return "\r"
	case 't':
		return "\t"
	case '\\':
		return "\\"
	case '"':
		return `"`
	default:
		return string(ch)
	}
}

func parseUnquotedEnvValue(raw string) string {
	commentIndex := -1
	for index := 0; index < len(raw); index++ {
		if raw[index] != '#' {
			continue
		}
		if index == 0 || unicode.IsSpace(rune(raw[index-1])) {
			commentIndex = index
			break
		}
	}
	if commentIndex >= 0 {
		raw = raw[:commentIndex]
	}
	return strings.TrimSpace(raw)
}

func validateTrailingEnvComment(raw string) error {
	trimmed := strings.TrimLeftFunc(raw, unicode.IsSpace)
	if trimmed == "" || trimmed[0] == '#' {
		return nil
	}
	return fmt.Errorf("unexpected trailing content after quoted environment value")
}

func isEnvKeyStart(ch byte) bool {
	return ch == '_' || (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')
}

func isEnvKeyPart(ch byte) bool {
	return isEnvKeyStart(ch) || (ch >= '0' && ch <= '9')
}
