package evalharness

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
)

const (
	containerSecurityReleaseSBOMMaximumBytes    = 2 * 1024 * 1024
	containerSecuritySigstoreBundleMaximumBytes = 128 * 1024
)

type containerSecurityOCIIndex struct {
	SchemaVersion int                              `json:"schemaVersion"`
	MediaType     string                           `json:"mediaType"`
	Manifests     []containerSecurityOCIDescriptor `json:"manifests"`
}

type containerSecurityOCIManifest struct {
	SchemaVersion int                              `json:"schemaVersion"`
	MediaType     string                           `json:"mediaType"`
	Layers        []containerSecurityOCIDescriptor `json:"layers"`
}

type containerSecurityOCIDescriptor struct {
	MediaType string `json:"mediaType"`
	Digest    string `json:"digest"`
	Platform  *struct {
		Architecture string `json:"architecture"`
		OS           string `json:"os"`
	} `json:"platform,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
}

func verifyContainerSecurityScannerProvenance(
	ctx context.Context,
	client phase0DockerClient,
	pin containerSecurityPolicyPin,
) error {
	if err := verifyContainerSecurityOCIProvenance(ctx, client, pin.Scanner); err != nil {
		return err
	}
	if err := verifyContainerSecurityReleaseEvidence(ctx, pin.Scanner); err != nil {
		return err
	}
	return nil
}

func verifyContainerSecurityOCIProvenance(
	ctx context.Context,
	client phase0DockerClient,
	scanner containerSecurityScanner,
) error {
	result, err := client.run(
		ctx,
		"buildx", "imagetools", "inspect", "--raw", scanner.Image,
	)
	if err != nil {
		return fmt.Errorf("inspect pinned Trivy OCI index: %w", err)
	}
	var index containerSecurityOCIIndex
	if err := json.Unmarshal([]byte(result.stdout), &index); err != nil {
		return fmt.Errorf("decode pinned Trivy OCI index: %w", err)
	}
	if index.SchemaVersion != 2 || index.MediaType != "application/vnd.oci.image.index.v1+json" {
		return errors.New("pinned Trivy registry object is not one OCI image index")
	}
	platformFound := false
	attestationFound := false
	for _, manifest := range index.Manifests {
		if manifest.Platform != nil && manifest.Platform.OS == "linux" &&
			manifest.Platform.Architecture == "arm64" {
			if platformFound || manifest.Digest != scanner.PlatformManifestDigest {
				return errors.New("pinned Trivy OCI index has an unexpected ARM64 manifest")
			}
			platformFound = true
		}
		if manifest.Annotations["vnd.docker.reference.type"] == "attestation-manifest" &&
			manifest.Annotations["vnd.docker.reference.digest"] == scanner.PlatformManifestDigest {
			if attestationFound || manifest.Digest != scanner.AttestationManifestDigest {
				return errors.New("pinned Trivy OCI index has an unexpected ARM64 attestation")
			}
			attestationFound = true
		}
	}
	if !platformFound || !attestationFound {
		return errors.New("pinned Trivy OCI index omitted its ARM64 image or attestation")
	}
	repository := strings.Split(scanner.Image, "@")[0]
	result, err = client.run(
		ctx,
		"buildx", "imagetools", "inspect", "--raw",
		repository+"@"+scanner.AttestationManifestDigest,
	)
	if err != nil {
		return fmt.Errorf("inspect pinned Trivy ARM64 attestation: %w", err)
	}
	var attestation containerSecurityOCIManifest
	if err := json.Unmarshal([]byte(result.stdout), &attestation); err != nil {
		return fmt.Errorf("decode pinned Trivy ARM64 attestation: %w", err)
	}
	if attestation.SchemaVersion != 2 ||
		attestation.MediaType != "application/vnd.oci.image.manifest.v1+json" {
		return errors.New("pinned Trivy attestation is not one OCI manifest")
	}
	wantLayers := map[string]string{
		scanner.SBOMAttestationDigest:       "https://spdx.dev/Document",
		scanner.ProvenanceAttestationDigest: "https://slsa.dev/provenance/v1",
	}
	if len(attestation.Layers) != len(wantLayers) {
		return fmt.Errorf("pinned Trivy attestation has %d layers", len(attestation.Layers))
	}
	for _, layer := range attestation.Layers {
		wantPredicate, exists := wantLayers[layer.Digest]
		if !exists || layer.MediaType != "application/vnd.in-toto+json" ||
			layer.Annotations["in-toto.io/predicate-type"] != wantPredicate {
			return errors.New("pinned Trivy attestation contains an unexpected statement")
		}
	}
	return nil
}

func verifyContainerSecurityReleaseEvidence(
	ctx context.Context,
	scanner containerSecurityScanner,
) error {
	sbom, err := downloadContainerSecurityReleaseAsset(
		ctx,
		scanner.Release.SBOMURL,
		containerSecurityReleaseSBOMMaximumBytes,
	)
	if err != nil {
		return fmt.Errorf("download pinned Trivy release SBOM: %w", err)
	}
	if containerSecurityBytesSHA256(sbom) != scanner.Release.SBOMSHA256 {
		return errors.New("pinned Trivy release SBOM digest does not match")
	}
	if err := validateContainerSecuritySBOM(sbom); err != nil {
		return fmt.Errorf("validate pinned Trivy release SBOM: %w", err)
	}
	bundle, err := downloadContainerSecurityReleaseAsset(
		ctx,
		scanner.Release.ChecksumsSigstoreBundleURL,
		containerSecuritySigstoreBundleMaximumBytes,
	)
	if err != nil {
		return fmt.Errorf("download pinned Trivy release Sigstore bundle: %w", err)
	}
	if containerSecurityBytesSHA256(bundle) != scanner.Release.ChecksumsSigstoreBundleSHA256 {
		return errors.New("pinned Trivy release Sigstore bundle digest does not match")
	}
	return validateContainerSecuritySigstoreBundle(bundle)
}

func downloadContainerSecurityReleaseAsset(
	ctx context.Context,
	address string,
	maximumBytes int64,
) ([]byte, error) {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DisableCompression = true
	client := &http.Client{
		Transport: transport,
		Timeout:   30 * time.Second,
		CheckRedirect: func(request *http.Request, previous []*http.Request) error {
			if len(previous) > 3 {
				return errors.New("too many release evidence redirects")
			}
			return validateContainerSecurityReleaseURL(request.URL)
		},
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	if err := validateContainerSecurityReleaseURL(request.URL); err != nil {
		return nil, err
	}
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "setta-container-security/1")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("release evidence returned HTTP %d", response.StatusCode)
	}
	payload, err := io.ReadAll(io.LimitReader(response.Body, maximumBytes+1))
	if err != nil {
		return nil, err
	}
	if len(payload) < 1 || int64(len(payload)) > maximumBytes {
		return nil, fmt.Errorf("release evidence size is %d, maximum is %d", len(payload), maximumBytes)
	}
	return payload, nil
}

func validateContainerSecurityReleaseURL(address *url.URL) error {
	if address == nil || address.Scheme != "https" || address.User != nil || address.Port() != "" {
		return errors.New("release evidence URL must use credential-free HTTPS")
	}
	if !slices.Contains(
		[]string{"github.com", "release-assets.githubusercontent.com"},
		strings.ToLower(address.Hostname()),
	) {
		return fmt.Errorf("release evidence host %q is not allowed", address.Hostname())
	}
	return nil
}

func validateContainerSecuritySigstoreBundle(payload []byte) error {
	var bundle struct {
		MediaType        string `json:"mediaType"`
		MessageSignature struct {
			MessageDigest struct {
				Algorithm string `json:"algorithm"`
				Digest    string `json:"digest"`
			} `json:"messageDigest"`
			Signature string `json:"signature"`
		} `json:"messageSignature"`
		VerificationMaterial struct {
			Certificate struct {
				RawBytes string `json:"rawBytes"`
			} `json:"certificate"`
			TlogEntries               []json.RawMessage `json:"tlogEntries"`
			TimestampVerificationData struct {
				RFC3161Timestamps []json.RawMessage `json:"rfc3161Timestamps"`
			} `json:"timestampVerificationData"`
		} `json:"verificationMaterial"`
	}
	if err := json.Unmarshal(payload, &bundle); err != nil {
		return fmt.Errorf("decode Trivy release Sigstore bundle: %w", err)
	}
	if bundle.MediaType != "application/vnd.dev.sigstore.bundle.v0.3+json" ||
		bundle.MessageSignature.MessageDigest.Algorithm != "SHA2_256" ||
		bundle.MessageSignature.MessageDigest.Digest == "" ||
		bundle.MessageSignature.Signature == "" ||
		bundle.VerificationMaterial.Certificate.RawBytes == "" ||
		len(bundle.VerificationMaterial.TlogEntries) != 1 ||
		len(bundle.VerificationMaterial.TimestampVerificationData.RFC3161Timestamps) < 1 {
		return errors.New("Trivy release Sigstore bundle is incomplete")
	}
	return nil
}
