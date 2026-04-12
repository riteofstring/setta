package docstringmarkdown

import (
	"errors"
	"regexp"
	"strings"
)

var ErrUnknownFormat = errors.New("unknown docstring format")

var (
	plainTextPattern     = regexp.MustCompile(`^((\w[\.!\?\)'\"](\s|$))|(\w[,:;]\s)|(\w[-']\w)|(\w\s['"\(])|\w|\s)+$`)
	googleMagicName      = regexp.MustCompile(`__(\S+)__`)
	cpythonSignatureLine = regexp.MustCompile(`^\w+\(\S*(, \S+)*(\[, \S+\])*\)\s--?>\s.+$`)
	rstParamTyped        = regexp.MustCompile(`^\s*:(?:param|parameter|arg|argument|key|keyword)\s+(\S+)\s+(\S+):\s*(.*)$`)
	rstParam             = regexp.MustCompile(`^\s*:(?:param|parameter|arg|argument|key|keyword)\s+(\S+):\s*(.*)$`)
	rstType              = regexp.MustCompile(`^\s*:type\s+(\S+):\s*(.*)$`)
	rstReturn            = regexp.MustCompile(`^\s*:(?:return|returns):\s*(.*)$`)
	rstReturnType        = regexp.MustCompile(`^\s*:rtype:\s*(\S+)\s*$`)
	rstRaises            = regexp.MustCompile(`^\s*:(?:raises|raise|except|exception)\s+(\S+):\s*(.*)$`)
)

var googleSectionHeaders = []string{
	"Args",
	"Returns",
	"Raises",
	"Yields",
	"Example",
	"Examples",
	"Attributes",
	"Note",
	"Todo",
}

var googlePlainSections = map[string]struct{}{
	"Examples": {},
	"Example":  {},
	"Note":     {},
	"Todo":     {},
}

var rstSectionHeaders = map[string]struct{}{
	"Parameters": {},
	"Returns":    {},
	"See Also":   {},
	"Examples":   {},
	"Attributes": {},
	"Notes":      {},
	"References": {},
}

var rstDirectivePatterns = []*regexp.Regexp{
	rstParamTyped,
	rstParam,
	rstType,
	rstReturn,
	rstReturnType,
	rstRaises,
}

func Convert(docstring string) (string, error) {
	normalized := normalizeNewlines(docstring)
	switch {
	case looksLikeGoogle(normalized):
		return googleToMarkdown(normalized), nil
	case looksLikeRST(normalized):
		return rstToMarkdown(normalized), nil
	case looksLikePlainText(normalized):
		return escapeMarkdown(normalized), nil
	case looksLikeCPython(normalized):
		return cpythonToMarkdown(normalized), nil
	default:
		return "", ErrUnknownFormat
	}
}

func looksLikeGoogle(value string) bool {
	for _, section := range googleSectionHeaders {
		if strings.Contains(value, section+":\n") {
			return true
		}
	}
	return false
}

func googleToMarkdown(text string) string {
	text = googleMagicName.ReplaceAllString(text, `\_\_$1\_\_`)
	lines := strings.Split(text, "\n")
	description := make([]string, 0, len(lines))
	sections := make([]googleSection, 0, 4)
	currentName := ""
	currentLines := make([]string, 0, 8)

	flushSection := func() {
		if currentName == "" {
			return
		}
		sections = append(sections, googleSection{
			name:    currentName,
			content: formatGoogleSection(currentName, currentLines),
		})
		currentName = ""
		currentLines = currentLines[:0]
	}

	for _, line := range lines {
		if sectionName, ok := parseGoogleSectionHeader(line); ok {
			flushSection()
			currentName = sectionName
			continue
		}
		if currentName == "" {
			description = append(description, line)
			continue
		}
		currentLines = append(currentLines, line)
	}
	flushSection()

	var builder strings.Builder
	descriptionText := strings.TrimRight(strings.Join(description, "\n"), "\n")
	if descriptionText != "" {
		builder.WriteString(descriptionText)
		builder.WriteString("\n\n")
	}
	for _, section := range sections {
		if section.content == "" {
			continue
		}
		builder.WriteString("#### ")
		builder.WriteString(section.name)
		builder.WriteString("\n\n")
		builder.WriteString(section.content)
		builder.WriteString("\n\n")
	}
	return strings.TrimRight(builder.String(), "\n") + "\n"
}

type googleSection struct {
	name    string
	content string
}

func parseGoogleSectionHeader(line string) (string, bool) {
	trimmed := strings.TrimSpace(line)
	for _, section := range googleSectionHeaders {
		if trimmed == section+":" {
			return section, true
		}
	}
	return "", false
}

