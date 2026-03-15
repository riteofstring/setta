package sshx

import (
	"fmt"
	"strings"
	"unicode"
)

func splitShellArgs(raw string) ([]string, error) {
	args := []string{}
	var current strings.Builder

	inSingleQuote := false
	inDoubleQuote := false
	escaped := false
	tokenStarted := false

	flushToken := func() {
		if !tokenStarted {
			return
		}
		args = append(args, current.String())
		current.Reset()
		tokenStarted = false
	}

	for _, r := range raw {
		switch {
		case escaped:
			current.WriteRune(r)
			tokenStarted = true
			escaped = false
		case inSingleQuote:
			if r == '\'' {
				inSingleQuote = false
				tokenStarted = true
				continue
			}
			current.WriteRune(r)
			tokenStarted = true
		case inDoubleQuote:
			switch r {
			case '"':
				inDoubleQuote = false
				tokenStarted = true
			case '\\':
				escaped = true
				tokenStarted = true
			default:
				current.WriteRune(r)
				tokenStarted = true
			}
		default:
			switch {
			case unicode.IsSpace(r):
				flushToken()
			case r == '\'':
				inSingleQuote = true
				tokenStarted = true
			case r == '"':
				inDoubleQuote = true
				tokenStarted = true
			case r == '\\':
				escaped = true
				tokenStarted = true
			default:
				current.WriteRune(r)
				tokenStarted = true
			}
		}
	}

	switch {
	case escaped:
		return nil, fmt.Errorf("no escaped character")
	case inSingleQuote || inDoubleQuote:
		return nil, fmt.Errorf("no closing quotation")
	default:
		flushToken()
		return args, nil
	}
}
