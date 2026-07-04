package chat

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"io"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

const (
	attachmentsDirName          = "attachments"
	attachmentMetadataFileName  = "metadata.json"
	attachmentOriginalFileName  = "original"
	attachmentThumbnailFileName = "thumbnail.png"
	attachmentInlineFileName    = "inline.png"
	attachmentPreviewFileName   = "preview.png"

	attachmentThumbnailMaxPixels = 160
	attachmentInlineMaxPixels    = 1280
	attachmentPreviewMaxPixels   = 2560
	maxImageAttachmentBytes      = 20 * 1024 * 1024
	MaxImageAttachmentBytes      = maxImageAttachmentBytes
	maxImageAttachmentDimension  = 12000
)

type imageAttachmentRecord struct {
	SchemaVersion  int                            `json:"schemaVersion"`
	ID             string                         `json:"id"`
	WorkspaceID    string                         `json:"workspaceId"`
	ConversationID string                         `json:"conversationId"`
	FileName       string                         `json:"fileName"`
	MimeType       ImageAttachmentMimeType        `json:"mimeType"`
	ByteSize       int                            `json:"byteSize"`
	Width          int                            `json:"width"`
	Height         int                            `json:"height"`
	SHA256         string                         `json:"sha256"`
	CreatedAt      string                         `json:"createdAt"`
	Variants       []imageAttachmentVariantRecord `json:"variants"`
}

type imageAttachmentVariantRecord struct {
	Kind         ImageAttachmentVariantKind `json:"kind"`
	RelativePath string                     `json:"relativePath"`
	MimeType     ImageAttachmentMimeType    `json:"mimeType"`
	ByteSize     int                        `json:"byteSize"`
	Width        int                        `json:"width"`
	Height       int                        `json:"height"`
}

type decodedImageAttachment struct {
	Image     image.Image
	MimeType  ImageAttachmentMimeType
	Extension string
	Width     int
	Height    int
}

func (service *Service) CreateImageAttachmentFromPath(workspaceID string, conversationID string, sourcePath string) (ImageAttachment, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ImageAttachment{}, err
	}
	if err := rejectRemoteImageSource(sourcePath); err != nil {
		return ImageAttachment{}, err
	}
	attachmentID, err := service.newID("attachment")
	if err != nil {
		return ImageAttachment{}, fmt.Errorf("create attachment id: %w", err)
	}
	return service.store.CreateImageAttachmentFromPath(workspaceID, conversationID, attachmentID, sourcePath, timestamp(service.now()))
}

func (service *Service) CreateImageAttachmentFromBytes(workspaceID string, conversationID string, fileName string, data []byte) (ImageAttachment, error) {
	if _, err := service.validateConversationRequest(workspaceID, conversationID); err != nil {
		return ImageAttachment{}, err
	}
	attachmentID, err := service.newID("attachment")
	if err != nil {
		return ImageAttachment{}, fmt.Errorf("create attachment id: %w", err)
	}
	return service.store.CreateImageAttachmentFromBytes(workspaceID, conversationID, attachmentID, fileName, data, timestamp(service.now()))
}

func (store *Store) CreateImageAttachmentFromPath(workspaceID string, conversationID string, attachmentID string, sourcePath string, createdAt string) (ImageAttachment, error) {
	if sourcePath == "" {
		return ImageAttachment{}, errors.New("image path is required")
	}
	cleanPath := filepath.Clean(sourcePath)
	info, err := os.Stat(cleanPath)
	if err != nil {
		return ImageAttachment{}, &PersistenceError{Operation: "stat image attachment source", Path: cleanPath, Err: err}
	}
	if info.IsDir() {
		return ImageAttachment{}, fmt.Errorf("image attachment source is a directory: %s", cleanPath)
	}
	if info.Size() > maxImageAttachmentBytes {
		return ImageAttachment{}, fmt.Errorf("image attachment is %d bytes, maximum is %d", info.Size(), maxImageAttachmentBytes)
	}
	file, err := os.Open(cleanPath)
	if err != nil {
		return ImageAttachment{}, &PersistenceError{Operation: "open image attachment source", Path: cleanPath, Err: err}
	}
	defer file.Close()
	data, err := readAllLimited(file, maxImageAttachmentBytes)
	if err != nil {
		return ImageAttachment{}, &PersistenceError{Operation: "read image attachment source", Path: cleanPath, Err: err}
	}
	return store.CreateImageAttachmentFromBytes(workspaceID, conversationID, attachmentID, filepath.Base(cleanPath), data, createdAt)
}

