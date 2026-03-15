package artifacts

import (
	"encoding/json"

	binarypayload "setta/internal/binary"
)

type ArtifactType string

const (
	ArtifactTypeImage                      ArtifactType = "Image"
	ArtifactTypeBrushStroke                ArtifactType = "BrushStroke"
	ArtifactTypeDrawAreaLayerItemTransform ArtifactType = "DrawAreaLayerItemTransform"
	ArtifactTypeChartData                  ArtifactType = "ChartData"
	ArtifactTypeFile                       ArtifactType = "File"
)

type UploadScope string

const (
	UploadScopeChat    UploadScope = "chat"
	UploadScopeGeneric UploadScope = "generic"
)

type SaveConflictStrategy string

const (
	SaveConflictStrategySkip      SaveConflictStrategy = "skip"
	SaveConflictStrategyBackup    SaveConflictStrategy = "backup"
	SaveConflictStrategyOverwrite SaveConflictStrategy = "overwrite"
)

type SaveStatus string

const (
	SaveStatusSaved     SaveStatus = "saved"
	SaveStatusUnchanged SaveStatus = "unchanged"
	SaveStatusSkipped   SaveStatus = "skipped"
	SaveStatusConflict  SaveStatus = "conflict"
)

type ImportFilesRequest struct {
	Paths       []string    `json:"paths"`
	UploadScope UploadScope `json:"uploadScope"`
}

type ImportFilesResponseItem struct {
	Kind     string `json:"kind"`
	ID       string `json:"id"`
	Name     string `json:"name"`
	MimeType string `json:"mimeType"`
	Size     int    `json:"size"`
}

type LoadCachedPathsRequest struct {
	Paths []string `json:"paths"`
}

type RawArtifact struct {
	Type  ArtifactType     `json:"type"`
	ID    string           `json:"id"`
	Value *json.RawMessage `json:"value"`
}

type UpdateRequest struct {
	Artifacts        []RawArtifact         `json:"artifacts"`
	ConflictStrategy *SaveConflictStrategy `json:"conflictStrategy"`
	UploadScope      UploadScope           `json:"uploadScope"`
}

type DeleteRequest struct {
	Artifacts []DeleteRequestItem `json:"artifacts"`
}

type DeleteRequestItem struct {
	ID   string       `json:"id"`
	Type ArtifactType `json:"type"`
}

type ArtifactSaveResult struct {
	ID         string       `json:"id"`
	Type       ArtifactType `json:"type"`
	Status     SaveStatus   `json:"status"`
	BackupPath *string      `json:"backupPath,omitempty"`
	Message    *string      `json:"message,omitempty"`
}

type ImageArtifact struct {
	Type  ArtifactType             `json:"type"`
	ID    string                   `json:"id"`
	Value binarypayload.ContentRef `json:"value"`
}

type ChartDataArtifact struct {
	Type  ArtifactType     `json:"type"`
	ID    string           `json:"id"`
	Value map[string][]any `json:"value"`
}

type JSONArtifact struct {
	Type  ArtifactType    `json:"type"`
	ID    string          `json:"id"`
	Value json.RawMessage `json:"value"`
}

type FileArtifact struct {
	Type  ArtifactType             `json:"type"`
	ID    string                   `json:"id"`
	Value binarypayload.ContentRef `json:"value"`
}
