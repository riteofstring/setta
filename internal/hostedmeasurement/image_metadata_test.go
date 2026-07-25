package hostedmeasurement

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolvePublishedImageReferenceAcceptsCurrentPrivateBuildxMetadata(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	digest := "sha256:" + strings.Repeat("a", 64)
	path := writePrivateFile(t, directory, "image-metadata.json", []byte(`{
  "buildx.build.provenance": {},
  "containerimage.digest": "`+digest+`"
}`))
	reference, err := ResolvePublishedImageReference(path, authorization)
	if err != nil {
		t.Fatal(err)
	}
	want := "registry.fly.io/" + authorization.Manifest.FlyAppName + "@" + digest
	if reference != want {
		t.Fatalf("reference = %q, want %q", reference, want)
	}
}

func TestResolvePublishedImageReferenceRejectsInvalidDigestExposureAndWrongDirectory(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	path := writePrivateFile(t, directory, "image-metadata.json", []byte(`{
  "containerimage.digest": "sha256:invalid"
}`))
	if _, err := ResolvePublishedImageReference(path, authorization); err == nil {
		t.Fatal("ResolvePublishedImageReference accepted an invalid digest")
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := ResolvePublishedImageReference(path, authorization); err == nil {
		t.Fatal("ResolvePublishedImageReference accepted exposed metadata")
	}
	outside := filepath.Join(t.TempDir(), "metadata.json")
	if _, err := ResolvePublishedImageReference(outside, authorization); err == nil {
		t.Fatal("ResolvePublishedImageReference accepted metadata outside the run directory")
	}
}