func (store *Store) CreateImageAttachmentFromBytes(workspaceID string, conversationID string, attachmentID string, fileName string, data []byte, createdAt string) (ImageAttachment, error) {
	if err := validateImageAttachmentCreateRequest(workspaceID, conversationID, attachmentID, data, createdAt); err != nil {
		return ImageAttachment{}, err
	}
	decoded, err := decodeImageAttachment(data)
	if err != nil {
		return ImageAttachment{}, err
	}
	variants, variantBytes, err := buildImageAttachmentVariants(decoded, data)
	if err != nil {
		return ImageAttachment{}, err
	}
	record := imageAttachmentRecord{
		SchemaVersion:  SchemaVersion,
		ID:             attachmentID,
		WorkspaceID:    workspaceID,
		ConversationID: conversationID,
		FileName:       safeAttachmentFileName(fileName, decoded.Extension),
		MimeType:       decoded.MimeType,
		ByteSize:       len(data),
		Width:          decoded.Width,
		Height:         decoded.Height,
		SHA256:         sha256Hex(data),
		CreatedAt:      createdAt,
		Variants:       variants,
	}
	if err := validateImageAttachmentRecord(record); err != nil {
		return ImageAttachment{}, err
	}
	if err := store.writeImageAttachmentRecord(record, variantBytes); err != nil {
		return ImageAttachment{}, err
	}
	return imageAttachmentDescriptor(record), nil
}

func validateImageAttachmentCreateRequest(workspaceID string, conversationID string, attachmentID string, data []byte, createdAt string) error {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return err
	}
	if err := validateStorageID("attachment id", attachmentID); err != nil {
		return err
	}
	if err := validateTimestamp(createdAt, "attachment "+attachmentID+" createdAt"); err != nil {
		return err
	}
	if len(data) == 0 {
		return errors.New("image attachment is empty")
	}
	if len(data) > maxImageAttachmentBytes {
		return fmt.Errorf("image attachment is %d bytes, maximum is %d", len(data), maxImageAttachmentBytes)
	}
	return nil
}

func decodeImageAttachment(data []byte) (decodedImageAttachment, error) {
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return decodedImageAttachment{}, fmt.Errorf("decode image attachment: %w", err)
	}
	mimeType, extension, err := imageFormatMetadata(format)
	if err != nil {
		return decodedImageAttachment{}, err
	}
	width := config.Width
	height := config.Height
	if width <= 0 || height <= 0 {
		return decodedImageAttachment{}, errors.New("image attachment dimensions must be positive")
	}
	if width > maxImageAttachmentDimension || height > maxImageAttachmentDimension {
		return decodedImageAttachment{}, fmt.Errorf("image attachment dimensions are %dx%d, maximum dimension is %d", width, height, maxImageAttachmentDimension)
	}
	decoded, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return decodedImageAttachment{}, fmt.Errorf("decode image attachment: %w", err)
	}
	if decodedFormat != format {
		return decodedImageAttachment{}, fmt.Errorf("image attachment header format %s did not match decoded format %s", format, decodedFormat)
	}
	return decodedImageAttachment{
		Image:     decoded,
		MimeType:  ImageAttachmentMimeType(mimeType),
		Extension: extension,
		Width:     width,
		Height:    height,
	}, nil
}

func (store *Store) LoadImageAttachment(workspaceID string, conversationID string, attachmentID string) (ImageAttachment, error) {
	record, err := store.loadImageAttachmentRecord(workspaceID, conversationID, attachmentID)
	if err != nil {
		return ImageAttachment{}, err
	}
	return imageAttachmentDescriptor(record), nil
}

