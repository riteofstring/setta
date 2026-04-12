package docstringmarkdown

import (
	"errors"
	"strings"
	"testing"
)

func TestConvertMatchesGoogleStyleOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n\nArgs:\n    x: value\n    y: other\n\nReturns:\n    result\n")
	if err != nil {
		t.Fatalf("convert google docstring: %v", err)
	}

	want := "Summary line.\n\n#### Args\n\n- `x`: value\n- `y`: other\n\n#### Returns\n\n- result\n"
	if output != want {
		t.Fatalf("unexpected google conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesGoogleMagicNameEscaping(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n\nArgs:\n    __init__: ctor\n")
	if err != nil {
		t.Fatalf("convert google magic-name docstring: %v", err)
	}

	want := "Summary line.\n\n#### Args\n\n- `\\_\\_init\\_\\_`: ctor\n"
	if output != want {
		t.Fatalf("unexpected escaped google conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesGoogleSectionContinuationWithoutInlineDescription(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n\nArgs:\n    options:\n        first line\n        second line\n")
	if err != nil {
		t.Fatalf("convert google continuation docstring: %v", err)
	}

	want := "Summary line.\n\n#### Args\n\n- `options`: first line\n" + strings.Repeat(" ", len("options")+6) + "second line\n"
	if output != want {
		t.Fatalf("unexpected google continuation conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesRSTSectionOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n\nParameters\n----------\nx : int\n    value\n\nReturns\n-------\nint\n    result\n")
	if err != nil {
		t.Fatalf("convert rst section docstring: %v", err)
	}

	want := "Summary line.\n\n#### Parameters\n\n- `x`: int\n    value\n\n#### Returns\n\nint\n    result\n"
	if output != want {
		t.Fatalf("unexpected rst section conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesRSTNotesSectionOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n\nNotes\n-----\nRemember this.\n")
	if err != nil {
		t.Fatalf("convert rst notes docstring: %v", err)
	}

	want := "Summary line.\n\n#### Notes\n\nRemember this.\n"
	if output != want {
		t.Fatalf("unexpected rst notes conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesRSTDirectiveOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("Summary line.\n:param x: value\n:return: result\n")
	if err != nil {
		t.Fatalf("convert rst directive docstring: %v", err)
	}

	want := "Summary line.\n- `x`: value\n- returns: result\n"
	if output != want {
		t.Fatalf("unexpected rst directive conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesRSTTypedDirectiveOutput(t *testing.T) {
	t.Parallel()

	for _, testCase := range []struct {
		name string
		text string
		want string
	}{
		{
			name: "typed param inline",
			text: "Summary line.\n:param int x: value\n:return: result\n",
			want: "Summary line.\n- `x` (`int`): value\n- returns: result\n",
		},
		{
			name: "typed param separate",
			text: "Summary line.\n:param x: value\n:type x: int\n:return: result\n",
			want: "Summary line.\n- `x` (int): value\n- returns: result\n",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			output, err := Convert(testCase.text)
			if err != nil {
				t.Fatalf("convert rst typed directive docstring: %v", err)
			}
			if output != testCase.want {
				t.Fatalf("unexpected rst typed conversion:\nwant: %q\ngot:  %q", testCase.want, output)
			}
		})
	}
}

func TestConvertMatchesCPythonSignatureOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("name(param) -> str\n    desc")
	if err != nil {
		t.Fatalf("convert cpython signature: %v", err)
	}

	want := "```\nname(param) -> str\n    desc\n```\n"
	if output != want {
		t.Fatalf("unexpected cpython conversion:\nwant: %q\ngot:  %q", want, output)
	}
}

func TestConvertMatchesPlainTextOutput(t *testing.T) {
	t.Parallel()

	output, err := Convert("just text")
	if err != nil {
		t.Fatalf("convert plain text: %v", err)
	}
	if output != "just text" {
		t.Fatalf("unexpected plain-text conversion %q", output)
	}
}

func TestConvertRejectsUnknownFormats(t *testing.T) {
	t.Parallel()

	for _, text := range []string{"__init__", "[x](y)", ":bad", "a_b", ">>> print(1)\n1"} {
		text := text
		t.Run(text, func(t *testing.T) {
			t.Parallel()

			_, err := Convert(text)
			if !errors.Is(err, ErrUnknownFormat) {
				t.Fatalf("expected unknown-format error for %q, got %v", text, err)
			}
		})
	}
}
