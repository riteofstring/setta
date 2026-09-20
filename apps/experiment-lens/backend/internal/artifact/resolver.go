package artifact

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/setta/experiment-lens/backend/internal/contracts"
	"github.com/setta/experiment-lens/backend/internal/project"
	"github.com/setta/local-backend/artifacthttp"
)

const (
	maximumTextBytes   = 4 << 20
	maximumJSONBytes   = 16 << 20
	maximumSeriesBytes = 32 << 20
)

var (
	ErrArtifactChanged = errors.New("artifact: content identity changed")
	ErrArtifactInvalid = errors.New("artifact: content is invalid")
)

type Resolver struct {
	root string
}

func New(root string) (*Resolver, error) {
	if strings.TrimSpace(root) == "" {
		return nil, errors.New("artifact: project root is required")
	}
	return &Resolver{root: root}, nil
}

func (resolver *Resolver) Resolve(reference contracts.ArtifactReference) contracts.ResolvedArtifact {
	content, err := resolver.resolve(reference)
	if err == nil {
		return contracts.ResolvedArtifact{Reference: reference, Status: "resolved", Content: &content}
	}
	id := reference.ID
	return contracts.ResolvedArtifact{
		Reference: reference,
		Status:    "failed",
		Error: &contracts.StructuredError{
			Code:       errorCode(err),
			Message:    "The admitted artifact is unavailable or changed.",
			ArtifactID: &id,
		},
	}
}

func (resolver *Resolver) Open(reference contracts.ArtifactReference) (*os.File, error) {
	file, err := resolver.openVerified(reference)
	if err != nil {
		return nil, err
	}
	return file, nil
}

func (resolver *Resolver) Verify(reference contracts.ArtifactReference) error {
	file, err := resolver.openVerified(reference)
	if file != nil {
		_ = file.Close()
	}
	return err
}

func (resolver *Resolver) resolve(reference contracts.ArtifactReference) (contracts.ResolvedArtifactContent, error) {
	file, err := resolver.openVerified(reference)
	if err != nil {
		return contracts.ResolvedArtifactContent{}, err
	}
	defer file.Close()
	switch {
	case reference.MediaType == "application/vnd.setta.series+json":
		return resolveSeries(file)
	case reference.MediaType == "application/json":
		return resolveJSON(file)
	case strings.HasPrefix(reference.MediaType, "text/"):
		return resolveText(file)
	default:
		return resolvedArtifact(reference), nil
	}
}

func resolveSeries(file *os.File) (contracts.ResolvedArtifactContent, error) {
	data, err := readBounded(file, maximumSeriesBytes)
	if err != nil {
		return contracts.ResolvedArtifactContent{}, err
	}
	var series contracts.SeriesDocument
	if err := contracts.DecodeStrict(data, &series); err != nil {
		return contracts.ResolvedArtifactContent{}, ErrArtifactInvalid
	}
	if err := series.Validate(); err != nil {
		return contracts.ResolvedArtifactContent{}, ErrArtifactInvalid
	}
	return contracts.ResolvedArtifactContent{Kind: "series", Series: &series}, nil
}

func resolveJSON(file *os.File) (contracts.ResolvedArtifactContent, error) {
	data, err := readBounded(file, maximumJSONBytes)
	if err != nil || !json.Valid(data) {
		return contracts.ResolvedArtifactContent{}, ErrArtifactInvalid
	}
	return contracts.ResolvedArtifactContent{Kind: "json", JSON: append(json.RawMessage(nil), data...)}, nil
}

func resolveText(file *os.File) (contracts.ResolvedArtifactContent, error) {
	data, err := readBounded(file, maximumTextBytes)
	if err != nil || !utf8.Valid(data) {
		return contracts.ResolvedArtifactContent{}, ErrArtifactInvalid
	}
	text := string(data)
	truncated := false
	return contracts.ResolvedArtifactContent{Kind: "text", Text: &text, Truncated: &truncated}, nil
}

func resolvedArtifact(reference contracts.ArtifactReference) contracts.ResolvedArtifactContent {
	route := "/api/v1/artifacts/" + reference.ID
	inline := artifacthttp.InlineMediaType(reference.MediaType)
	mediaType := reference.MediaType
	byteLength := reference.ByteLength
	digest := reference.SHA256
	return contracts.ResolvedArtifactContent{
		Kind:       "artifact",
		Route:      &route,
		Inline:     &inline,
		MediaType:  &mediaType,
		ByteLength: &byteLength,
		SHA256:     &digest,
	}
}

func (resolver *Resolver) openVerified(reference contracts.ArtifactReference) (*os.File, error) {
	file, info, err := project.OpenConfinedRegular(resolver.root, reference.Path)
	if err != nil {
		return nil, err
	}
	if info.Size() != reference.ByteLength {
		file.Close()
		return nil, ErrArtifactChanged
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		file.Close()
		return nil, fmt.Errorf("artifact: hash: %w", err)
	}
	if hex.EncodeToString(hash.Sum(nil)) != reference.SHA256 {
		file.Close()
		return nil, ErrArtifactChanged
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		file.Close()
		return nil, fmt.Errorf("artifact: rewind: %w", err)
	}
	return file, nil
}

func readBounded(file *os.File, maximum int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, ErrArtifactInvalid
	}
	return data, nil
}

func errorCode(err error) string {
	if errors.Is(err, ErrArtifactChanged) {
		return "artifact_changed"
	}
	if errors.Is(err, ErrArtifactInvalid) {
		return "artifact_invalid"
	}
	return "artifact_unavailable"
}
