package terminal

import (
	"strings"
	"testing"
)

func TestTerminalScreenTracksVisibleTextAndCursor(t *testing.T) {
	screen := newTerminalScreen(10, 3)

	screen.Feed([]byte("prompt$ "))

	snapshot := screen.Snapshot()
	if snapshot.Lines[0] != "prompt$   " {
		t.Fatalf("line 0 = %q, want prompt with full-width cells", snapshot.Lines[0])
	}
	if snapshot.Cursor.Row != 0 || snapshot.Cursor.Column != len("prompt$ ") {
		t.Fatalf("cursor = %+v, want row 0 col %d", snapshot.Cursor, len("prompt$ "))
	}
	if snapshot.ScreenText != strings.Join(snapshot.Lines, "\n") {
		t.Fatalf("screenText = %q, want exact joined lines", snapshot.ScreenText)
	}
}

func TestTerminalScreenAppliesCursorEraseAndClearSequences(t *testing.T) {
	screen := newTerminalScreen(12, 3)

	screen.Feed([]byte("building"))
	screen.Feed([]byte("\rready\x1b[K"))
	progress := screen.Snapshot()
	if progress.Lines[0] != "ready       " {
		t.Fatalf("progress line = %q, want overwritten ready line", progress.Lines[0])
	}
	if progress.UnsupportedSequenceCount != 0 {
		t.Fatalf("unsupported sequences = %d, want 0", progress.UnsupportedSequenceCount)
	}

	screen.Feed([]byte("\x1b[2J\x1b[Hprompt$ "))
	cleared := screen.Snapshot()
	if cleared.Lines[0] != "prompt$     " || cleared.Lines[1] != "            " || cleared.Cursor.Column != len("prompt$ ") {
		t.Fatalf("cleared snapshot = %+v, want prompt at home on blank screen", cleared)
	}
}

func TestTerminalScreenScrollsAndResizes(t *testing.T) {
	screen := newTerminalScreen(6, 2)

	screen.Feed([]byte("one\r\ntwo\r\nthree"))
	scrolled := screen.Snapshot()
	if scrolled.Lines[0] != "two   " || scrolled.Lines[1] != "three " {
		t.Fatalf("scrolled lines = %+v, want visible tail", scrolled.Lines)
	}

	screen.Resize(4, 3)
	resized := screen.Snapshot()
	if resized.Cols != 4 || resized.Rows != 3 {
		t.Fatalf("resized dimensions = %dx%d, want 4x3", resized.Cols, resized.Rows)
	}
	if resized.Lines[0] != "two " || resized.Lines[1] != "thre" || resized.Lines[2] != "    " {
		t.Fatalf("resized lines = %+v, want top-left preserved", resized.Lines)
	}
	if resized.Cursor.Row != 1 || resized.Cursor.Column != 3 {
		t.Fatalf("resized cursor = %+v, want clamped to row 1 col 3", resized.Cursor)
	}
}

func TestTerminalScreenCarriesSplitUTF8Input(t *testing.T) {
	screen := newTerminalScreen(4, 1)
	lambda := []byte("λ")

	screen.Feed(lambda[:1])
	pending := screen.Snapshot()
	if pending.PendingInputByteCount != 1 || pending.Lines[0] != "    " {
		t.Fatalf("pending snapshot = %+v, want one pending byte and no visible text", pending)
	}

	screen.Feed(lambda[1:])
	snapshot := screen.Snapshot()
	if snapshot.PendingInputByteCount != 0 || snapshot.Lines[0] != "λ   " {
		t.Fatalf("completed snapshot = %+v, want lambda cell", snapshot)
	}
}

func TestTerminalScreenReportsPendingControlSequence(t *testing.T) {
	screen := newTerminalScreen(4, 1)

	screen.Feed([]byte("\x1b["))
	pending := screen.Snapshot()
	if !pending.PendingControlSequence {
		t.Fatalf("pending control sequence = false, want true")
	}

	screen.Feed([]byte("2J"))
	snapshot := screen.Snapshot()
	if snapshot.PendingControlSequence || snapshot.UnsupportedSequenceCount != 0 {
		t.Fatalf("completed control snapshot = %+v, want no pending or unsupported sequence", snapshot)
	}
}
