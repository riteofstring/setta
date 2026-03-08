package realtime

import (
	"errors"
	"testing"
)

func TestCanonicalDependencyKeyConvertsSectionAndSectionParam(t *testing.T) {
	t.Parallel()

	sectionKey, err := CanonicalDependencyKey([]byte(`{"type":"Section","sectionId":"section-a"}`))
	if err != nil {
		t.Fatalf("canonicalize section dependency key: %v", err)
	}
	if sectionKey != "section-a" {
		t.Fatalf("expected section-a key, got %q", sectionKey)
	}

	paramKey, err := CanonicalDependencyKey([]byte(`{"type":"SectionParam","sectionId":"section-a","codeObjId":"param-a"}`))
	if err != nil {
		t.Fatalf("canonicalize section param dependency key: %v", err)
	}
	if paramKey != "section-a.param-a" {
		t.Fatalf("expected section-a.param-a key, got %q", paramKey)
	}
}

func TestCanonicalDependencyKeyRejectsMissingRequiredFields(t *testing.T) {
	t.Parallel()

	_, err := CanonicalDependencyKey([]byte(`{"type":"SectionParam","sectionId":"section-a"}`))
	if !errors.Is(err, ErrDependencyKeyCodeObjIDRequired) {
		t.Fatalf("expected missing code object id error, got %v", err)
	}

	_, err = CanonicalDependencyKey([]byte(`{"type":"Unknown","sectionId":"section-a"}`))
	if !errors.Is(err, ErrUnsupportedDependencyKeyType) {
		t.Fatalf("expected unsupported dependency key type error, got %v", err)
	}
}

func TestDecodeCanonicalDependencyKeyConvertsSectionAndSectionParam(t *testing.T) {
	t.Parallel()

	// Listener coverage reads need to reverse the registry's canonical string
	// keys back into the structured dependency shape the frontend expects.
	sectionKey, err := DecodeCanonicalDependencyKey("section-a")
	if err != nil {
		t.Fatalf("decode section dependency key: %v", err)
	}
	if sectionKey.Type != DependencyKeyTypeSection || sectionKey.SectionID != "section-a" || sectionKey.CodeObjID != "" {
		t.Fatalf("unexpected section dependency key %#v", sectionKey)
	}

	paramKey, err := DecodeCanonicalDependencyKey("section-a.param-a")
	if err != nil {
		t.Fatalf("decode section param dependency key: %v", err)
	}
	if paramKey.Type != DependencyKeyTypeSectionParam || paramKey.SectionID != "section-a" || paramKey.CodeObjID != "param-a" {
		t.Fatalf("unexpected section param dependency key %#v", paramKey)
	}
}

func TestDecodeCanonicalDependencyKeyRejectsMissingRequiredFields(t *testing.T) {
	t.Parallel()

	// Invalid canonical keys should still fail fast when a caller asks for the
	// structured dependency form.
	_, err := DecodeCanonicalDependencyKey("")
	if !errors.Is(err, ErrDependencyKeySectionIDRequired) {
		t.Fatalf("expected missing section id error, got %v", err)
	}

	_, err = DecodeCanonicalDependencyKey("section-a.")
	if !errors.Is(err, ErrDependencyKeyCodeObjIDRequired) {
		t.Fatalf("expected missing code object id error, got %v", err)
	}
}

func TestDependencyValueIsBinary(t *testing.T) {
	t.Parallel()

	isBinary, err := DependencyValueIsBinary([]byte(`{"type":"Binary","payload":{"contentId":"bin-1"}}`))
	if err != nil {
		t.Fatalf("detect binary dependency value: %v", err)
	}
	if !isBinary {
		t.Fatal("expected Binary dependency value to be detected")
	}

	isBinary, err = DependencyValueIsBinary([]byte(`{"type":"Literal","payload":"value-1"}`))
	if err != nil {
		t.Fatalf("detect literal dependency value: %v", err)
	}
	if isBinary {
		t.Fatal("expected literal dependency value not to be binary")
	}
}
