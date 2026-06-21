package chat

import "strings"

func normalizedTextPreview(value string, limit int) string {
	return truncateTextPreview(strings.Join(strings.Fields(value), " "), limit)
}

func boundedTextPreview(value string, limit int, truncationMarker string) string {
	if limit <= 0 {
		return value
	}
	if countRunes(value) <= limit {
		return value
	}
	return truncateTextPreview(value, limit) + truncationMarker
}

func truncateTextPreview(value string, limit int) string {
	if limit <= 0 {
		return ""
	}
	runesSeen := 0
	for index := range value {
		if runesSeen == limit {
			return strings.TrimSpace(value[:index])
		}
		runesSeen++
	}
	return value
}

func countRunes(value string) int {
	count := 0
	for range value {
		count++
	}
	return count
}
