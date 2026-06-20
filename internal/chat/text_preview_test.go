package chat

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestTextPreviewsPreserveUTF8WhenTruncated(t *testing.T) {
	value := strings.Repeat("🙂", 5)

	summary := summarize(value, 3)
	if !utf8.ValidString(summary) {
		t.Fatalf("summary is not valid UTF-8: %q", summary)
	}
	if got := utf8.RuneCountInString(summary); got != 3 {
		t.Fatalf("summary rune count = %d, want 3", got)
	}

	bounded := boundedText(value, 3)
	if bounded != strings.Repeat("🙂", 3)+"...<truncated>" {
		t.Fatalf("bounded text = %q", bounded)
	}
	if !utf8.ValidString(bounded) {
		t.Fatalf("bounded text is not valid UTF-8: %q", bounded)
	}
}

func TestTextPreviewsNormalizeWhitespaceBeforeTruncating(t *testing.T) {
	summary := summarize("  first\t\nsecond   third  ", 12)
	if summary != "first second" {
		t.Fatalf("summary = %q, want normalized preview", summary)
	}
}
