package plugins

import (
	"fmt"
	"strconv"
	"strings"
)

type parsedVersion struct {
	epoch   int
	release []int
	pre     *versionPreRelease
	post    *int
	dev     *int
	local   []versionLocalSegment
}

type versionPreRelease struct {
	kind int
	num  int
}

type versionLocalSegment struct {
	numeric bool
	number  int
	value   string
}

type parsedSpecifierSet struct {
	clauses []parsedSpecifier
}

type parsedSpecifier struct {
	kind    specifierKind
	op      string
	version parsedVersion
	prefix  []int
}

type specifierKind int

const (
	specifierKindComparison specifierKind = iota
	specifierKindPrefixMatch
	specifierKindCompatible
)

const (
	preReleaseAlpha = iota
	preReleaseBeta
	preReleaseRC
)

type parsedVersionSuffixes struct {
	pre   *versionPreRelease
	post  *int
	dev   *int
	local []versionLocalSegment
}

func parseVersion(raw string) (parsedVersion, error) {
	trimmed, err := normalizeVersionInput(raw)
	if err != nil {
		return parsedVersion{}, err
	}
	epoch, trimmed, err := consumeVersionEpoch(raw, trimmed)
	if err != nil {
		return parsedVersion{}, err
	}
	release, rest, err := consumeRelease(trimmed)
	if err != nil {
		return parsedVersion{}, err
	}
	suffixes, rest, err := consumeVersionSuffixes(rest)
	if err != nil {
		return parsedVersion{}, err
	}
	if rest != "" {
		return parsedVersion{}, fmt.Errorf("unsupported version suffix %q", rest)
	}

	return parsedVersion{
		epoch:   epoch,
		release: release,
		pre:     suffixes.pre,
		post:    suffixes.post,
		dev:     suffixes.dev,
		local:   suffixes.local,
	}, nil
}

func normalizeVersionInput(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return "", fmt.Errorf("version is required")
	}
	if hasVersionPrefix(trimmed[0]) {
		trimmed = trimmed[1:]
	}
	if trimmed == "" {
		return "", fmt.Errorf("version is required")
	}
	return trimmed, nil
}

func hasVersionPrefix(ch byte) bool {
	return ch == 'v' || ch == 'V'
}

func consumeVersionEpoch(original string, raw string) (int, string, error) {
	epochIndex := strings.IndexByte(raw, '!')
	if epochIndex < 0 {
		return 0, raw, nil
	}
	parsedEpoch, ok := parseNumericToken(raw[:epochIndex])
	if !ok {
		return 0, "", fmt.Errorf("invalid epoch %q", original)
	}
	return parsedEpoch, raw[epochIndex+1:], nil
}

func consumeVersionSuffixes(raw string) (parsedVersionSuffixes, string, error) {
	pre, remainder, err := consumePreRelease(raw)
	if err != nil {
		return parsedVersionSuffixes{}, "", err
	}
	post, remainder, err := consumePostRelease(remainder)
	if err != nil {
		return parsedVersionSuffixes{}, "", err
	}
	dev, remainder, err := consumeDevRelease(remainder)
	if err != nil {
		return parsedVersionSuffixes{}, "", err
	}
	local, remainder, err := consumeLocalVersion(remainder)
	if err != nil {
		return parsedVersionSuffixes{}, "", err
	}
	return parsedVersionSuffixes{
		pre:   pre,
		post:  post,
		dev:   dev,
		local: local,
	}, remainder, nil
}

func parseSpecifierSet(raw string) (parsedSpecifierSet, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return parsedSpecifierSet{}, nil
	}

	parts := strings.Split(trimmed, ",")
	clauses := make([]parsedSpecifier, 0, len(parts))
	for _, part := range parts {
		specifier, err := parseSpecifier(part)
		if err != nil {
			return parsedSpecifierSet{}, err
		}
		clauses = append(clauses, specifier)
	}
	return parsedSpecifierSet{clauses: clauses}, nil
}

func parseSpecifier(raw string) (parsedSpecifier, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return parsedSpecifier{}, fmt.Errorf("empty version specifier")
	}

	for _, op := range []string{"<=", ">=", "==", "!=", "~=", "<", ">"} {
		if !strings.HasPrefix(trimmed, op) {
			continue
		}
		value := strings.TrimSpace(trimmed[len(op):])
		if value == "" {
			return parsedSpecifier{}, fmt.Errorf("missing version in specifier %q", raw)
		}
		switch op {
		case "==", "!=":
			if strings.HasSuffix(value, ".*") {
				prefix, err := parseReleasePrefix(strings.TrimSpace(strings.TrimSuffix(value, ".*")))
				if err != nil {
					return parsedSpecifier{}, err
				}
				return parsedSpecifier{
					kind:   specifierKindPrefixMatch,
					op:     op,
					prefix: prefix,
				}, nil
			}
		case "~=":
			version, err := parseVersion(value)
			if err != nil {
				return parsedSpecifier{}, err
			}
			if len(version.release) < 2 {
				return parsedSpecifier{}, fmt.Errorf("compatible release specifier requires at least two release segments")
			}
			return parsedSpecifier{
				kind:    specifierKindCompatible,
				op:      op,
				version: version,
			}, nil
		}

		version, err := parseVersion(value)
		if err != nil {
			return parsedSpecifier{}, err
		}
		return parsedSpecifier{
			kind:    specifierKindComparison,
			op:      op,
			version: version,
		}, nil
	}

	return parsedSpecifier{}, fmt.Errorf("unsupported version specifier %q", raw)
}

