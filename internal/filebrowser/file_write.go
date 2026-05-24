package filebrowser

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"setta/internal/statefs"
)

func (s *Service) prepareWriteFileContent(request WriteFileContentRequest) (string, []byte, error) {
	resolved, err := s.resolveFilePathForEdit(request.Path, true)
	if err != nil {
		return "", nil, err
	}
	payload, err := s.binaryStore.ReadBytes(request.ContentID)
	if err != nil {
		return "", nil, &Error{
			Kind:    ErrorBinaryPayloadInvalid,
			Message: "Invalid binary content payload.",
		}
	}
	if int64(len(payload)) > DefaultMaxFileContentBytes {
		return "", nil, &Error{
			Kind:    ErrorTooLarge,
			Message: fmt.Sprintf("Updated file content exceeds maximum supported size (%d bytes).", DefaultMaxFileContentBytes),
		}
	}
	if err := os.MkdirAll(filepath.Dir(resolved), 0o755); err != nil {
		return "", nil, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to write file: %s", request.Path),
		}
	}
	return resolved, payload, nil
}

func (s *Service) writeFileContentBytes(resolved string, payload []byte, request WriteFileContentRequest) error {
	if request.ExpectedMtimeNs == nil {
		return writeNewFileContent(resolved, payload, request.Path)
	}
	return writeExistingFileContent(resolved, payload, request.Path, *request.ExpectedMtimeNs)
}

func writeNewFileContent(resolved string, payload []byte, rawPath string) error {
	if err := writeCreateOnlyFile(resolved, payload); err != nil {
		if errors.Is(err, os.ErrExist) {
			return &Error{
				Kind:    ErrorConflict,
				Message: "File already exists.",
			}
		}
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to write file: %s", rawPath),
		}
	}
	return nil
}

func writeExistingFileContent(resolved string, payload []byte, rawPath string, expectedMtimeNs int64) error {
	existingInfo, err := os.Stat(resolved)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &Error{
				Kind:    ErrorConflict,
				Message: "File changed on disk since it was loaded.",
			}
		}
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to stat file: %s", rawPath),
		}
	}
	if existingInfo.ModTime().UnixNano() != expectedMtimeNs {
		return &Error{
			Kind:    ErrorConflict,
			Message: "File changed on disk since it was loaded.",
		}
	}
	if err := statefs.AtomicWriteFile(resolved, payload, existingInfo.Mode().Perm()); err != nil {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to write file: %s", rawPath),
		}
	}
	return nil
}
