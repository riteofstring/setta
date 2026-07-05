package terminal

import (
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	maxTerminalCSIBytes = 4096
	terminalTabWidth    = 8
)

type terminalScreenState int

const (
	terminalScreenStateGround terminalScreenState = iota
	terminalScreenStateEscape
	terminalScreenStateEscapeSingle
	terminalScreenStateCSI
	terminalScreenStateOSC
	terminalScreenStateOSCEscape
)

type terminalScreen struct {
	cols                     int
	rows                     int
	cursor                   terminalCursor
	savedCursor              terminalCursor
	lines                    [][]rune
	pendingInput             []byte
	pendingWrap              bool
	state                    terminalScreenState
	csi                      []byte
	unsupportedSequenceCount int
}

type terminalCursor struct {
	row int
	col int
}

type terminalCSISequence struct {
	final       byte
	params      []int
	paramsValid bool
	privateMode bool
}

func newTerminalScreen(cols int, rows int) *terminalScreen {
	screen := &terminalScreen{
		cols: cols,
		rows: rows,
	}
	screen.lines = makeTerminalScreenLines(cols, rows)
	return screen
}

func makeTerminalScreenLines(cols int, rows int) [][]rune {
	lines := make([][]rune, rows)
	for row := range lines {
		lines[row] = make([]rune, cols)
		for col := range lines[row] {
			lines[row][col] = ' '
		}
	}
	return lines
}

func (screen *terminalScreen) Resize(cols int, rows int) {
	next := makeTerminalScreenLines(cols, rows)
	copyRows := min(rows, screen.rows)
	copyCols := min(cols, screen.cols)
	for row := 0; row < copyRows; row += 1 {
		copy(next[row][:copyCols], screen.lines[row][:copyCols])
	}
	screen.cols = cols
	screen.rows = rows
	screen.lines = next
	screen.cursor.row = clampTerminalScreenIndex(screen.cursor.row, rows)
	screen.cursor.col = clampTerminalScreenIndex(screen.cursor.col, cols)
	screen.savedCursor.row = clampTerminalScreenIndex(screen.savedCursor.row, rows)
	screen.savedCursor.col = clampTerminalScreenIndex(screen.savedCursor.col, cols)
	screen.pendingWrap = false
}

func (screen *terminalScreen) Feed(data []byte) {
	if len(data) == 0 {
		return
	}
	input := data
	if len(screen.pendingInput) > 0 {
		combined := make([]byte, 0, len(screen.pendingInput)+len(data))
		combined = append(combined, screen.pendingInput...)
		combined = append(combined, data...)
		input = combined
		screen.pendingInput = nil
	}
	for index := 0; index < len(input); {
		switch screen.state {
		case terminalScreenStateGround:
			next, ok := screen.feedGround(input, index)
			if !ok {
				screen.pendingInput = append(screen.pendingInput[:0], input[index:]...)
				return
			}
			index = next
		case terminalScreenStateEscape:
			screen.feedEscape(input[index])
			index += 1
		case terminalScreenStateEscapeSingle:
			screen.state = terminalScreenStateGround
			index += 1
		case terminalScreenStateCSI:
			screen.feedCSI(input[index])
			index += 1
		case terminalScreenStateOSC:
			screen.feedOSC(input[index])
			index += 1
		case terminalScreenStateOSCEscape:
			screen.feedOSCEscape(input[index])
			index += 1
		default:
			screen.unsupportedSequenceCount += 1
			screen.state = terminalScreenStateGround
		}
	}
}

func (screen *terminalScreen) feedGround(input []byte, index int) (int, bool) {
	value := input[index]
	if value == 0x1b {
		screen.pendingWrap = false
		screen.state = terminalScreenStateEscape
		return index + 1, true
	}
	if value < 0x20 || value == 0x7f {
		screen.applyControl(value)
		return index + 1, true
	}
	r, size := utf8.DecodeRune(input[index:])
	if r == utf8.RuneError && size == 1 && !utf8.FullRune(input[index:]) {
		return index, false
	}
	screen.writeRune(r)
	return index + size, true
}