func formatGoogleSection(name string, lines []string) string {
	content := strings.TrimRight(strings.Join(lines, "\n"), "\n")
	if _, ok := googlePlainSections[name]; ok {
		return dedent(content)
	}
	if strings.TrimSpace(content) == "" {
		return ""
	}
	var builder strings.Builder
	for _, part := range splitGoogleSectionParts(content) {
		rendered := formatGoogleSectionPart(part)
		if rendered == "" {
			continue
		}
		if builder.Len() != 0 {
			builder.WriteString("\n")
		}
		builder.WriteString(rendered)
	}
	return builder.String()
}

func splitGoogleSectionParts(content string) [][]string {
	lines := strings.Split(content, "\n")
	parts := make([][]string, 0, len(lines))
	current := make([]string, 0, 4)
	flush := func() {
		if len(current) == 0 {
			return
		}
		parts = append(parts, current)
		current = nil
	}

	for _, line := range lines {
		line = strings.TrimPrefix(line, "    ")
		if strings.HasPrefix(line, " ") {
			current = append(current, line)
			continue
		}
		flush()
		current = []string{line}
	}
	flush()
	return parts
}

func formatGoogleSectionPart(part []string) string {
	if len(part) == 0 {
		return ""
	}
	first := strings.TrimRight(part[0], " ")
	if key, description, ok := strings.Cut(first, ":"); ok {
		return formatGoogleKeyedPart(key, description, part[1:])
	}

	var builder strings.Builder
	builder.WriteString("- ")
	builder.WriteString(first)
	builder.WriteString("\n")
	writeGoogleContinuation(&builder, part[1:], "", false)
	return strings.TrimRight(builder.String(), "\n")
}

func formatGoogleKeyedPart(key, description string, continuation []string) string {
	var builder strings.Builder
	builder.WriteString("- `")
	builder.WriteString(key)
	builder.WriteString("`:")
	indentation := strings.Repeat(" ", len(key)+6)
	trimmedDescription := strings.TrimLeft(description, " ")
	if trimmedDescription != "" {
		builder.WriteString(" ")
		builder.WriteString(trimmedDescription)
		builder.WriteString("\n")
		writeGoogleContinuation(&builder, continuation, indentation, false)
		return strings.TrimRight(builder.String(), "\n")
	}

	builder.WriteString(" ")
	writeGoogleContinuation(&builder, continuation, indentation, true)
	return strings.TrimRight(builder.String(), "\n")
}

func writeGoogleContinuation(builder *strings.Builder, continuation []string, indentation string, skipFirstIndent bool) {
	for index, line := range continuation {
		trimmed := strings.TrimLeft(line, " ")
		if skipFirstIndent && index == 0 {
			builder.WriteString(trimmed)
			builder.WriteString("\n")
			continue
		}
		builder.WriteString(indentation)
		builder.WriteString(trimmed)
		builder.WriteString("\n")
	}
}

func looksLikeRST(value string) bool {
	lines := strings.Split(dedent(value), "\n")
	return hasRSTSectionHeaders(lines) || hasRSTDirectiveLines(lines)
}

func hasRSTSectionHeaders(lines []string) bool {
	for index := 0; index+1 < len(lines); index++ {
		if _, ok := rstSectionHeaderAt(lines, index); ok {
			return true
		}
	}
	return false
}

func hasRSTDirectiveLines(lines []string) bool {
	for _, line := range lines {
		if isRSTDirectiveLine(line) {
			return true
		}
	}
	return false
}

func isRSTDirectiveLine(line string) bool {
	for _, pattern := range rstDirectivePatterns {
		if pattern.MatchString(line) {
			return true
		}
	}
	return false
}

func rstSectionHeaderAt(lines []string, index int) (string, bool) {
	if index+1 >= len(lines) {
		return "", false
	}
	name := strings.TrimSpace(lines[index])
	underline := strings.TrimSpace(lines[index+1])
	if !isRSTSectionHeader(name, underline) {
		return "", false
	}
	return name, true
}

func isRSTSectionHeader(name, underline string) bool {
	if name == "" || underline == "" {
		return false
	}
	if _, ok := rstSectionHeaders[name]; !ok {
		return false
	}
	return len(underline) >= len(name) && onlyRunes(underline, '-')
}

func rstToMarkdown(text string) string {
	dedented := dedent(text)
	if strings.Contains(dedented, "\n") {
		if converted, ok := rstSectionsToMarkdown(dedented); ok {
			return converted
		}
	}
	return rstDirectiveLinesToMarkdown(dedented)
}