func (store *Store) ImageAttachmentOriginalPath(workspaceID string, conversationID string, attachmentID string) (string, error) {
	record, err := store.loadImageAttachmentRecord(workspaceID, conversationID, attachmentID)
	if err != nil {
		return "", err
	}
	original, err := imageAttachmentVariantRecordForKind(record, ImageAttachmentVariantOriginal)
	if err != nil {
		return "", err
	}
	return filepath.Join(store.imageAttachmentDir(record.WorkspaceID, record.ConversationID, record.ID), original.RelativePath), nil
}

func (store *Store) ImageAttachmentResourcePath(workspaceID string, conversationID string, attachmentID string, variant string) (string, string, error) {
	record, err := store.loadImageAttachmentRecord(workspaceID, conversationID, attachmentID)
	if err != nil {
		return "", "", err
	}
	kind := ImageAttachmentVariantKind(variant)
	if !validValue(kind, imageAttachmentVariantKindValues) {
		return "", "", fmt.Errorf("unsupported image attachment resource variant %s", variant)
	}
	found, err := imageAttachmentVariantRecordForKind(record, kind)
	if err != nil {
		return "", "", err
	}
	path := filepath.Join(store.imageAttachmentDir(workspaceID, conversationID, attachmentID), found.RelativePath)
	return path, string(found.MimeType), nil
}

func (store *Store) loadImageAttachmentRecord(workspaceID string, conversationID string, attachmentID string) (imageAttachmentRecord, error) {
	if err := validateStoreConversationIDs(workspaceID, conversationID); err != nil {
		return imageAttachmentRecord{}, err
	}
	if err := validateStorageID("attachment id", attachmentID); err != nil {
		return imageAttachmentRecord{}, err
	}
	var record imageAttachmentRecord
	path := store.imageAttachmentMetadataPath(workspaceID, conversationID, attachmentID)
	if err := readJSONFile(path, &record); err != nil {
		return imageAttachmentRecord{}, err
	}
	if err := validateImageAttachmentRecord(record); err != nil {
		return imageAttachmentRecord{}, corruptStateError(path, err)
	}
	if record.WorkspaceID != workspaceID {
		return imageAttachmentRecord{}, corruptStateErrorf(path, "attachment %s belongs to workspace %s, not %s", attachmentID, record.WorkspaceID, workspaceID)
	}
	if record.ConversationID != conversationID {
		return imageAttachmentRecord{}, corruptStateErrorf(path, "attachment %s belongs to conversation %s, not %s", attachmentID, record.ConversationID, conversationID)
	}
	if record.ID != attachmentID {
		return imageAttachmentRecord{}, corruptStateErrorf(path, "attachment file id %s does not match requested id %s", record.ID, attachmentID)
	}
	return record, nil
}

func (store *Store) writeImageAttachmentRecord(record imageAttachmentRecord, variantBytes map[ImageAttachmentVariantKind][]byte) error {
	parentDir := store.imageAttachmentsDir(record.WorkspaceID, record.ConversationID)
	if err := os.MkdirAll(parentDir, 0o755); err != nil {
		return &PersistenceError{Operation: "create image attachments directory", Path: parentDir, Err: err}
	}
	finalDir := store.imageAttachmentDir(record.WorkspaceID, record.ConversationID, record.ID)
	if _, err := os.Stat(finalDir); err == nil {
		return &PersistenceError{Operation: "create image attachment directory", Path: finalDir, Err: os.ErrExist}
	} else if !errors.Is(err, os.ErrNotExist) {
		return &PersistenceError{Operation: "stat image attachment directory", Path: finalDir, Err: err}
	}
	tempDir, err := os.MkdirTemp(parentDir, ".tmp-attachment-*")
	if err != nil {
		return &PersistenceError{Operation: "create temp image attachment directory", Path: parentDir, Err: err}
	}
	removeTemp := true
	defer func() {
		if removeTemp {
			_ = os.RemoveAll(tempDir)
		}
	}()
	if err := writeImageAttachmentVariants(tempDir, record, variantBytes); err != nil {
		return err
	}
	if err := writeJSONFile(filepath.Join(tempDir, attachmentMetadataFileName), record); err != nil {
		return err
	}
	if err := os.Rename(tempDir, finalDir); err != nil {
		return &PersistenceError{Operation: "publish image attachment directory", Path: finalDir, Err: err}
	}
	removeTemp = false
	return nil
}

