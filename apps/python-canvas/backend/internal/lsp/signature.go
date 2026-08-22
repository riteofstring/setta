package lsp

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf16"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

var ErrSignatureNotFound = errors.New("lsp: signature help returned no callable signature")
var ErrMalformedSignature = errors.New("lsp: signature help returned an invalid callable signature")

func normalizeSignatureHelp(result SignatureHelpResult) ([]aggregate.ProviderParameter, error) {
	parameters, err := normalizeSignatureParameters(result)
	if err != nil {
		return nil, err
	}
	converted := make([]aggregate.ProviderParameter, 0, len(parameters))
	for _, parameter := range parameters {
		converted = append(converted, aggregate.ProviderParameter{
			Name:           parameter.Name,
			PassingStyle:   parameter.PassingStyle,
			TypeAnnotation: parameter.TypeAnnotation,
			Default:        copyString(parameter.Default),
		})
	}
	return converted, nil
}

type normalizedSignatureParameter struct {
	Name           string
	PassingStyle   aggregate.PassingStyle
	TypeAnnotation *string
	Default        *string
}

// normalizeSignatureParameters turns one provider signature into the five
// canonical Python passing styles. Marker pseudo-parameters are interpreted
// from the complete signature label rather than guessed from an individual
// row, so positional-only and keyword-only boundaries remain exact.
func normalizeSignatureParameters(result SignatureHelpResult) ([]normalizedSignatureParameter, error) {
	if len(result.Signatures) == 0 {
		return nil, ErrSignatureNotFound
	}
	signature := result.Signatures[0]
	styles, err := signatureParameterStyles(signature.Label)
	if err != nil {
		return nil, err
	}
	labels := make([]string, 0, len(signature.Parameters))

	for _, information := range signature.Parameters {
		label := parameterLabelText(signature.Label, information.Label)
		if label == "/" || label == "*" {
			continue
		}
		if label == "" {
			return nil, fmt.Errorf("%w: parameter label is empty", ErrMalformedSignature)
		}
		labels = append(labels, label)
	}
	if len(labels) != len(styles) {
		return nil, fmt.Errorf(
			"%w: signature has %d parameter labels but %d parameter styles",
			ErrMalformedSignature,
			len(labels),
			len(styles),
		)
	}
	parameters := make([]normalizedSignatureParameter, 0, len(labels))
	for index, label := range labels {
		parameter, err := parseSignatureParameter(label, styles[index])
		if err != nil {
			return nil, err
		}
		parameters = append(parameters, parameter)
	}
	return parameters, nil
}

func parameterLabelText(signatureLabel string, raw json.RawMessage) string {
	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		return strings.TrimSpace(text)
	}
	var offsets []int
	if err := json.Unmarshal(raw, &offsets); err != nil || len(offsets) != 2 {
		return ""
	}
	return strings.TrimSpace(utf16Substring(signatureLabel, offsets[0], offsets[1]))
}

func utf16Substring(value string, start int, end int) string {
	if start < 0 || end < start {
		return ""
	}
	startByte, foundStart := utf16ByteOffset(value, start)
	if !foundStart {
		return ""
	}
	endByte, foundEnd := utf16ByteOffset(value, end)
	if !foundEnd || endByte < startByte {
		return ""
	}
	return value[startByte:endByte]
}

func utf16ByteOffset(value string, target int) (int, bool) {
	unitOffset := 0
	for byteOffset, runeValue := range value {
		if unitOffset == target {
			return byteOffset, true
		}
		unitOffset += utf16.RuneLen(runeValue)
		if unitOffset > target {
			return 0, false
		}
	}
	if unitOffset == target {
		return len(value), true
	}
	return 0, false
}