func rstSectionsToMarkdown(text string) (string, bool) {
	description, sections, foundSection := parseRSTSections(strings.Split(text, "\n"))
	if !foundSection {
		return "", false
	}
	return renderRSTSections(description, sections), true
}

func parseRSTSections(lines []string) ([]string, []rstSection, bool) {
	description := make([]string, 0, len(lines))
	sections := make([]rstSection, 0, 4)
	currentName := ""
	currentLines := make([]string, 0, 8)
	foundSection := false

	flushSection := func() {
		if currentName == "" {
			return
		}
		sections = append(sections, rstSection{name: currentName, lines: append([]string(nil), currentLines...)})
		currentName = ""
		currentLines = currentLines[:0]
	}

	for index := 0; index < len(lines); index++ {
		if name, ok := rstSectionHeaderAt(lines, index); ok {
			foundSection = true
			flushSection()
			currentName = name
			index++
			continue
		}
		if currentName == "" {
			description = append(description, lines[index])
			continue
		}
		currentLines = append(currentLines, lines[index])
	}
	flushSection()
	return description, sections, foundSection
}

func renderRSTSections(description []string, sections []rstSection) string {
	var builder strings.Builder
	descriptionText := strings.TrimRight(strings.Join(description, "\n"), "\n")
	if descriptionText != "" {
		builder.WriteString(descriptionText)
		builder.WriteString("\n\n")
	}
	for _, section := range sections {
		builder.WriteString("#### ")
		builder.WriteString(section.name)
		builder.WriteString("\n\n")
		builder.WriteString(formatRSTSection(section.name, section.lines))
		builder.WriteString("\n\n")
	}
	return strings.TrimRight(builder.String(), "\n") + "\n"
}

type rstSection struct {
	name  string
	lines []string
}

func formatRSTSection(name string, lines []string) string {
	switch name {
	case "Parameters", "Attributes":
		return formatRSTParameterBlocks(lines)
	default:
		return dedent(strings.Join(lines, "\n"))
	}
}

func formatRSTParameterBlocks(lines []string) string {
	blocks := make([][]string, 0, len(lines))
	current := make([]string, 0, 4)
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			if len(current) != 0 {
				blocks = append(blocks, current)
				current = nil
			}
			continue
		}
		if leadingIndent(line) == 0 {
			if len(current) != 0 {
				blocks = append(blocks, current)
			}
			current = []string{line}
			continue
		}
		current = append(current, line)
	}
	if len(current) != 0 {
		blocks = append(blocks, current)
	}

	var builder strings.Builder
	for _, block := range blocks {
		if len(block) == 0 {
			continue
		}
		header := strings.TrimSpace(block[0])
		if name, valueType, ok := strings.Cut(header, ":"); ok {
			builder.WriteString("- `")
			builder.WriteString(strings.TrimSpace(name))
			builder.WriteString("`: ")
			builder.WriteString(strings.TrimSpace(valueType))
			builder.WriteString("\n")
		} else {
			builder.WriteString("- ")
			builder.WriteString(header)
			builder.WriteString("\n")
		}
		for _, line := range block[1:] {
			builder.WriteString("    ")
			builder.WriteString(strings.TrimSpace(line))
			builder.WriteString("\n")
		}
	}
	return strings.TrimRight(builder.String(), "\n")
}