func writeImageAttachmentVariants(tempDir string, record imageAttachmentRecord, variantBytes map[ImageAttachmentVariantKind][]byte) error {
	for _, variant := range record.Variants {
		data, exists := variantBytes[variant.Kind]
		if !exists {
			return fmt.Errorf("image attachment variant %s bytes are missing", variant.Kind)
		}
		if len(data) != variant.ByteSize {
			return fmt.Errorf("image attachment variant %s byte size mismatch", variant.Kind)
		}
		if err := writeFile(filepath.Join(tempDir, variant.RelativePath), data); err != nil {
			return err
		}
	}
	return nil
}

func writeFile(path string, data []byte) error {
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return &PersistenceError{Operation: "write image attachment file", Path: path, Err: err}
	}
	return nil
}

func validateImageAttachmentRecord(record imageAttachmentRecord) error {
	if err := validateImageAttachmentRecordIdentity(record); err != nil {
		return err
	}
	if err := validateImageAttachmentRecordMetadata(record); err != nil {
		return err
	}
	return validateImageAttachmentVariantRecords(record)
}

func validateImageAttachmentRecordIdentity(record imageAttachmentRecord) error {
	if record.SchemaVersion != SchemaVersion {
		return fmt.Errorf("attachment %s has unsupported schemaVersion %d", record.ID, record.SchemaVersion)
	}
	if err := validateStorageID("attachment id", record.ID); err != nil {
		return err
	}
	if err := validateWorkspaceID(record.WorkspaceID); err != nil {
		return err
	}
	if err := validateConversationID(record.ConversationID); err != nil {
		return err
	}
	return nil
}

func validateImageAttachmentRecordMetadata(record imageAttachmentRecord) error {
	if err := validateImageAttachmentFileRecord(record); err != nil {
		return err
	}
	if err := validateImageAttachmentDimensionRecord(record); err != nil {
		return err
	}
	if record.SHA256 == "" {
		return fmt.Errorf("attachment %s sha256 is required", record.ID)
	}
	if err := validateTimestamp(record.CreatedAt, "attachment "+record.ID+" createdAt"); err != nil {
		return err
	}
	return nil
}

func validateImageAttachmentFileRecord(record imageAttachmentRecord) error {
	if record.FileName == "" {
		return fmt.Errorf("attachment %s fileName is required", record.ID)
	}
	if !supportedImageMimeType(record.MimeType) {
		return fmt.Errorf("attachment %s has unsupported mimeType %s", record.ID, record.MimeType)
	}
	if record.ByteSize <= 0 || record.ByteSize > maxImageAttachmentBytes {
		return fmt.Errorf("attachment %s byteSize must be between 1 and %d", record.ID, maxImageAttachmentBytes)
	}
	return nil
}

func validateImageAttachmentDimensionRecord(record imageAttachmentRecord) error {
	if record.Width <= 0 || record.Height <= 0 {
		return fmt.Errorf("attachment %s dimensions must be positive", record.ID)
	}
	if record.Width > maxImageAttachmentDimension || record.Height > maxImageAttachmentDimension {
		return fmt.Errorf("attachment %s dimensions exceed maximum %d", record.ID, maxImageAttachmentDimension)
	}
	return nil
}

func validateImageAttachmentVariantRecords(record imageAttachmentRecord) error {
	if len(record.Variants) != len(imageAttachmentVariantKindValues) {
		return fmt.Errorf("attachment %s has %d variants, want %d", record.ID, len(record.Variants), len(imageAttachmentVariantKindValues))
	}
	seen := map[ImageAttachmentVariantKind]bool{}
	for _, variant := range record.Variants {
		if err := validateImageAttachmentVariantRecord(record, variant); err != nil {
			return err
		}
		if seen[variant.Kind] {
			return fmt.Errorf("attachment %s has duplicate %s variant", record.ID, variant.Kind)
		}
		seen[variant.Kind] = true
	}
	for _, kind := range imageAttachmentVariantKindValues {
		if !seen[kind] {
			return fmt.Errorf("attachment %s is missing %s variant", record.ID, kind)
		}
	}
	return nil
}