func parseSignatureParameter(label string, passingStyle aggregate.PassingStyle) (normalizedSignatureParameter, error) {
	parameter := normalizedSignatureParameter{PassingStyle: passingStyle}
	label = strings.TrimSpace(label)
	if beforeDefault, defaultValue, found := strings.Cut(label, "="); found {
		label = strings.TrimSpace(beforeDefault)
		value := strings.TrimSpace(defaultValue)
		parameter.Default = &value
	}
	if beforeType, typeAnnotation, found := strings.Cut(label, ":"); found {
		label = strings.TrimSpace(beforeType)
		annotation := strings.TrimSpace(typeAnnotation)
		if annotation == "" {
			return normalizedSignatureParameter{}, fmt.Errorf("%w: parameter label %q has an empty type annotation", ErrMalformedSignature, label)
		}
		parameter.TypeAnnotation = &annotation
	}

	if strings.HasPrefix(label, "**") {
		label = strings.TrimPrefix(label, "**")
	} else if strings.HasPrefix(label, "*") {
		label = strings.TrimPrefix(label, "*")
	}
	name := leadingIdentifier(strings.TrimSpace(label))
	if name == "" {
		return normalizedSignatureParameter{}, fmt.Errorf("%w: parameter label %q has no identifier", ErrMalformedSignature, label)
	}
	parameter.Name = name
	return parameter, nil
}

func leadingIdentifier(value string) string {
	for index, runeValue := range value {
		if runeValue == '_' || unicode.IsLetter(runeValue) || (index > 0 && unicode.IsDigit(runeValue)) {
			continue
		}
		return value[:index]
	}
	return value
}

func signatureParameterStyles(label string) ([]aggregate.PassingStyle, error) {
	tokens, err := signatureParameterTokens(label)
	if err != nil {
		return nil, err
	}
	styles := make([]aggregate.PassingStyle, 0, len(tokens))
	state := signatureMarkerState{}
	for _, token := range tokens {
		styles, err = appendSignatureStyle(styles, &state, token)
		if err != nil {
			return nil, err
		}
	}
	if err := state.validate(); err != nil {
		return nil, err
	}
	return styles, nil
}

type signatureMarkerState struct {
	positionalOnlyMarked  bool
	keywordOnly           bool
	variadicPositional    bool
	variadicKeyword       bool
	bareKeywordOnlyMarker bool
	keywordOnlyParameter  bool
}

func appendSignatureStyle(
	styles []aggregate.PassingStyle,
	state *signatureMarkerState,
	token string,
) ([]aggregate.PassingStyle, error) {
	token = strings.TrimSpace(token)
	if state.variadicKeyword {
		return nil, fmt.Errorf("%w: variadic-keyword parameter must be final", ErrMalformedSignature)
	}
	switch token {
	case "":
		return nil, fmt.Errorf("%w: signature has an empty parameter token", ErrMalformedSignature)
	case "/":
		return markPositionalOnly(styles, state)
	case "*":
		return markKeywordOnly(styles, state)
	default:
		style := signatureStyleForToken(token, state.keywordOnly)
		switch style {
		case aggregate.PassingStyleVariadicPositional:
			if state.keywordOnly || state.variadicPositional {
				return nil, fmt.Errorf("%w: variadic-positional parameter is duplicated or out of order", ErrMalformedSignature)
			}
			state.variadicPositional = true
			state.keywordOnly = true
		case aggregate.PassingStyleVariadicKeyword:
			if state.bareKeywordOnlyMarker && !state.keywordOnlyParameter {
				return nil, fmt.Errorf("%w: keyword-only marker has no following named parameter", ErrMalformedSignature)
			}
			state.variadicKeyword = true
		case aggregate.PassingStyleKeywordOnly:
			state.keywordOnlyParameter = true
		}
		return append(styles, style), nil
	}
}

func markPositionalOnly(styles []aggregate.PassingStyle, state *signatureMarkerState) ([]aggregate.PassingStyle, error) {
	if state.positionalOnlyMarked || state.keywordOnly || state.variadicPositional || state.variadicKeyword {
		return nil, fmt.Errorf("%w: positional-only marker is duplicated or out of order", ErrMalformedSignature)
	}
	marked := false
	for index, style := range styles {
		if style != aggregate.PassingStylePositionalOrKeyword {
			return nil, fmt.Errorf("%w: positional-only marker is out of order", ErrMalformedSignature)
		}
		styles[index] = aggregate.PassingStylePositionalOnly
		marked = true
	}
	if !marked {
		return nil, fmt.Errorf("%w: positional-only marker has no preceding parameter", ErrMalformedSignature)
	}
	state.positionalOnlyMarked = true
	return styles, nil
}

