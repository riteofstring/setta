package artifactdoc

import (
	"fmt"
	"strings"
	"unicode"
)

// valueFailure is a positionless failure. The compiler attaches the position,
// statement, component, and property it already knows.
type valueFailure struct {
	Code       Code
	Message    string
	Correction string
}

// allowedLinkSchemes are the only protocols a Markdown destination may name.
// Artifacts never load remote resources, so an allowed link still renders as
// inert text until a typed host action exists for it.
var allowedLinkSchemes = map[string]bool{
	"http":   true,
	"https":  true,
	"mailto": true,
}

var multilineRoles = map[StringRole]bool{
	StringRolePlain:    true,
	StringRoleMarkdown: true,
	StringRoleCode:     true,
}

// Bidirectional overrides and line separators let rendered text disagree with
// the characters actually stored, which is the trick that makes an artifact lie
// about a file path or a command. They are written as codepoints because they
// are invisible in source.
const (
	lineSeparator      = rune(0x2028)
	paragraphSeparator = rune(0x2029)
	arabicLetterMark   = rune(0x061c)
	leftToRightMark    = rune(0x200e)
	rightToLeftMark    = rune(0x200f)
	embeddingStart     = rune(0x202a)
	embeddingEnd       = rune(0x202e)
	isolateStart       = rune(0x2066)
	isolateEnd         = rune(0x2069)
)

func validateStringValue(schema ValueSchema, value string) *valueFailure {
	if failure := checkStringSize(schema, value); failure != nil {
		return failure
	}
	if failure := checkStringCharacters(schema.Role, value); failure != nil {
		return failure
	}
	switch schema.Role {
	case StringRoleMarkdown:
		return checkMarkdown(value)
	case StringRolePath:
		return checkWorkspacePath(value)
	}
	return nil
}

func checkStringSize(schema ValueSchema, value string) *valueFailure {
	if value == "" && schema.Role != StringRoleCell {
		return &valueFailure{
			Code:       CodeInvalidValue,
			Message:    "the value was empty",
			Correction: "provide real content, or omit the optional property entirely",
		}
	}
	if len(value) > schema.MaxBytes {
		return &valueFailure{
			Code:       CodeLimitExceeded,
			Message:    fmt.Sprintf("the value is %d bytes, over the %d byte limit", len(value), schema.MaxBytes),
			Correction: fmt.Sprintf("shorten the value to %d bytes, splitting long content across blocks", schema.MaxBytes),
		}
	}
	return nil
}

func checkStringCharacters(role StringRole, value string) *valueFailure {
	multiline := multilineRoles[role]
	for _, character := range value {
		if character == '\n' || character == '\t' {
			if multiline {
				continue
			}
			return singleLineFailure(role)
		}
		if failure := checkCharacter(character); failure != nil {
			return failure
		}
	}
	return nil
}

func checkCharacter(character rune) *valueFailure {
	if unicode.IsControl(character) {
		return &valueFailure{
			Code:       CodeUnsafeValue,
			Message:    fmt.Sprintf("the value contained the control character U+%04X", character),
			Correction: "remove control characters from the text",
		}
	}
	if isLayoutControl(character) {
		return &valueFailure{
			Code:       CodeUnsafeValue,
			Message:    fmt.Sprintf("the value contained the layout control character U+%04X", character),
			Correction: "remove bidirectional and line-separator control characters from the text",
		}
	}
	return nil
}

func isLayoutControl(character rune) bool {
	switch {
	case character == lineSeparator, character == paragraphSeparator:
		return true
	case character == arabicLetterMark, character == leftToRightMark, character == rightToLeftMark:
		return true
	case character >= embeddingStart && character <= embeddingEnd:
		return true
	case character >= isolateStart && character <= isolateEnd:
		return true
	}
	return false
}

func singleLineFailure(role StringRole) *valueFailure {
	return &valueFailure{
		Code:       CodeInvalidValue,
		Message:    fmt.Sprintf("a %s value spanned more than one line", role),
		Correction: "keep the value on one line, or move the longer content into a Text or Markdown block",
	}
}

func checkMarkdown(value string) *valueFailure {
	if failure := checkMarkdownMarkup(value); failure != nil {
		return failure
	}
	return checkMarkdownLinks(value)
}

func checkMarkdownMarkup(value string) *valueFailure {
	for index := 0; index < len(value); index++ {
		if escaped(value, index) {
			continue
		}
		if value[index] == '!' && index+1 < len(value) && value[index+1] == '[' {
			return &valueFailure{
				Code:       CodeUnsafeValue,
				Message:    "the Markdown embedded an image",
				Correction: "describe the visual in text or use a chart component; artifacts never load embedded or remote images",
			}
		}
		if value[index] == '<' && startsMarkup(value[index+1:]) {
			return &valueFailure{
				Code:       CodeUnsafeValue,
				Message:    "the Markdown contained raw HTML",
				Correction: `use Markdown syntax only, and escape a literal less-than sign as \<`,
			}
		}
	}
	return nil
}