func validateImageAttachmentVariantRecord(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	if err := validateImageAttachmentVariantKindAndPath(record, variant); err != nil {
		return err
	}
	if err := validateImageAttachmentVariantMetadata(record, variant); err != nil {
		return err
	}
	if variant.Kind == ImageAttachmentVariantOriginal {
		return validateImageAttachmentOriginalVariant(record, variant)
	}
	return validateImageAttachmentGeneratedVariant(record, variant)
}

func validateImageAttachmentVariantKindAndPath(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	if !validValue(variant.Kind, imageAttachmentVariantKindValues) {
		return fmt.Errorf("attachment %s has unsupported variant kind %s", record.ID, variant.Kind)
	}
	if !safeRelativeAttachmentPath(variant.RelativePath) {
		return fmt.Errorf("attachment %s %s variant relativePath is invalid", record.ID, variant.Kind)
	}
	if variant.RelativePath != imageAttachmentVariantRelativePath(record.MimeType, variant.Kind) {
		return fmt.Errorf("attachment %s %s variant relativePath is %s", record.ID, variant.Kind, variant.RelativePath)
	}
	return nil
}

func validateImageAttachmentVariantMetadata(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	if !supportedImageMimeType(variant.MimeType) {
		return fmt.Errorf("attachment %s %s variant has unsupported mimeType %s", record.ID, variant.Kind, variant.MimeType)
	}
	if variant.ByteSize <= 0 || variant.ByteSize > maxImageAttachmentBytes {
		return fmt.Errorf("attachment %s %s variant byteSize must be between 1 and %d", record.ID, variant.Kind, maxImageAttachmentBytes)
	}
	if variant.Width <= 0 || variant.Height <= 0 {
		return fmt.Errorf("attachment %s %s variant dimensions must be positive", record.ID, variant.Kind)
	}
	if variant.Width > maxImageAttachmentDimension || variant.Height > maxImageAttachmentDimension {
		return fmt.Errorf("attachment %s %s variant dimensions exceed maximum %d", record.ID, variant.Kind, maxImageAttachmentDimension)
	}
	return nil
}

func validateImageAttachmentGeneratedVariant(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	if variant.MimeType != ImageAttachmentMimeTypePNG {
		return fmt.Errorf("attachment %s %s variant mimeType must be image/png", record.ID, variant.Kind)
	}
	return validateImageAttachmentScaledVariant(record, variant)
}

func validateImageAttachmentOriginalVariant(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	if variant.MimeType != record.MimeType {
		return fmt.Errorf("attachment %s original variant mimeType %s does not match %s", record.ID, variant.MimeType, record.MimeType)
	}
	if variant.ByteSize != record.ByteSize {
		return fmt.Errorf("attachment %s original variant byteSize %d does not match %d", record.ID, variant.ByteSize, record.ByteSize)
	}
	if variant.Width != record.Width || variant.Height != record.Height {
		return fmt.Errorf("attachment %s original variant dimensions are %dx%d, want %dx%d", record.ID, variant.Width, variant.Height, record.Width, record.Height)
	}
	return nil
}

func validateImageAttachmentScaledVariant(record imageAttachmentRecord, variant imageAttachmentVariantRecord) error {
	maxPixels := imageAttachmentVariantMaxPixels(variant.Kind)
	if variant.Width > maxPixels || variant.Height > maxPixels {
		return fmt.Errorf("attachment %s %s variant dimensions exceed %d", record.ID, variant.Kind, maxPixels)
	}
	if record.Width <= maxPixels && record.Height <= maxPixels {
		if variant.Width != record.Width || variant.Height != record.Height {
			return fmt.Errorf("attachment %s %s variant dimensions are %dx%d, want original dimensions", record.ID, variant.Kind, variant.Width, variant.Height)
		}
	}
	return nil
}

