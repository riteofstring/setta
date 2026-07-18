package runtimeinstall

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestVerifySignedReleaseFileAcceptsLegacyMinisignSignatureAndChecksum(t *testing.T) {
	request := makeSignedChecksumManifest(t, validTestChecksumManifest())

	if err := VerifySignedReleaseFile(request, testReleasePath(request)); err != nil {
		t.Fatalf("VerifySignedReleaseFile: %v", err)
	}
}

func TestVerifySignedChecksumManifestRejectsTampering(t *testing.T) {
	request := makeSignedChecksumManifest(t, validTestChecksumManifest())
	if err := os.WriteFile(request.ChecksumsPath, []byte(validTestChecksumManifest()+"\n"), 0o644); err != nil {
		t.Fatalf("tamper SHA256SUMS: %v", err)
	}

	err := VerifySignedChecksumManifest(request)
	if !errors.Is(err, ErrSignatureRejected) {
		t.Fatalf("VerifySignedChecksumManifest error = %v, want ErrSignatureRejected", err)
	}
}

func TestVerifySignedChecksumManifestRejectsSignedMalformedManifest(t *testing.T) {
	request := makeSignedChecksumManifest(t, "not-a-checksum  setta_test_linux_amd64.tar.gz\n")

	err := VerifySignedChecksumManifest(request)
	if !errors.Is(err, ErrInvalidRelease) {
		t.Fatalf("VerifySignedChecksumManifest error = %v, want ErrInvalidRelease", err)
	}
}

func TestVerifySignedReleaseFileRejectsChecksumMismatch(t *testing.T) {
	request := makeSignedChecksumManifest(t, validTestChecksumManifest())
	if err := os.WriteFile(testReleasePath(request), []byte("tampered archive"), 0o644); err != nil {
		t.Fatalf("tamper release: %v", err)
	}

	err := VerifySignedReleaseFile(request, testReleasePath(request))
	if !errors.Is(err, ErrInvalidRelease) {
		t.Fatalf("VerifySignedReleaseFile error = %v, want ErrInvalidRelease", err)
	}
}

func TestVerifySignedChecksumManifestRejectsPrehashedAlgorithm(t *testing.T) {
	request := makeSignedChecksumManifest(t, validTestChecksumManifest())
	contents, err := os.ReadFile(request.SignaturePath)
	if err != nil {
		t.Fatalf("read signature: %v", err)
	}
	lines := minisignSignatureLinesForTest(t, contents)
	record, err := base64.StdEncoding.DecodeString(lines[1])
	if err != nil {
		t.Fatalf("decode signature: %v", err)
	}
	record[1] = 'D'
	lines[1] = base64.StdEncoding.EncodeToString(record)
	if err := os.WriteFile(request.SignaturePath, []byte(joinMinisignLinesForTest(lines)), 0o644); err != nil {
		t.Fatalf("write prehashed signature: %v", err)
	}

	err = VerifySignedChecksumManifest(request)
	if !errors.Is(err, ErrSignatureRejected) {
		t.Fatalf("VerifySignedChecksumManifest error = %v, want ErrSignatureRejected", err)
	}
}

func makeSignedChecksumManifest(t *testing.T, manifest string) SignatureVerificationRequest {
	t.Helper()
	tempDir := t.TempDir()
	checksumsPath := filepath.Join(tempDir, "SHA256SUMS")
	if err := os.WriteFile(checksumsPath, []byte(manifest), 0o644); err != nil {
		t.Fatalf("write SHA256SUMS: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "setta_test_linux_amd64.tar.gz"), testReleasePayload(), 0o644); err != nil {
		t.Fatalf("write release: %v", err)
	}

	seed := sha256.Sum256([]byte("setta runtime install minisign test key"))
	privateKey := ed25519.NewKeyFromSeed(seed[:])
	publicKey := privateKey.Public().(ed25519.PublicKey)
	keyID := []byte{0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe}
	publicKeyRecord := append([]byte{'E', 'd'}, keyID...)
	publicKeyRecord = append(publicKeyRecord, publicKey...)

	messageSignature := ed25519.Sign(privateKey, []byte(manifest))
	trustedComment := "timestamp:1784160000\tfile:SHA256SUMS"
	globalMessage := append(append([]byte{}, messageSignature...), trustedComment...)
	globalSignature := ed25519.Sign(privateKey, globalMessage)
	signatureRecord := append([]byte{'E', 'd'}, keyID...)
	signatureRecord = append(signatureRecord, messageSignature...)
	signature := "untrusted comment: test signature\n" +
		base64.StdEncoding.EncodeToString(signatureRecord) + "\n" +
		"trusted comment: " + trustedComment + "\n" +
		base64.StdEncoding.EncodeToString(globalSignature) + "\n"
	signaturePath := filepath.Join(tempDir, "SHA256SUMS.minisig")
	if err := os.WriteFile(signaturePath, []byte(signature), 0o644); err != nil {
		t.Fatalf("write signature: %v", err)
	}

	return SignatureVerificationRequest{
		ChecksumsPath: checksumsPath,
		SignaturePath: signaturePath,
		PublicKey:     base64.StdEncoding.EncodeToString(publicKeyRecord),
	}
}

func validTestChecksumManifest() string {
	sum := sha256.Sum256(testReleasePayload())
	return fmt.Sprintf("%x  setta_test_linux_amd64.tar.gz\n", sum)
}

func testReleasePayload() []byte {
	return []byte("setta runtime install test archive\n")
}

func testReleasePath(request SignatureVerificationRequest) string {
	return filepath.Join(filepath.Dir(request.ChecksumsPath), "setta_test_linux_amd64.tar.gz")
}

func minisignSignatureLinesForTest(t *testing.T, contents []byte) []string {
	t.Helper()
	lines, err := minisignSignatureLines(contents)
	if err != nil {
		t.Fatalf("parse test signature: %v", err)
	}
	return lines
}

func joinMinisignLinesForTest(lines []string) string {
	return lines[0] + "\n" + lines[1] + "\n" + lines[2] + "\n" + lines[3] + "\n"
}
