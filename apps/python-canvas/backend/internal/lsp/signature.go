package lsp

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf16"

	"github.com/setta/python-canvas/backend/internal/codegen"
	"github.com/setta/python-canvas/backend/internal/project"
)

var ErrSignatureNotFound = errors.New("lsp: signature help returned no callable signature")

func normalizeSignatureHelp(result SignatureHelpResult) (project.CallableSignature, error) {
	if len(result.Signatures) == 0 {
		return project.CallableSignature{}, ErrSignatureNotFound
	}
	signature := result.Signatures[0]
	parameters := make([]project.SignatureParameter, 0, len(signature.Parameters))
	positionalOnly := hasSignatureMarker(signature.Label, "/")
	keywordOnly := hasSignatureMarker(signature.Label, "*")

	for _, information := range signature.Parameters {
		label := parameterLabelText(signature.Label, information.Label)
		if label == "" || label == "/" || label == "*" {
			continue
		}
		parameter, err := parseSignatureParameter(label, positionalOnly, keywordOnly)
		if err != nil {
			return project.CallableSignature{}, err
		}
		parameters = append(parameters, parameter)
	}
	if len(parameters) == 0 {
		return project.CallableSignature{}, ErrSignatureNotFound
	}
	return project.CallableSignature{Parameters: parameters}, nil
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

func parseSignatureParameter(label string, positionalOnly bool, keywordOnly bool) (project.SignatureParameter, error) {
	parameter := project.SignatureParameter{}
	label = strings.TrimSpace(label)
	if beforeDefault, defaultValue, found := strings.Cut(label, "="); found {
		label = strings.TrimSpace(beforeDefault)
		value := strings.TrimSpace(defaultValue)
		parameter.Default = &value
	}
	if beforeType, typeAnnotation, found := strings.Cut(label, ":"); found {
		label = strings.TrimSpace(beforeType)
		parameter.TypeAnnotation = strings.TrimSpace(typeAnnotation)
	}

	passingStyle := codegen.ParameterPassingStylePositionalOrKeyword
	switch {
	case strings.HasPrefix(label, "**"):
		label = strings.TrimPrefix(label, "**")
		passingStyle = codegen.ParameterPassingStyle("variadic_keyword")
	case strings.HasPrefix(label, "*"):
		label = strings.TrimPrefix(label, "*")
		passingStyle = codegen.ParameterPassingStyle("variadic_positional")
	case positionalOnly:
		passingStyle = codegen.ParameterPassingStylePositionalOnly
	case keywordOnly:
		passingStyle = codegen.ParameterPassingStyle("keyword_only")
	}
	name := leadingIdentifier(strings.TrimSpace(label))
	if name == "" {
		return project.SignatureParameter{}, fmt.Errorf("lsp: signature parameter label %q has no identifier", label)
	}
	parameter.Name = name
	parameter.PassingStyle = passingStyle
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

func hasSignatureMarker(label string, marker string) bool {
	open := strings.Index(label, "(")
	if open == -1 {
		return false
	}
	depth := 0
	segmentStart := open + 1
	for index, runeValue := range label[open+1:] {
		absoluteIndex := open + 1 + index
		switch runeValue {
		case '(', '[', '{':
			depth++
		case ')', ']', '}':
			if depth == 0 && runeValue == ')' {
				return strings.TrimSpace(label[segmentStart:absoluteIndex]) == marker
			}
			if depth > 0 {
				depth--
			}
		case ',':
			if depth == 0 {
				if strings.TrimSpace(label[segmentStart:absoluteIndex]) == marker {
					return true
				}
				segmentStart = absoluteIndex + 1
			}
		}
	}
	return false
}