func imageAttachmentDescriptor(record imageAttachmentRecord) ImageAttachment {
	return ImageAttachment{
		SchemaVersion:  record.SchemaVersion,
		ID:             record.ID,
		WorkspaceID:    record.WorkspaceID,
		ConversationID: record.ConversationID,
		FileName:       record.FileName,
		MimeType:       record.MimeType,
		ByteSize:       record.ByteSize,
		Width:          record.Width,
		Height:         record.Height,
		CreatedAt:      record.CreatedAt,
		Variants:       imageAttachmentVariants(record),
	}
}

func imageAttachmentVariants(record imageAttachmentRecord) []ImageAttachmentVariant {
	variants := make([]ImageAttachmentVariant, 0, len(imageAttachmentVariantKindValues))
	for _, kind := range imageAttachmentVariantKindValues {
		variant, err := imageAttachmentVariantRecordForKind(record, kind)
		if err != nil {
			panic(err)
		}
		variants = append(variants, ImageAttachmentVariant{
			Kind:     variant.Kind,
			URL:      imageAttachmentURL(record.WorkspaceID, record.ConversationID, record.ID, string(variant.Kind)),
			MimeType: variant.MimeType,
			ByteSize: variant.ByteSize,
			Width:    variant.Width,
			Height:   variant.Height,
		})
	}
	return variants
}

func cloneImageAttachmentVariants(variants []ImageAttachmentVariant) []ImageAttachmentVariant {
	if len(variants) == 0 {
		return nil
	}
	cloned := make([]ImageAttachmentVariant, len(variants))
	copy(cloned, variants)
	return cloned
}

func imageAttachmentVariantRecordForKind(record imageAttachmentRecord, kind ImageAttachmentVariantKind) (imageAttachmentVariantRecord, error) {
	for _, variant := range record.Variants {
		if variant.Kind == kind {
			return variant, nil
		}
	}
	return imageAttachmentVariantRecord{}, fmt.Errorf("attachment %s is missing %s variant", record.ID, kind)
}

func imagePartFromAttachment(attachment ImageAttachment, detail *ImageDetail) ImagePart {
	return ImagePart{
		AttachmentID: attachment.ID,
		FileName:     attachment.FileName,
		MimeType:     attachment.MimeType,
		ByteSize:     attachment.ByteSize,
		Width:        attachment.Width,
		Height:       attachment.Height,
		Variants:     cloneImageAttachmentVariants(attachment.Variants),
		Detail:       detail,
	}
}

func imageAttachmentURL(workspaceID string, conversationID string, attachmentID string, variant string) string {
	return (&url.URL{
		Scheme: "setta-attachment",
		Host:   "image",
		Path:   "/" + workspaceID + "/" + conversationID + "/" + attachmentID + "/" + variant,
	}).String()
}

func rejectRemoteImageSource(source string) error {
	parsed, err := url.Parse(source)
	if err != nil {
		return fmt.Errorf("parse image source: %w", err)
	}
	if parsed.Scheme == "http" || parsed.Scheme == "https" {
		return errors.New("remote image URLs are not supported")
	}
	return nil
}

func imageFormatMetadata(format string) (string, string, error) {
	switch format {
	case "png":
		return "image/png", ".png", nil
	case "jpeg":
		return "image/jpeg", ".jpg", nil
	case "gif":
		return "image/gif", ".gif", nil
	default:
		return "", "", fmt.Errorf("unsupported image format %s", format)
	}
}

func supportedImageMimeType(mimeType ImageAttachmentMimeType) bool {
	switch mimeType {
	case ImageAttachmentMimeTypePNG, ImageAttachmentMimeTypeJPEG, ImageAttachmentMimeTypeGIF:
		return true
	default:
		return false
	}
}

func safeAttachmentFileName(fileName string, extension string) string {
	base := filepath.Base(strings.TrimSpace(fileName))
	if base == "." || base == string(filepath.Separator) || base == "" {
		return "image" + extension
	}
	if filepath.Ext(base) == "" {
		return base + extension
	}
	return base
}