func rstDirectiveLinesToMarkdown(text string) string {
	lines := strings.Split(text, "\n")
	output := make([]string, 0, len(lines))
	lastParams := map[string]rstDirectiveParamState{}
	convertedAny := false

	for _, line := range lines {
		switch {
		case rstParamTyped.MatchString(line):
			matches := rstParamTyped.FindStringSubmatch(line)
			state := rstDirectiveParamState{
				index:       len(output),
				description: matches[3],
				valueType:   matches[1],
				renderType:  renderRSTDirectiveQuotedType,
			}
			output = append(output, buildRSTDirectiveParamEntry(matches[2], state))
			lastParams[matches[2]] = state
			convertedAny = true
		case rstParam.MatchString(line):
			matches := rstParam.FindStringSubmatch(line)
			state := rstDirectiveParamState{
				index:       len(output),
				description: matches[2],
			}
			output = append(output, buildRSTDirectiveParamEntry(matches[1], state))
			lastParams[matches[1]] = state
			convertedAny = true
		case rstType.MatchString(line):
			matches := rstType.FindStringSubmatch(line)
			if state, ok := lastParams[matches[1]]; ok {
				state.valueType = matches[2]
				state.renderType = renderRSTDirectivePlainType
				output[state.index] = buildRSTDirectiveParamEntry(matches[1], state)
				lastParams[matches[1]] = state
			} else {
				output = append(output, "- type `"+matches[1]+"`: "+matches[2])
			}
			convertedAny = true
		case rstReturn.MatchString(line):
			matches := rstReturn.FindStringSubmatch(line)
			entry := "- returns:"
			if strings.TrimSpace(matches[1]) != "" {
				entry += " " + matches[1]
			}
			output = append(output, entry)
			convertedAny = true
		case rstReturnType.MatchString(line):
			matches := rstReturnType.FindStringSubmatch(line)
			output = append(output, "- return type: `"+matches[1]+"`")
			convertedAny = true
		case rstRaises.MatchString(line):
			matches := rstRaises.FindStringSubmatch(line)
			entry := "- raises `" + matches[1] + "`:"
			if strings.TrimSpace(matches[2]) != "" {
				entry += " " + matches[2]
			}
			output = append(output, entry)
			convertedAny = true
		default:
			output = append(output, line)
		}
	}

	if !convertedAny {
		return text
	}
	return strings.TrimRight(strings.Join(output, "\n"), "\n") + "\n"
}

type rstDirectiveParamState struct {
	index       int
	description string
	valueType   string
	renderType  rstDirectiveTypeRenderMode
}

type rstDirectiveTypeRenderMode int

const (
	renderRSTDirectivePlainType rstDirectiveTypeRenderMode = iota
	renderRSTDirectiveQuotedType
)

func buildRSTDirectiveParamEntry(name string, state rstDirectiveParamState) string {
	entry := "- `" + name + "`"
	if strings.TrimSpace(state.valueType) != "" {
		entry += " ("
		if state.renderType == renderRSTDirectiveQuotedType {
			entry += "`" + state.valueType + "`"
		} else {
			entry += state.valueType
		}
		entry += ")"
	}
	entry += ":"
	if strings.TrimSpace(state.description) != "" {
		entry += " " + state.description
	}
	return entry
}

func looksLikePlainText(value string) bool {
	if strings.Contains(value, "_") {
		return false
	}
	return plainTextPattern.MatchString(value)
}

func looksLikeCPython(text string) bool {
	_, ok := cpythonSignatureLines(text)
	return ok
}

func cpythonToMarkdown(text string) string {
	signatureLines, _ := cpythonSignatureLines(text)
	var builder strings.Builder
	builder.WriteString("```\n")
	builder.WriteString(strings.Join(signatureLines, "\n"))
	builder.WriteString("\n```\n")
	return builder.String()
}

func cpythonSignatureLines(text string) ([]string, bool) {
	lines := strings.Split(text, "\n")
	signatureLines := make([]string, 0, len(lines))
	for index, line := range lines {
		switch {
		case index == 0 && cpythonSignatureLine.MatchString(line):
			signatureLines = append(signatureLines, line)
		case len(signatureLines) != 0 && strings.HasPrefix(line, "    "):
			signatureLines = append(signatureLines, line)
		default:
			if len(signatureLines) == 0 {
				return nil, false
			}
			return nil, false
		}
	}
	return signatureLines, len(signatureLines) != 0
}

func escapeMarkdown(text string) string {
	replacer := strings.NewReplacer(
		`\\`, `\\\\`,
		`#`, `\#`,
		`*`, `\*`,
		`_`, `\_`,
		`[`, `\[`,
		`]`, `\]`,
	)
	return replacer.Replace(text)
}

func normalizeNewlines(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\r", "\n")
}

func dedent(value string) string {
	lines := strings.Split(normalizeNewlines(value), "\n")
	minIndent := -1
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := leadingIndent(line)
		if minIndent == -1 || indent < minIndent {
			minIndent = indent
		}
	}
	if minIndent <= 0 {
		return strings.TrimRight(strings.Join(lines, "\n"), "\n")
	}
	for index, line := range lines {
		if len(line) < minIndent {
			lines[index] = strings.TrimLeft(line, " \t")
			continue
		}
		lines[index] = line[minIndent:]
	}
	return strings.TrimRight(strings.Join(lines, "\n"), "\n")
}

func leadingIndent(line string) int {
	indent := 0
	for _, r := range line {
		if r != ' ' && r != '\t' {
			break
		}
		indent++
	}
	return indent
}

func onlyRunes(value string, target rune) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r != target {
			return false
		}
	}
	return true
}