func parseReleasePrefix(raw string) ([]int, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, fmt.Errorf("release prefix is required")
	}
	release, rest, err := consumeRelease(trimmed)
	if err != nil {
		return nil, err
	}
	if rest != "" {
		return nil, fmt.Errorf("invalid release prefix %q", raw)
	}
	return release, nil
}

func (s parsedSpecifierSet) Contains(version parsedVersion) bool {
	if len(s.clauses) == 0 {
		return true
	}
	if version.IsPrerelease() && !s.allowsPrereleases() {
		return false
	}
	for _, clause := range s.clauses {
		if !clause.Contains(version) {
			return false
		}
	}
	return true
}

func (s parsedSpecifierSet) allowsPrereleases() bool {
	for _, clause := range s.clauses {
		if clause.AllowsPrereleases() {
			return true
		}
	}
	return false
}

func (s parsedSpecifier) Contains(version parsedVersion) bool {
	switch s.kind {
	case specifierKindComparison:
		comparison := compareVersions(version, s.version)
		switch s.op {
		case "==":
			return comparison == 0
		case "!=":
			return comparison != 0
		case "<":
			return comparison < 0
		case "<=":
			return comparison <= 0
		case ">":
			return comparison > 0
		case ">=":
			return comparison >= 0
		}
	case specifierKindPrefixMatch:
		matches := releasePrefixMatches(version.release, s.prefix)
		if s.op == "==" {
			return matches
		}
		return !matches
	case specifierKindCompatible:
		return compareVersions(version, s.version) >= 0 && releasePrefixMatches(version.release, s.compatiblePrefix())
	}
	return false
}

func (s parsedSpecifier) AllowsPrereleases() bool {
	switch s.kind {
	case specifierKindComparison, specifierKindCompatible:
		return s.version.IsPrerelease()
	default:
		return false
	}
}

func (s parsedSpecifier) compatiblePrefix() []int {
	return s.version.release[:len(s.version.release)-1]
}

func (v parsedVersion) IsPrerelease() bool {
	return v.pre != nil || v.dev != nil
}

func compareVersions(left parsedVersion, right parsedVersion) int {
	if left.epoch != right.epoch {
		return compareInts(left.epoch, right.epoch)
	}
	if comparison := compareReleaseSegments(left.release, right.release); comparison != 0 {
		return comparison
	}
	if comparison := comparePreReleaseKey(left, right); comparison != 0 {
		return comparison
	}
	if comparison := compareOptionalInt(left.post, right.post, negativeInfinity, negativeInfinity); comparison != 0 {
		return comparison
	}
	if comparison := compareOptionalInt(left.dev, right.dev, positiveInfinity, positiveInfinity); comparison != 0 {
		return comparison
	}
	return compareLocalVersions(left.local, right.local)
}

func compareReleaseSegments(left []int, right []int) int {
	maxSegments := len(left)
	if len(right) > maxSegments {
		maxSegments = len(right)
	}
	for index := range maxSegments {
		leftValue := 0
		if index < len(left) {
			leftValue = left[index]
		}
		rightValue := 0
		if index < len(right) {
			rightValue = right[index]
		}
		if leftValue != rightValue {
			return compareInts(leftValue, rightValue)
		}
	}
	return 0
}

func comparePreReleaseKey(left parsedVersion, right parsedVersion) int {
	leftState, leftPre := preReleaseKey(left)
	rightState, rightPre := preReleaseKey(right)
	if leftState != rightState {
		return compareInts(int(leftState), int(rightState))
	}
	if leftState != 0 {
		return 0
	}
	if leftPre.kind != rightPre.kind {
		return compareInts(leftPre.kind, rightPre.kind)
	}
	return compareInts(leftPre.num, rightPre.num)
}

func preReleaseKey(version parsedVersion) (int8, versionPreRelease) {
	if version.pre != nil {
		return 0, *version.pre
	}
	if version.post == nil && version.dev != nil {
		return negativeInfinity, versionPreRelease{}
	}
	return positiveInfinity, versionPreRelease{}
}

