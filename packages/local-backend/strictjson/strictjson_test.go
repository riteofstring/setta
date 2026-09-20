package strictjson

import (
	"errors"
	"strings"
	"testing"
)

type testDocument struct {
	Name  string         `json:"name"`
	Items []testDocument `json:"items"`
}

func TestDecodeAcceptsOneClosedDocument(t *testing.T) {
	var document testDocument
	err := Decode([]byte(`{"name":"root","items":[{"name":"child","items":[]}]}`), &document)
	if err != nil || document.Name != "root" || len(document.Items) != 1 {
		t.Fatalf("Decode() = %#v, %v", document, err)
	}
}

func TestDecodeRejectsLexicalAndStructuralAmbiguity(t *testing.T) {
	testCases := []struct {
		name string
		data []byte
		want error
	}{
		{name: "invalid UTF-8", data: []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}, want: ErrInvalidUTF8},
		{name: "duplicate field", data: []byte(`{"name":"first","\u006eame":"second","items":[]}`)},
		{name: "unknown field", data: []byte(`{"name":"root","items":[],"extra":true}`)},
		{name: "trailing token", data: []byte(`{"name":"root","items":[]} trailing`)},
		{name: "multiple values", data: []byte(`{"name":"root","items":[]} {}`), want: ErrMultipleValues},
		{name: "empty", data: nil},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var document testDocument
			err := Decode(testCase.data, &document)
			if err == nil {
				t.Fatal("Decode() error = nil")
			}
			if testCase.want != nil && !errors.Is(err, testCase.want) {
				t.Fatalf("Decode() error = %v, want %v", err, testCase.want)
			}
		})
	}
}

func TestValidatorBoundsDepthAndTokenSize(t *testing.T) {
	deep := strings.Repeat("[", 4) + "null" + strings.Repeat("]", 4)
	if err := validate([]byte(deep), 3, 100); !errors.Is(err, ErrMaximumDepth) {
		t.Fatalf("validate(depth) error = %v", err)
	}
	if err := validate([]byte(`"12345"`), 3, 4); !errors.Is(err, ErrMaximumToken) {
		t.Fatalf("validate(token) error = %v", err)
	}
}

func TestDecodeRejectsDocumentBeyondByteLimit(t *testing.T) {
	data := make([]byte, MaximumBytes+1)
	if err := Decode(data, new(any)); !errors.Is(err, ErrMaximumSize) {
		t.Fatalf("Decode(size) error = %v", err)
	}
}

func TestValidateAllowsArbitraryFieldsWhileEnforcingLexicalRules(t *testing.T) {
	if err := Validate([]byte(`{"untyped":{"number":1}}`)); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if err := Validate([]byte(`{"untyped":1,"untyped":2}`)); err == nil {
		t.Fatal("Validate(duplicate) error = nil")
	}
}
