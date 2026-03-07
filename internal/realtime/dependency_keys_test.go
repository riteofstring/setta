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