func (screen *terminalScreen) feedEscape(value byte) {
	switch value {
	case '[':
		screen.csi = screen.csi[:0]
		screen.state = terminalScreenStateCSI
	case ']':
		screen.state = terminalScreenStateOSC
	case '7':
		screen.savedCursor = screen.cursor
		screen.state = terminalScreenStateGround
	case '8':
		screen.cursor = screen.savedCursor
		screen.pendingWrap = false
		screen.state = terminalScreenStateGround
	case 'c':
		screen.reset()
		screen.state = terminalScreenStateGround
	case 'D':
		screen.lineFeed()
		screen.state = terminalScreenStateGround
	case 'E':
		screen.carriageReturn()
		screen.lineFeed()
		screen.state = terminalScreenStateGround
	case 'M':
		screen.reverseIndex()
		screen.state = terminalScreenStateGround
	case '(', ')', '*', '+', '-', '.', '/', '#', '%', ' ':
		screen.state = terminalScreenStateEscapeSingle
	default:
		screen.unsupportedSequenceCount += 1
		screen.state = terminalScreenStateGround
	}
}

func (screen *terminalScreen) feedCSI(value byte) {
	screen.csi = append(screen.csi, value)
	if len(screen.csi) > maxTerminalCSIBytes {
		screen.unsupportedSequenceCount += 1
		screen.csi = screen.csi[:0]
		screen.state = terminalScreenStateGround
		return
	}
	if value < 0x40 || value > 0x7e {
		return
	}
	screen.applyCSI(screen.csi)
	screen.csi = screen.csi[:0]
	screen.state = terminalScreenStateGround
}

func (screen *terminalScreen) feedOSC(value byte) {
	switch value {
	case 0x07:
		screen.state = terminalScreenStateGround
	case 0x1b:
		screen.state = terminalScreenStateOSCEscape
	}
}

func (screen *terminalScreen) feedOSCEscape(value byte) {
	if value == '\\' {
		screen.state = terminalScreenStateGround
		return
	}
	screen.state = terminalScreenStateOSC
}

func (screen *terminalScreen) applyControl(value byte) {
	switch value {
	case '\x00', '\x07', '\x0e', '\x0f':
		return
	case '\b':
		screen.pendingWrap = false
		if screen.cursor.col > 0 {
			screen.cursor.col -= 1
		}
	case '\t':
		screen.pendingWrap = false
		next := ((screen.cursor.col / terminalTabWidth) + 1) * terminalTabWidth
		screen.cursor.col = min(next, screen.cols-1)
	case '\n', '\v', '\f':
		screen.lineFeed()
	case '\r':
		screen.carriageReturn()
	default:
		screen.unsupportedSequenceCount += 1
	}
}

func (screen *terminalScreen) applyCSI(sequence []byte) {
	csi, ok := terminalCSISequenceFromBytes(sequence)
	if !ok {
		return
	}
	if !csi.paramsValid && csi.final != 'm' {
		screen.unsupportedSequenceCount += 1
		return
	}
	screen.applyCSISequence(csi)
}

func (screen *terminalScreen) applyCSISequence(csi terminalCSISequence) {
	if screen.applyCSICursor(csi.final, csi.params) {
		return
	}
	if screen.applyCSIEraseOrScroll(csi.final, csi.params) {
		return
	}
	if screen.applyCSIState(csi) {
		return
	}
	screen.unsupportedSequenceCount += 1
}

func terminalCSISequenceFromBytes(sequence []byte) (terminalCSISequence, bool) {
	if len(sequence) == 0 {
		return terminalCSISequence{}, false
	}
	final := sequence[len(sequence)-1]
	rawParams := string(sequence[:len(sequence)-1])
	params, ok := parseTerminalCSIParams(rawParams)
	return terminalCSISequence{
		final:       final,
		params:      params,
		paramsValid: ok,
		privateMode: strings.HasPrefix(rawParams, "?"),
	}, true
}

func (screen *terminalScreen) applyCSIState(csi terminalCSISequence) bool {
	switch csi.final {
	case 'h', 'l':
		if csi.privateMode && terminalCSIPrivateModeAffectsScreen(csi.params) {
			screen.unsupportedSequenceCount += 1
		}
		screen.pendingWrap = false
	case 'm':
		screen.pendingWrap = false
	case 's':
		screen.savedCursor = screen.cursor
		screen.pendingWrap = false
	case 'u':
		screen.cursor = screen.savedCursor
		screen.pendingWrap = false
	default:
		return false
	}
	return true
}