func safeRelativeAttachmentPath(value string) bool {
	if value == "" || filepath.IsAbs(value) {
		return false
	}
	if strings.Contains(value, "/") || strings.Contains(value, string(filepath.Separator)) {
		return false
	}
	clean := filepath.Clean(value)
	return clean == value && clean != "." && clean != ".."
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func buildImageAttachmentVariants(decoded decodedImageAttachment, original []byte) ([]imageAttachmentVariantRecord, map[ImageAttachmentVariantKind][]byte, error) {
	variants := []imageAttachmentVariantRecord{{
		Kind:         ImageAttachmentVariantOriginal,
		RelativePath: imageAttachmentVariantRelativePath(decoded.MimeType, ImageAttachmentVariantOriginal),
		MimeType:     decoded.MimeType,
		ByteSize:     len(original),
		Width:        decoded.Width,
		Height:       decoded.Height,
	}}
	variantBytes := map[ImageAttachmentVariantKind][]byte{
		ImageAttachmentVariantOriginal: original,
	}
	for _, kind := range []ImageAttachmentVariantKind{
		ImageAttachmentVariantThumbnail,
		ImageAttachmentVariantInline,
		ImageAttachmentVariantPreview,
	} {
		data, width, height, err := encodeImageAttachmentVariantPNG(decoded.Image, kind)
		if err != nil {
			return nil, nil, err
		}
		variants = append(variants, imageAttachmentVariantRecord{
			Kind:         kind,
			RelativePath: imageAttachmentVariantRelativePath(decoded.MimeType, kind),
			MimeType:     ImageAttachmentMimeTypePNG,
			ByteSize:     len(data),
			Width:        width,
			Height:       height,
		})
		variantBytes[kind] = data
	}
	return orderImageAttachmentVariantRecords(variants), variantBytes, nil
}

func orderImageAttachmentVariantRecords(variants []imageAttachmentVariantRecord) []imageAttachmentVariantRecord {
	ordered := make([]imageAttachmentVariantRecord, 0, len(variants))
	for _, kind := range imageAttachmentVariantKindValues {
		for _, variant := range variants {
			if variant.Kind == kind {
				ordered = append(ordered, variant)
				break
			}
		}
	}
	return ordered
}

func encodeImageAttachmentVariantPNG(source image.Image, kind ImageAttachmentVariantKind) ([]byte, int, int, error) {
	resized := resizeImageToFit(source, imageAttachmentVariantMaxPixels(kind))
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, resized); err != nil {
		return nil, 0, 0, fmt.Errorf("encode image attachment %s variant: %w", kind, err)
	}
	return buffer.Bytes(), resized.Bounds().Dx(), resized.Bounds().Dy(), nil
}

func imageAttachmentVariantMaxPixels(kind ImageAttachmentVariantKind) int {
	switch kind {
	case ImageAttachmentVariantThumbnail:
		return attachmentThumbnailMaxPixels
	case ImageAttachmentVariantInline:
		return attachmentInlineMaxPixels
	case ImageAttachmentVariantPreview:
		return attachmentPreviewMaxPixels
	default:
		return maxImageAttachmentDimension
	}
}

func imageAttachmentVariantRelativePath(originalMimeType ImageAttachmentMimeType, kind ImageAttachmentVariantKind) string {
	switch kind {
	case ImageAttachmentVariantThumbnail:
		return attachmentThumbnailFileName
	case ImageAttachmentVariantInline:
		return attachmentInlineFileName
	case ImageAttachmentVariantPreview:
		return attachmentPreviewFileName
	case ImageAttachmentVariantOriginal:
		return attachmentOriginalFileName + imageAttachmentMimeExtension(originalMimeType)
	default:
		return ""
	}
}

func imageAttachmentMimeExtension(mimeType ImageAttachmentMimeType) string {
	switch mimeType {
	case ImageAttachmentMimeTypePNG:
		return ".png"
	case ImageAttachmentMimeTypeJPEG:
		return ".jpg"
	case ImageAttachmentMimeTypeGIF:
		return ".gif"
	default:
		return ""
	}
}