func compareOptionalInt(left *int, right *int, leftMissingState int8, rightMissingState int8) int {
	switch {
	case left == nil && right == nil:
		return 0
	case left == nil:
		return compareInts(int(leftMissingState), 0)
	case right == nil:
		return compareInts(0, int(rightMissingState))
	default:
		return compareInts(*left, *right)
	}
}

func compareLocalVersions(left []versionLocalSegment, right []versionLocalSegment) int {
	switch {
	case len(left) == 0 && len(right) == 0:
		return 0
	case len(left) == 0:
		return int(negativeInfinity)
	case len(right) == 0:
		return int(positiveInfinity)
	}

	maxSegments := len(left)
	if len(right) > maxSegments {
		maxSegments = len(right)
	}
	for index := range maxSegments {
		switch {
		case index >= len(left):
			return -1
		case index >= len(right):
			return 1
		}
		comparison := compareLocalSegment(left[index], right[index])
		if comparison != 0 {
			return comparison
		}
	}
	return 0
}

func compareLocalSegment(left versionLocalSegment, right versionLocalSegment) int {
	switch {
	case left.numeric && right.numeric:
		return compareInts(left.number, right.number)
	case left.numeric:
		return 1
	case right.numeric:
		return -1
	default:
		if left.value < right.value {
			return -1
		}
		if left.value > right.value {
			return 1
		}
		return 0
	}
}

func releasePrefixMatches(release []int, prefix []int) bool {
	for index, value := range prefix {
		candidateValue := 0
		if index < len(release) {
			candidateValue = release[index]
		}
		if candidateValue != value {
			return false
		}
	}
	return true
}

func consumeRelease(raw string) ([]int, string, error) {
	digits, rest := consumeDigits(raw)
	if digits == "" {
		return nil, "", fmt.Errorf("release segment is required")
	}
	value, err := strconv.Atoi(digits)
	if err != nil {
		return nil, "", fmt.Errorf("invalid release segment %q", digits)
	}
	segments := []int{value}

	for strings.HasPrefix(rest, ".") {
		if len(rest) == 1 || rest[1] < '0' || rest[1] > '9' {
			return segments, rest, nil
		}
		rest = rest[1:]
		digits, remainder := consumeDigits(rest)
		if digits == "" {
			return nil, "", fmt.Errorf("release segment is required after dot")
		}
		value, err := strconv.Atoi(digits)
		if err != nil {
			return nil, "", fmt.Errorf("invalid release segment %q", digits)
		}
		segments = append(segments, value)
		rest = remainder
	}
	return segments, rest, nil
}

func consumePreRelease(raw string) (*versionPreRelease, string, error) {
	if raw == "" {
		return nil, raw, nil
	}
	candidate := stripSeparatorPrefix(raw)
	label, rest, ok := matchVersionLabel(candidate, []string{"preview", "alpha", "beta", "pre", "rc", "c", "a", "b"})
	if !ok {
		return nil, raw, nil
	}
	number, rest, err := consumeOptionalReleaseNumber(rest)
	if err != nil {
		return nil, "", err
	}
	normalizedKind, ok := normalizedPreReleaseKind(label)
	if !ok {
		return nil, "", fmt.Errorf("invalid prerelease label %q", label)
	}
	return &versionPreRelease{
		kind: normalizedKind,
		num:  number,
	}, rest, nil
}

func consumePostRelease(raw string) (*int, string, error) {
	if raw == "" {
		return nil, raw, nil
	}
	if strings.HasPrefix(raw, "-") {
		numberText, rest := consumeDigits(raw[1:])
		if numberText == "" {
			return nil, raw, nil
		}
		number, err := strconv.Atoi(numberText)
		if err != nil {
			return nil, "", fmt.Errorf("invalid post release number %q", numberText)
		}
		return &number, rest, nil
	}

	candidate := stripSeparatorPrefix(raw)
	label, rest, ok := matchVersionLabel(candidate, []string{"post", "rev", "r"})
	if !ok {
		return nil, raw, nil
	}
	_ = label
	number, rest, err := consumeOptionalReleaseNumber(rest)
	if err != nil {
		return nil, "", err
	}
	return &number, rest, nil
}

func consumeDevRelease(raw string) (*int, string, error) {
	if raw == "" {
		return nil, raw, nil
	}
	candidate := stripSeparatorPrefix(raw)
	if !strings.HasPrefix(strings.ToLower(candidate), "dev") {
		return nil, raw, nil
	}
	number, rest, err := consumeOptionalReleaseNumber(candidate[3:])
	if err != nil {
		return nil, "", err
	}
	return &number, rest, nil
}

