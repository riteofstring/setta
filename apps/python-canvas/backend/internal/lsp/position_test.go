package lsp

import (
	"errors"
	"strings"
	"testing"
)

func TestUTF16PositionConversionRoundTripsGeneratedSource(t *testing.T) {
	content := "α😀\nstate.value = missing_value"
	offset := strings.Index(content, "missing_value")
	position, err := positionForByteOffset(content, offset)
	if err != nil {
		t.Fatalf("positionForByteOffset() error = %v", err)
	}
	if want := (Position{Line: 1, Character: len("state.value = ")}); position != want {
		t.Fatalf("position = %#v, want %#v", position, want)
	}
	roundTrip, err := byteOffsetForPosition(content, position)
	if err != nil {
		t.Fatalf("byteOffsetForPosition() error = %v", err)
	}
	if roundTrip != offset {
		t.Fatalf("round-trip offset = %d, want %d", roundTrip, offset)
	}

	emojiOffset := strings.Index(content, "😀") + len("😀")
	emojiPosition, err := positionForByteOffset(content, emojiOffset)
	if err != nil {
		t.Fatalf("emoji position error = %v", err)
	}
	if emojiPosition != (Position{Line: 0, Character: 3}) {
		t.Fatalf("emoji position = %#v, want UTF-16 character 3", emojiPosition)
	}
}

func TestUTF16PositionConversionRejectsMidCodePointAndSurrogatePositions(t *testing.T) {
	content := "😀"
	if _, err := positionForByteOffset(content, 1); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("mid-code-point offset error = %v, want ErrInvalidPosition", err)
	}
	if _, err := byteOffsetForPosition(content, Position{Line: 0, Character: 1}); !errors.Is(err, ErrInvalidPosition) {
		t.Fatalf("mid-surrogate position error = %v, want ErrInvalidPosition", err)
	}
}
