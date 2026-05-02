package filebrowser

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

func (s *Service) Transfer(_ context.Context, request TransferRequest) (TransferResponse, error) {
	plan, err := s.prepareTransfer(request)
	if err != nil {
		return TransferResponse{}, err
	}
	if plan.operation == TransferOperationCopy {
		return s.copyTransfer(plan)
	}
	return s.moveTransfer(plan)
}

func validateTransferOperation(operation TransferOperation) error {
	if operation == TransferOperationCopy || operation == TransferOperationMove {
		return nil
	}
	return &Error{
		Kind:    ErrorInvalidRequest,
		Message: "Invalid transfer operation.",
	}
}

func (s *Service) prepareTransfer(request TransferRequest) (transferPlan, error) {
	if err := validateTransferOperation(request.Operation); err != nil {
		return transferPlan{}, err
	}
	source, err := s.resolveExistingWorkspaceEntry(request.SourcePath)
	if err != nil {
		return transferPlan{}, err
	}
	destinationFolder, err := s.resolveTransferDestinationFolder(request.DestinationFolderPath)
	if err != nil {
		return transferPlan{}, err
	}
	sourceCompare, err := resolveForComparison(source)
	if err != nil {
		return transferPlan{}, err
	}
	if err := s.validateTransferBounds(source, sourceCompare, destinationFolder); err != nil {
		return transferPlan{}, err
	}
	return transferPlan{
		requestSourcePath: request.SourcePath,
		source:            source,
		sourceCompare:     sourceCompare,
		destinationFolder: destinationFolder,
		operation:         request.Operation,
	}, nil
}

func (s *Service) resolveTransferDestinationFolder(destinationFolderPath string) (string, error) {
	destinationFolder, err := s.resolveFolderPath(destinationFolderPath, "", false)
	if err != nil {
		return "", err
	}
	destinationInfo, err := os.Stat(destinationFolder)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", &Error{
				Kind:    ErrorPathNotFound,
				Message: fmt.Sprintf("Destination folder does not exist: %s", destinationFolderPath),
			}
		}
		return "", &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Destination is not a folder: %s", destinationFolderPath),
		}
	}
	if !destinationInfo.IsDir() {
		return "", &Error{
			Kind:    ErrorPathNotDirectory,
			Message: fmt.Sprintf("Destination is not a folder: %s", destinationFolderPath),
		}
	}
	return destinationFolder, nil
}

func (s *Service) validateTransferBounds(source string, sourceCompare string, destinationFolder string) error {
	workspaceCompare, err := resolveForComparison(s.workspaceRoot)
	if err != nil {
		return err
	}
	if samePath(sourceCompare, workspaceCompare) {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Cannot move or copy the workspace root.",
		}
	}
	destinationFolderCompare, err := resolveForComparison(destinationFolder)
	if err != nil {
		return err
	}
	sourceInfo, err := os.Stat(source)
	if err != nil || !sourceInfo.IsDir() {
		return err
	}
	if isWithinRoot(sourceCompare, destinationFolderCompare) {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: "Cannot move or copy a folder into itself.",
		}
	}
	return nil
}

func (s *Service) copyTransfer(plan transferPlan) (TransferResponse, error) {
	destination, err := resolveCopyDestinationPath(plan.source, plan.destinationFolder)
	if err != nil {
		return TransferResponse{}, err
	}
	if err := copyPath(plan.source, destination); err != nil {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to copy path: %s", plan.requestSourcePath),
		}
	}
	return s.transferResponse(plan.source, destination, plan.operation), nil
}

func (s *Service) moveTransfer(plan transferPlan) (TransferResponse, error) {
	destination := filepath.Join(plan.destinationFolder, filepath.Base(plan.source))
	destinationCompare, err := resolveForComparison(destination)
	if err != nil {
		return TransferResponse{}, err
	}
	if samePath(plan.sourceCompare, destinationCompare) {
		return s.transferResponse(plan.source, destination, plan.operation), nil
	}
	if err := ensureTransferMoveDestination(plan.requestSourcePath, destination); err != nil {
		return TransferResponse{}, err
	}
	if err := movePath(plan.source, destination); err != nil {
		return TransferResponse{}, &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to move path: %s", plan.requestSourcePath),
		}
	}
	return s.transferResponse(plan.source, destination, plan.operation), nil
}

func ensureTransferMoveDestination(source string, destination string) error {
	if _, err := os.Stat(destination); err == nil {
		return &Error{
			Kind:    ErrorConflict,
			Message: fmt.Sprintf("Destination already exists: %s", destination),
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return &Error{
			Kind:    ErrorInvalidRequest,
			Message: fmt.Sprintf("Failed to move path: %s", source),
		}
	}
	return nil
}

func (s *Service) transferResponse(source string, destination string, operation TransferOperation) TransferResponse {
	return TransferResponse{
		SourcePath:      s.formatBrowserPath(source),
		DestinationPath: s.formatBrowserPath(destination),
		Operation:       operation,
	}
}