func (screen *terminalScreen) applyCSICursor(final byte, params []int) bool {
	switch final {
	case 'A', 'B', 'C', 'D', 'E', 'F':
		screen.applyCSIRelativeCursor(final, params)
	case 'G':
		screen.cursor.col = clampTerminalScreenIndex(terminalCSIPositiveParam(params, 0, 1)-1, screen.cols)
		screen.pendingWrap = false
	case 'H', 'f':
		screen.applyCSIPosition(params)
	case 'd':
		screen.cursor.row = clampTerminalScreenIndex(terminalCSIPositiveParam(params, 0, 1)-1, screen.rows)
		screen.pendingWrap = false
	default:
		return false
	}
	return true
}

func (screen *terminalScreen) applyCSIRelativeCursor(final byte, params []int) {
	count := terminalCSIPositiveParam(params, 0, 1)
	switch final {
	case 'A':
		screen.moveCursor(-count, 0)
	case 'B':
		screen.moveCursor(count, 0)
	case 'C':
		screen.moveCursor(0, count)
	case 'D':
		screen.moveCursor(0, -count)
	case 'E':
		screen.moveCursor(count, 0)
		screen.cursor.col = 0
	case 'F':
		screen.moveCursor(-count, 0)
		screen.cursor.col = 0
	}
}

func (screen *terminalScreen) applyCSIPosition(params []int) {
	row := terminalCSIPositiveParam(params, 0, 1) - 1
	col := terminalCSIPositiveParam(params, 1, 1) - 1
	screen.cursor = terminalCursor{
		row: clampTerminalScreenIndex(row, screen.rows),
		col: clampTerminalScreenIndex(col, screen.cols),
	}
	screen.pendingWrap = false
}

func (screen *terminalScreen) applyCSIEraseOrScroll(final byte, params []int) bool {
	switch final {
	case 'J':
		screen.eraseDisplay(terminalCSIParam(params, 0, 0))
	case 'K':
		screen.eraseLine(terminalCSIParam(params, 0, 0))
	case 'S':
		screen.scrollUp(terminalCSIPositiveParam(params, 0, 1))
	case 'T':
		screen.scrollDown(terminalCSIPositiveParam(params, 0, 1))
	default:
		return false
	}
	return true
}

func terminalCSIPrivateModeAffectsScreen(params []int) bool {
	for _, param := range params {
		switch param {
		case 12, 25, 2004:
			continue
		default:
			return true
		}
	}
	return false
}

func (screen *terminalScreen) writeRune(r rune) {
	if screen.pendingWrap {
		screen.carriageReturn()
		screen.lineFeed()
	}
	screen.lines[screen.cursor.row][screen.cursor.col] = r
	if screen.cursor.col == screen.cols-1 {
		screen.pendingWrap = true
		return
	}
	screen.cursor.col += 1
}

func (screen *terminalScreen) lineFeed() {
	screen.pendingWrap = false
	if screen.cursor.row == screen.rows-1 {
		screen.scrollUp(1)
		return
	}
	screen.cursor.row += 1
}

func (screen *terminalScreen) carriageReturn() {
	screen.pendingWrap = false
	screen.cursor.col = 0
}

func (screen *terminalScreen) reverseIndex() {
	screen.pendingWrap = false
	if screen.cursor.row > 0 {
		screen.cursor.row -= 1
		return
	}
	screen.scrollDown(1)
}

func (screen *terminalScreen) moveCursor(deltaRow int, deltaCol int) {
	screen.cursor.row = clampTerminalScreenIndex(screen.cursor.row+deltaRow, screen.rows)
	screen.cursor.col = clampTerminalScreenIndex(screen.cursor.col+deltaCol, screen.cols)
	screen.pendingWrap = false
}

func (screen *terminalScreen) eraseDisplay(mode int) {
	screen.pendingWrap = false
	switch mode {
	case 0:
		screen.eraseLineFrom(screen.cursor.row, screen.cursor.col)
		for row := screen.cursor.row + 1; row < screen.rows; row += 1 {
			screen.eraseWholeLine(row)
		}
	case 1:
		for row := 0; row < screen.cursor.row; row += 1 {
			screen.eraseWholeLine(row)
		}
		screen.eraseLineTo(screen.cursor.row, screen.cursor.col)
	case 2, 3:
		for row := range screen.lines {
			screen.eraseWholeLine(row)
		}
	default:
		screen.unsupportedSequenceCount += 1
	}
}

