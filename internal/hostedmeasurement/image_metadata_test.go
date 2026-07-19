package hostedmeasurement

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolvePublishedImageReferenceRequiresMatchingPrivateBuildxMetadata(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	digest := "sha256:" + strings.Repeat("a", 64)
	path := writePrivateFile(t, directory, "image-metadata.json", []byte(`{
  "buildx.build.provenance": {},
  "containerimage.digest": "`+digest+`",
  "containerimage.descriptor": {"digest": "`+digest+`", "mediaType": "application/vnd.oci.image.manifest.v1+json"}
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

func TestResolvePublishedImageReferenceAcceptsCurrentBuildxDigestMetadata(t *testing.T) {
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

func TestResolvePublishedImageReferenceRejectsMismatchExposureAndWrongDirectory(t *testing.T) {
	authorization, directory := loadTestAuthorization(t)
	digest := "sha256:" + strings.Repeat("a", 64)
	path := writePrivateFile(t, directory, "image-metadata.json", []byte(`{
  "containerimage.digest": "`+digest+`",
  "containerimage.descriptor": {"digest": "sha256:`+strings.Repeat("b", 64)+`"}
}`))
	if _, err := ResolvePublishedImageReference(path, authorization); err == nil {
		t.Fatal("ResolvePublishedImageReference accepted mismatched digests")
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