func markKeywordOnly(styles []aggregate.PassingStyle, state *signatureMarkerState) ([]aggregate.PassingStyle, error) {
	if state.keywordOnly || state.variadicPositional || state.variadicKeyword {
		return nil, fmt.Errorf("%w: keyword-only marker is duplicated or out of order", ErrMalformedSignature)
	}
	state.keywordOnly = true
	state.bareKeywordOnlyMarker = true
	return styles, nil
}

func (state signatureMarkerState) validate() error {
	if state.bareKeywordOnlyMarker && !state.keywordOnlyParameter {
		return fmt.Errorf("%w: keyword-only marker has no following named parameter", ErrMalformedSignature)
	}
	return nil
}

func signatureStyleForToken(token string, keywordOnly bool) aggregate.PassingStyle {
	token = strings.TrimSpace(token)
	switch {
	case strings.HasPrefix(token, "**"):
		return aggregate.PassingStyleVariadicKeyword
	case strings.HasPrefix(token, "*"):
		return aggregate.PassingStyleVariadicPositional
	case keywordOnly:
		return aggregate.PassingStyleKeywordOnly
	default:
		return aggregate.PassingStylePositionalOrKeyword
	}
}

func signatureParameterTokens(label string) ([]string, error) {
	open, close, err := signatureParameterBounds(label)
	if err != nil {
		return nil, err
	}
	contents := strings.TrimSpace(label[open+1 : close])
	if contents == "" {
		return []string{}, nil
	}
	return splitSignatureTokens(contents)
}

func signatureParameterBounds(label string) (int, int, error) {
	open := strings.Index(label, "(")
	if open == -1 {
		return 0, 0, fmt.Errorf("%w: signature label has no parameter list", ErrMalformedSignature)
	}
	depth := 0
	for index, runeValue := range label[open:] {
		var closed bool
		depth, closed = advanceSignatureDepth(depth, runeValue)
		if closed {
			return open, open + index, nil
		}
		if depth < 0 {
			return 0, 0, fmt.Errorf("%w: signature parameter list is unbalanced", ErrMalformedSignature)
		}
	}
	return 0, 0, fmt.Errorf("%w: signature parameter list is unbalanced", ErrMalformedSignature)
}

func advanceSignatureDepth(depth int, character rune) (int, bool) {
	switch character {
	case '(':
		return depth + 1, false
	case ')':
		depth--
		return depth, depth == 0
	default:
		return depth, false
	}
}

func splitSignatureTokens(contents string) ([]string, error) {
	tokens := make([]string, 0, 4)
	start := 0
	nesting := 0
	for index, runeValue := range contents {
		var err error
		nesting, err = advanceTokenNesting(nesting, runeValue)
		if err != nil {
			return nil, err
		}
		if runeValue == ',' && nesting == 0 {
			tokens = append(tokens, strings.TrimSpace(contents[start:index]))
			start = index + 1
		}
	}
	if nesting != 0 {
		return nil, fmt.Errorf("%w: signature parameter token is unbalanced", ErrMalformedSignature)
	}
	tokens = append(tokens, strings.TrimSpace(contents[start:]))
	return tokens, nil
}

func advanceTokenNesting(nesting int, character rune) (int, error) {
	switch character {
	case '(', '[', '{':
		return nesting + 1, nil
	case ')', ']', '}':
		if nesting == 0 {
			return 0, fmt.Errorf("%w: signature parameter token is unbalanced", ErrMalformedSignature)
		}
		return nesting - 1, nil
	default:
		return nesting, nil
	}
}

func copyString(value *string) *string {
	if value == nil {
		return nil
	}
	clone := *value
	return &clone
}