func resizeImageToFit(source image.Image, maxPixels int) image.Image {
	bounds := source.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= maxPixels && height <= maxPixels {
		return copyImageRGBA(source)
	}
	nextWidth, nextHeight := scaledDimensions(width, height, maxPixels)
	return resizeImageBilinear(source, nextWidth, nextHeight)
}

func copyImageRGBA(source image.Image) *image.RGBA {
	bounds := source.Bounds()
	copy := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	draw.Draw(copy, copy.Bounds(), source, bounds.Min, draw.Src)
	return copy
}

func resizeImageBilinear(source image.Image, nextWidth int, nextHeight int) *image.RGBA {
	bounds := source.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	target := image.NewRGBA(image.Rect(0, 0, nextWidth, nextHeight))
	scaleX := float64(width) / float64(nextWidth)
	scaleY := float64(height) / float64(nextHeight)
	for y := 0; y < nextHeight; y++ {
		sourceY := (float64(y)+0.5)*scaleY - 0.5
		y0 := clampInt(int(math.Floor(sourceY)), 0, height-1)
		y1 := clampInt(y0+1, 0, height-1)
		yWeight := sourceY - float64(y0)
		for x := 0; x < nextWidth; x++ {
			sourceX := (float64(x)+0.5)*scaleX - 0.5
			x0 := clampInt(int(math.Floor(sourceX)), 0, width-1)
			x1 := clampInt(x0+1, 0, width-1)
			xWeight := sourceX - float64(x0)
			target.Set(x, y, bilinearColor(
				source.At(bounds.Min.X+x0, bounds.Min.Y+y0),
				source.At(bounds.Min.X+x1, bounds.Min.Y+y0),
				source.At(bounds.Min.X+x0, bounds.Min.Y+y1),
				source.At(bounds.Min.X+x1, bounds.Min.Y+y1),
				xWeight,
				yWeight,
			))
		}
	}
	return target
}

func bilinearColor(topLeft color.Color, topRight color.Color, bottomLeft color.Color, bottomRight color.Color, xWeight float64, yWeight float64) color.RGBA {
	tlr, tlg, tlb, tla := topLeft.RGBA()
	trr, trg, trb, tra := topRight.RGBA()
	blr, blg, blb, bla := bottomLeft.RGBA()
	brr, brg, brb, bra := bottomRight.RGBA()
	return color.RGBA{
		R: interpolateBilinear8(tlr, trr, blr, brr, xWeight, yWeight),
		G: interpolateBilinear8(tlg, trg, blg, brg, xWeight, yWeight),
		B: interpolateBilinear8(tlb, trb, blb, brb, xWeight, yWeight),
		A: interpolateBilinear8(tla, tra, bla, bra, xWeight, yWeight),
	}
}

func interpolateBilinear8(topLeft uint32, topRight uint32, bottomLeft uint32, bottomRight uint32, xWeight float64, yWeight float64) uint8 {
	top := float64(topLeft)*(1-xWeight) + float64(topRight)*xWeight
	bottom := float64(bottomLeft)*(1-xWeight) + float64(bottomRight)*xWeight
	value := top*(1-yWeight) + bottom*yWeight
	return uint8(math.Round(value / 257))
}

func clampInt(value int, minimum int, maximum int) int {
	return min(max(value, minimum), maximum)
}

func scaledDimensions(width int, height int, maxPixels int) (int, int) {
	if width >= height {
		nextWidth := maxPixels
		nextHeight := max(1, height*maxPixels/width)
		return nextWidth, nextHeight
	}
	nextHeight := maxPixels
	nextWidth := max(1, width*maxPixels/height)
	return nextWidth, nextHeight
}

func readAllLimited(reader io.Reader, limit int64) ([]byte, error) {
	limited := io.LimitReader(reader, limit+1)
	data, err := io.ReadAll(limited)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, fmt.Errorf("image attachment exceeds %d bytes", limit)
	}
	return data, nil
}