func (screen *terminalScreen) eraseLine(mode int) {
	screen.pendingWrap = false
	switch mode {
	case 0:
		screen.eraseLineFrom(screen.cursor.row, screen.cursor.col)
	case 1:
		screen.eraseLineTo(screen.cursor.row, screen.cursor.col)
	case 2:
		screen.eraseWholeLine(screen.cursor.row)
	default:
		screen.unsupportedSequenceCount += 1
	}
}

func (screen *terminalScreen) eraseLineFrom(row int, col int) {
	for index := col; index < screen.cols; index += 1 {
		screen.lines[row][index] = ' '
	}
}

func (screen *terminalScreen) eraseLineTo(row int, col int) {
	for index := 0; index <= col && index < screen.cols; index += 1 {
		screen.lines[row][index] = ' '
	}
}

func (screen *terminalScreen) eraseWholeLine(row int) {
	screen.eraseLineFrom(row, 0)
}

func (screen *terminalScreen) scrollUp(count int) {
	screen.pendingWrap = false
	count = min(count, screen.rows)
	for index := 0; index < count; index += 1 {
		copy(screen.lines, screen.lines[1:])
		screen.lines[screen.rows-1] = blankTerminalScreenLine(screen.cols)
	}
}

func (screen *terminalScreen) scrollDown(count int) {
	screen.pendingWrap = false
	count = min(count, screen.rows)
	for index := 0; index < count; index += 1 {
		copy(screen.lines[1:], screen.lines[:screen.rows-1])
		screen.lines[0] = blankTerminalScreenLine(screen.cols)
	}
}

func blankTerminalScreenLine(cols int) []rune {
	line := make([]rune, cols)
	for index := range line {
		line[index] = ' '
	}
	return line
}

func (screen *terminalScreen) reset() {
	screen.cursor = terminalCursor{}
	screen.savedCursor = terminalCursor{}
	screen.pendingInput = nil
	screen.pendingWrap = false
	screen.state = terminalScreenStateGround
	screen.csi = screen.csi[:0]
	screen.lines = makeTerminalScreenLines(screen.cols, screen.rows)
}

func (screen *terminalScreen) Snapshot() TerminalScreenSnapshot {
	lines := make([]string, 0, screen.rows)
	for _, line := range screen.lines {
		text := string(line)
		lines = append(lines, text)
	}
	return TerminalScreenSnapshot{
		Cols:                     screen.cols,
		Rows:                     screen.rows,
		Cursor:                   screen.snapshotCursor(),
		Lines:                    lines,
		ScreenText:               strings.Join(lines, "\n"),
		PendingControlSequence:   screen.state != terminalScreenStateGround,
		PendingInputByteCount:    len(screen.pendingInput),
		UnsupportedSequenceCount: screen.unsupportedSequenceCount,
	}
}

func (screen *terminalScreen) snapshotCursor() TerminalCursorPosition {
	col := screen.cursor.col
	if screen.pendingWrap {
		col = screen.cols - 1
	}
	return TerminalCursorPosition{
		Row:    screen.cursor.row,
		Column: col,
	}
}

func parseTerminalCSIParams(raw string) ([]int, bool) {
	raw = strings.TrimLeft(raw, "?=>")
	if raw == "" {
		return []int{}, true
	}
	if strings.ContainsAny(raw, ":") {
		return nil, false
	}
	parts := strings.Split(raw, ";")
	params := make([]int, 0, len(parts))
	for _, part := range parts {
		if part == "" {
			params = append(params, 0)
			continue
		}
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 {
			return nil, false
		}
		params = append(params, value)
	}
	return params, true
}

func terminalCSIParam(params []int, index int, defaultValue int) int {
	if index >= len(params) {
		return defaultValue
	}
	return params[index]
}

func terminalCSIPositiveParam(params []int, index int, defaultValue int) int {
	value := terminalCSIParam(params, index, defaultValue)
	if value <= 0 {
		return defaultValue
	}
	return value
}

func clampTerminalScreenIndex(index int, size int) int {
	if index < 0 {
		return 0
	}
	if index >= size {
		return size - 1
	}
	return index
}
