package filebrowser

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"setta/internal/statefs"
)

func shouldIgnoreName(name string, patterns []string) bool {
	for _, pattern := range patterns {
		matched, err := filepath.Match(pattern, name)
		if err == nil && matched {
			return true
		}
	}
	return false
}

func writeCreateOnlyFile(path string, payload []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()
	if _, err := file.Write(payload); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return nil
}

func resolveCopyDestinationPath(source string, destinationFolder string) (string, error) {
	direct := filepath.Join(destinationFolder, filepath.Base(source))
	if _, err := os.Stat(direct); errors.Is(err, os.ErrNotExist) {
		return direct, nil
	}
	for attempt := 1; attempt < 10_000; attempt++ {
		candidate := filepath.Join(destinationFolder, buildCopyCandidateName(filepath.Base(source), attempt))
		if _, err := os.Stat(candidate); errors.Is(err, os.ErrNotExist) {
			return candidate, nil
		}
	}
	return "", &Error{
		Kind:    ErrorConflict,
		Message: fmt.Sprintf("Unable to resolve copy destination for %s.", filepath.Base(source)),
	}
}

func buildCopyCandidateName(sourceName string, attempt int) string {
	hasOnlyLeadingDot := strings.HasPrefix(sourceName, ".") && !strings.Contains(sourceName[1:], ".")
	baseName := sourceName
	suffix := ""
	if !hasOnlyLeadingDot {
		allSuffixes := suffixes(sourceName)
		suffix = strings.Join(allSuffixes, "")
		if trimmed := strings.TrimSuffix(sourceName, suffix); trimmed != "" {
			baseName = trimmed
		}
	}
	if attempt == 1 {
		return fmt.Sprintf("%s copy%s", baseName, suffix)
	}
	return fmt.Sprintf("%s copy %d%s", baseName, attempt, suffix)
}

func suffixes(name string) []string {
	base := filepath.Base(name)
	var parts []string
	for {
		ext := filepath.Ext(base)
		if ext == "" {
			break
		}
		parts = append([]string{ext}, parts...)
		base = strings.TrimSuffix(base, ext)
		if base == "" {
			break
		}
	}
	return parts
}

func copyPath(source string, destination string) error {
	info, err := os.Stat(source)
	if err != nil {
		return err
	}
	if info.IsDir() {
		return copyDirectory(source, destination, info)
	}
	return copyFile(source, destination, info)
}

func copyDirectory(source string, destination string, info os.FileInfo) error {
	if err := os.MkdirAll(destination, info.Mode().Perm()); err != nil {
		return err
	}
	entries, err := os.ReadDir(source)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		sourceChild := filepath.Join(source, entry.Name())
		destinationChild := filepath.Join(destination, entry.Name())
		if err := copyPath(sourceChild, destinationChild); err != nil {
			return err
		}
	}
	return os.Chtimes(destination, info.ModTime(), info.ModTime())
}

func copyFile(source string, destination string, info os.FileInfo) error {
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()

	output, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, info.Mode().Perm())
	if err != nil {
		return err
	}
	defer output.Close()
	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	if err := output.Sync(); err != nil {
		return err
	}
	if err := output.Close(); err != nil {
		return err
	}
	return os.Chtimes(destination, info.ModTime(), info.ModTime())
}

func movePath(source string, destination string) error {
	if err := os.Rename(source, destination); err == nil {
		return nil
	} else {
		var linkErr *os.LinkError
		if !errors.As(err, &linkErr) || !errors.Is(linkErr.Err, syscall.EXDEV) {
			return err
		}
	}
	if err := copyPath(source, destination); err != nil {
		return err
	}
	return os.RemoveAll(source)
}

func resolveForComparison(path string) (string, error) {
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return statefs.NormalizePath(resolved, "")
	}
	return statefs.NormalizePath(path, "")
}

func isWithinRoot(root string, candidate string) bool {
	resolvedRoot, err := statefs.NormalizePath(root, "")
	if err != nil {
		return false
	}
	resolvedCandidate, err := statefs.NormalizePath(candidate, "")
	if err != nil {
		return false
	}
	relative, err := filepath.Rel(resolvedRoot, resolvedCandidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func samePath(left string, right string) bool {
	resolvedLeft, err := statefs.NormalizePath(left, "")
	if err != nil {
		return false
	}
	resolvedRight, err := statefs.NormalizePath(right, "")
	if err != nil {
		return false
	}
	return resolvedLeft == resolvedRight
}

func guessMimeType(path string) string {
	ext := strings.ToLower(filepath.Ext(path))
	if mimeType := mime.TypeByExtension(ext); strings.TrimSpace(mimeType) != "" {
		mediaType, _, err := mime.ParseMediaType(mimeType)
		if err == nil && strings.TrimSpace(mediaType) != "" {
			return mediaType
		}
		return mimeType
	}
	return "application/octet-stream"
}

func mintDownloadToken(payload downloadTokenPayload, secret []byte) (string, error) {
	content, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(content)
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(body)); err != nil {
		return "", err
	}
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + signature, nil
}

func validateDownloadToken(token string, secret []byte, now time.Time) (downloadTokenPayload, error) {
	var payload downloadTokenPayload
	body, signature, found := strings.Cut(token, ".")
	if !found || strings.TrimSpace(body) == "" || strings.TrimSpace(signature) == "" {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	mac := hmac.New(sha256.New, secret)
	if _, err := mac.Write([]byte(body)); err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(signature)) {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	content, err := base64.RawURLEncoding.DecodeString(body)
	if err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	if err := json.Unmarshal(content, &payload); err != nil {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	if strings.TrimSpace(payload.Path) == "" || payload.Exp <= now.Unix() {
		return payload, &Error{
			Kind:    ErrorInvalidDownloadToken,
			Message: "Invalid or expired file browser token.",
		}
	}
	return payload, nil
}