func startsMarkup(rest string) bool {
	if rest == "" {
		return false
	}
	next := rest[0]
	return next == '/' || next == '!' || next == '?' || isIdentStart(next)
}

func escaped(value string, index int) bool {
	backslashes := 0
	for index--; index >= 0 && value[index] == '\\'; index-- {
		backslashes++
	}
	return backslashes%2 == 1
}

func checkMarkdownLinks(value string) *valueFailure {
	for index := 0; index+1 < len(value); index++ {
		if value[index] != ']' || value[index+1] != '(' || escaped(value, index) {
			continue
		}
		if failure := checkLinkDestination(readLinkDestination(value[index+2:])); failure != nil {
			return failure
		}
	}
	return checkMarkdownLinkDefinitions(value)
}

func checkMarkdownLinkDefinitions(value string) *valueFailure {
	for _, line := range strings.Split(value, "\n") {
		trimmed := strings.TrimLeft(line, " \t")
		if !strings.HasPrefix(trimmed, "[") {
			continue
		}
		closing := strings.Index(trimmed, "]:")
		if closing < 0 {
			continue
		}
		destination := strings.TrimSpace(trimmed[closing+2:])
		if failure := checkLinkDestination(readLinkDestination(destination)); failure != nil {
			return failure
		}
	}
	return nil
}

func readLinkDestination(rest string) string {
	end := strings.IndexAny(rest, " \t)\n")
	if end < 0 {
		return rest
	}
	return rest[:end]
}

func checkLinkDestination(destination string) *valueFailure {
	scheme, ok := linkScheme(destination)
	if !ok {
		return &valueFailure{
			Code:       CodeUnsafeValue,
			Message:    fmt.Sprintf("the link %q has no supported protocol", destination),
			Correction: "link to an http or https address, use mailto for an address, or point at a workspace file with FileReference",
		}
	}
	if !allowedLinkSchemes[scheme] {
		return &valueFailure{
			Code:       CodeUnsafeValue,
			Message:    fmt.Sprintf("the link protocol %q is not allowed in artifacts", scheme),
			Correction: "use only http, https, or mailto links",
		}
	}
	return nil
}

func linkScheme(destination string) (string, bool) {
	colon := strings.Index(destination, ":")
	if colon <= 0 {
		return "", false
	}
	if strings.ContainsAny(destination[:colon], "/?#") {
		return "", false
	}
	return strings.ToLower(destination[:colon]), true
}

// checkWorkspacePath validates the shape of a file reference. Resolving it
// against the conversation's authorized workspace root is the caller's job,
// because only the caller knows which workspace is in play.
func checkWorkspacePath(value string) *valueFailure {
	if failure := checkPathShape(value); failure != nil {
		return failure
	}
	for _, segment := range strings.Split(value, "/") {
		if failure := checkPathSegment(segment); failure != nil {
			return failure
		}
	}
	return nil
}

func checkPathShape(value string) *valueFailure {
	switch {
	case strings.HasPrefix(value, "/"), strings.HasPrefix(value, "~"):
		return pathFailure(value, "the path is absolute")
	case windowsDrivePath(value):
		return pathFailure(value, "the path used Windows drive notation")
	case strings.Contains(value, ":"):
		return pathFailure(value, "the path contained a colon")
	case strings.Contains(value, "\\"):
		return pathFailure(value, "the path used backslashes")
	case strings.Contains(value, "://"):
		return pathFailure(value, "the path was a URL")
	case strings.HasSuffix(value, "/"):
		return pathFailure(value, "the path ended with a separator")
	}
	return nil
}

func checkPathSegment(segment string) *valueFailure {
	switch {
	case segment == "":
		return pathFailure(segment, "the path had an empty segment")
	case segment == "." || segment == "..":
		return pathFailure(segment, "the path traversed outside the workspace")
	case strings.TrimSpace(segment) != segment:
		return pathFailure(segment, "a path segment began or ended with whitespace")
	}
	return nil
}

func windowsDrivePath(value string) bool {
	return len(value) >= 2 && isASCIIAlpha(value[0]) && value[1] == ':'
}

func isASCIIAlpha(value byte) bool {
	return (value >= 'a' && value <= 'z') || (value >= 'A' && value <= 'Z')
}

func pathFailure(value string, message string) *valueFailure {
	return &valueFailure{
		Code:       CodeUnsafeValue,
		Message:    fmt.Sprintf("%s: %q", message, value),
		Correction: "use a workspace-relative path with forward slashes, such as internal/conversation/domain.go",
	}
}
