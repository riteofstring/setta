package sshx

import (
	"fmt"
	"strings"
	"unicode"
)

type shellSplitState uint8

const (
	shellSplitStateUnquoted shellSplitState = iota
	shellSplitStateSingleQuoted
	shellSplitStateDoubleQuoted
)

type shellArgSplitter struct {
	args         []string
	current      strings.Builder
	state        shellSplitState
	escaped      bool
	tokenStarted bool
}

func splitShellArgs(raw string) ([]string, error) {
	splitter := shellArgSplitter{}
	for _, r := range raw {
		splitter.consume(r)
	}
	return splitter.finish()
}

func (s *shellArgSplitter) consume(r rune) {
	if s.escaped {
		s.writeRune(r)
		s.escaped = false
		return
	}
	switch s.state {
	case shellSplitStateSingleQuoted:
		s.consumeSingleQuoted(r)
	case shellSplitStateDoubleQuoted:
		s.consumeDoubleQuoted(r)
	default:
		s.consumeUnquoted(r)
	}
}

func (s *shellArgSplitter) consumeSingleQuoted(r rune) {
	if r == '\'' {
		s.state = shellSplitStateUnquoted
		s.tokenStarted = true
		return
	}
	s.writeRune(r)
}

func (s *shellArgSplitter) consumeDoubleQuoted(r rune) {
	switch r {
	case '"':
		s.state = shellSplitStateUnquoted
		s.tokenStarted = true
	case '\\':
		s.startEscape()
	default:
		s.writeRune(r)
	}
}

func (s *shellArgSplitter) consumeUnquoted(r rune) {
	switch {
	case unicode.IsSpace(r):
		s.flushToken()
	case r == '\'':
		s.state = shellSplitStateSingleQuoted
		s.tokenStarted = true
	case r == '"':
		s.state = shellSplitStateDoubleQuoted
		s.tokenStarted = true
	case r == '\\':
		s.startEscape()
	default:
		s.writeRune(r)
	}
}

func (s *shellArgSplitter) startEscape() {
	s.escaped = true
	s.tokenStarted = true
}

func (s *shellArgSplitter) writeRune(r rune) {
	s.current.WriteRune(r)
	s.tokenStarted = true
}

func (s *shellArgSplitter) flushToken() {
	if !s.tokenStarted {
		return
	}
	s.args = append(s.args, s.current.String())
	s.current.Reset()
	s.tokenStarted = false
}

func (s *shellArgSplitter) finish() ([]string, error) {
	switch {
	case s.escaped:
		return nil, fmt.Errorf("no escaped character")
	case s.state != shellSplitStateUnquoted:
		return nil, fmt.Errorf("no closing quotation")
	default:
		s.flushToken()
		return s.args, nil
	}
}
