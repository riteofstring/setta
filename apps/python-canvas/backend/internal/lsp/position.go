package lsp

import (
	"errors"
	"fmt"
	"unicode/utf16"
	"unicode/utf8"
)

var ErrInvalidPosition = errors.New("lsp: invalid UTF-16 position")

// positionForByteOffset converts a renderer-owned byte offset to the UTF-16
// position required by LSP. It refuses offsets inside a UTF-8 code point.
func positionForByteOffset(content string, offset int) (Position, error) {
	if offset < 0 || offset > len(content) || !utf8.ValidString(content) {
		return Position{}, ErrInvalidPosition
	}

	position := Position{}
	for index := 0; index < len(content); {
		if index == offset {
			return position, nil
		}
		runeValue, size := utf8.DecodeRuneInString(content[index:])
		if index+size > offset {
			return Position{}, fmt.Errorf("%w: byte offset %d is inside a UTF-8 code point", ErrInvalidPosition, offset)
		}
		index += size
		if runeValue == '\n' {
			position.Line++
			position.Character = 0
			continue
		}
		position.Character += utf16.RuneLen(runeValue)
	}
	return position, nil
}

// byteOffsetForPosition converts an LSP UTF-16 position back to a generated
// source byte offset. A character position inside a surrogate pair is invalid.
func byteOffsetForPosition(content string, position Position) (int, error) {
	if position.Line < 0 || position.Character < 0 || !utf8.ValidString(content) {
		return 0, ErrInvalidPosition
	}

	line := 0
	character := 0
	for index := 0; index < len(content); {
		if line == position.Line && character == position.Character {
			return index, nil
		}

		runeValue, size := utf8.DecodeRuneInString(content[index:])
		if runeValue == '\n' {
			if line == position.Line {
				return 0, fmt.Errorf("%w: character %d exceeds line %d", ErrInvalidPosition, position.Character, position.Line)
			}
			line++
			character = 0
			index += size
			continue
		}

		units := utf16.RuneLen(runeValue)
		if line == position.Line && character+units > position.Character {
			return 0, fmt.Errorf("%w: character %d is inside a surrogate pair", ErrInvalidPosition, position.Character)
		}
		character += units
		index += size
	}

	if line == position.Line && character == position.Character {
		return len(content), nil
	}
	return 0, fmt.Errorf("%w: position %d:%d exceeds document", ErrInvalidPosition, position.Line, position.Character)
}

func byteOffsetsForRange(content string, sourceRange Range) (int, int, error) {
	start, err := byteOffsetForPosition(content, sourceRange.Start)
	if err != nil {
		return 0, 0, err
	}
	end, err := byteOffsetForPosition(content, sourceRange.End)
	if err != nil {
		return 0, 0, err
	}
	if end < start {
		return 0, 0, fmt.Errorf("%w: diagnostic range ends before it starts", ErrInvalidPosition)
	}
	return start, end, nil
}