func consumeLocalVersion(raw string) ([]versionLocalSegment, string, error) {
	remainder, ok, err := requireLocalVersionBody(raw)
	if err != nil {
		return nil, "", err
	}
	if !ok {
		return nil, raw, nil
	}
	segmentTexts, err := splitLocalVersionSegments(remainder)
	if err != nil {
		return nil, "", err
	}
	segments, err := parseLocalVersionSegments(segmentTexts)
	if err != nil {
		return nil, "", err
	}
	return segments, "", nil
}

func requireLocalVersionBody(raw string) (string, bool, error) {
	if raw == "" || raw[0] != '+' {
		return "", false, nil
	}
	remainder := raw[1:]
	if remainder == "" {
		return "", true, fmt.Errorf("local version segment is required")
	}
	return remainder, true, nil
}

func splitLocalVersionSegments(raw string) ([]string, error) {
	segments := make([]string, 0, strings.Count(raw, ".")+strings.Count(raw, "-")+strings.Count(raw, "_")+1)
	start := 0
	for index := 0; index < len(raw); index++ {
		ch := raw[index]
		if isLocalVersionSeparator(ch) {
			segment, err := requireLocalVersionSegment(raw[start:index])
			if err != nil {
				return nil, err
			}
			segments = append(segments, segment)
			start = index + 1
			continue
		}
		if !isLocalVersionSegmentCharacter(ch) {
			return nil, fmt.Errorf("invalid local version character %q", string(ch))
		}
	}
	segment, err := requireLocalVersionSegment(raw[start:])
	if err != nil {
		return nil, err
	}
	return append(segments, segment), nil
}

func requireLocalVersionSegment(raw string) (string, error) {
	if raw == "" {
		return "", fmt.Errorf("invalid empty local version segment")
	}
	return raw, nil
}

func parseLocalVersionSegments(rawSegments []string) ([]versionLocalSegment, error) {
	segments := make([]versionLocalSegment, 0, len(rawSegments))
	for _, raw := range rawSegments {
		segment, err := parseLocalVersionSegment(raw)
		if err != nil {
			return nil, err
		}
		segments = append(segments, segment)
	}
	return segments, nil
}

func isLocalVersionSeparator(ch byte) bool {
	switch ch {
	case '.', '-', '_':
		return true
	default:
		return false
	}
}

func isLocalVersionSegmentCharacter(ch byte) bool {
	return isASCIILetter(ch) || (ch >= '0' && ch <= '9')
}

func parseLocalVersionSegment(raw string) (versionLocalSegment, error) {
	if number, ok := parseNumericToken(raw); ok {
		return versionLocalSegment{
			numeric: true,
			number:  number,
		}, nil
	}
	return versionLocalSegment{value: strings.ToLower(raw)}, nil
}

func consumeOptionalReleaseNumber(raw string) (int, string, error) {
	trimmed := stripSeparatorPrefix(raw)
	numberText, rest := consumeDigits(trimmed)
	if numberText == "" {
		return 0, trimmed, nil
	}
	number, err := strconv.Atoi(numberText)
	if err != nil {
		return 0, "", fmt.Errorf("invalid release suffix number %q", numberText)
	}
	return number, rest, nil
}

func matchVersionLabel(raw string, labels []string) (string, string, bool) {
	lower := strings.ToLower(raw)
	for _, label := range labels {
		if strings.HasPrefix(lower, label) {
			return label, raw[len(label):], true
		}
	}
	return "", raw, false
}

func normalizedPreReleaseKind(label string) (int, bool) {
	switch label {
	case "a", "alpha":
		return preReleaseAlpha, true
	case "b", "beta":
		return preReleaseBeta, true
	case "rc", "c", "pre", "preview":
		return preReleaseRC, true
	default:
		return 0, false
	}
}

func consumeDigits(raw string) (string, string) {
	index := 0
	for index < len(raw) && raw[index] >= '0' && raw[index] <= '9' {
		index++
	}
	return raw[:index], raw[index:]
}

func stripSeparatorPrefix(raw string) string {
	if raw == "" {
		return raw
	}
	switch raw[0] {
	case '.', '-', '_':
		return raw[1:]
	default:
		return raw
	}
}

func parseNumericToken(raw string) (int, bool) {
	if raw == "" {
		return 0, false
	}
	for index := 0; index < len(raw); index++ {
		if raw[index] < '0' || raw[index] > '9' {
			return 0, false
		}
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, false
	}
	return value, true
}

func isASCIILetter(ch byte) bool {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

func asciiToLower(ch byte) byte {
	if ch >= 'A' && ch <= 'Z' {
		return ch + ('a' - 'A')
	}
	return ch
}

func compareInts(left int, right int) int {
	switch {
	case left < right:
		return -1
	case left > right:
		return 1
	default:
		return 0
	}
}

const (
	negativeInfinity int8 = -1
	positiveInfinity int8 = 1
)
