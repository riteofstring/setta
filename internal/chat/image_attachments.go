package chat

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/png"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

const (
	attachmentsDirName           = "attachments"
	attachmentMetadataFileName   = "metadata.json"
	attachmentOriginalFileName   = "original"
	attachmentThumbnailFileName  = "thumbnail.png"
	attachmentThumbnailMaxPixels = 160
	maxImageAttachmentBytes      = 20 * 1024 * 1024
	maxImageAttachmentDimension  = 12000
)

type imageAttachmentRecord struct {
	SchemaVersion         int                     `json:"schemaVersion"`
	ID                    string                  `json:"id"`
	WorkspaceID           string                  `json:"workspaceId"`
	ConversationID        string                  `json:"conversationId"`
	FileName              string                  `json:"fileName"`
	MimeType              ImageAttachmentMimeType `json:"mimeType"`
	ByteSize              int                     `json:"byteSize"`
	Width                 int                     `json:"width"`
	Height                int                     `json:"height"`
	SHA256                string                  `json:"sha256"`
	CreatedAt             string                  `json:"createdAt"`
	OriginalRelativePath  string                  `json:"originalRelativePath"`
	ThumbnailRelativePath string                  `json:"thumbnailRelativePath"`
	ThumbnailMimeType     string                  `json:"thumbnailMimeType"`
	ThumbnailWidth        int                     `json:"thumbnailWidth"`
	ThumbnailHeight       int                     `json:"thumbnailHeight"`
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
	thumbnailBytes, thumbnailWidth, thumbnailHeight, err := encodeThumbnailPNG(decoded.Image)
	if err != nil {
		return ImageAttachment{}, err
	}
	record := imageAttachmentRecord{
		SchemaVersion:         SchemaVersion,
		ID:                    attachmentID,
		WorkspaceID:           workspaceID,
		ConversationID:        conversationID,
		FileName:              safeAttachmentFileName(fileName, decoded.Extension),
		MimeType:              decoded.MimeType,
		ByteSize:              len(data),
		Width:                 decoded.Width,
		Height:                decoded.Height,
		SHA256:                sha256Hex(data),
		CreatedAt:             createdAt,
		OriginalRelativePath:  attachmentOriginalFileName + decoded.Extension,
		ThumbnailRelativePath: attachmentThumbnailFileName,
		ThumbnailMimeType:     "image/png",
		ThumbnailWidth:        thumbnailWidth,
		ThumbnailHeight:       thumbnailHeight,
	}
	if err := validateImageAttachmentRecord(record); err != nil {
		return ImageAttachment{}, err
	}
	if err := store.writeImageAttachmentRecord(record, data, thumbnailBytes); err != nil {
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
	return store.imageAttachmentOriginalPath(record), nil
}

func (store *Store) ImageAttachmentResourcePath(workspaceID string, conversationID string, attachmentID string, variant string) (string, string, error) {
	record, err := store.loadImageAttachmentRecord(workspaceID, conversationID, attachmentID)
	if err != nil {
		return "", "", err
	}
	switch variant {
	case "thumbnail":
		return filepath.Join(store.imageAttachmentDir(workspaceID, conversationID, attachmentID), record.ThumbnailRelativePath), record.ThumbnailMimeType, nil
	case "preview":
		return filepath.Join(store.imageAttachmentDir(workspaceID, conversationID, attachmentID), record.OriginalRelativePath), string(record.MimeType), nil
	default:
		return "", "", fmt.Errorf("unsupported image attachment resource variant %s", variant)
	}
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

func (store *Store) writeImageAttachmentRecord(record imageAttachmentRecord, original []byte, thumbnail []byte) error {
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
	if err := writeFile(filepath.Join(tempDir, record.OriginalRelativePath), original); err != nil {
		return err
	}
	if err := writeFile(filepath.Join(tempDir, record.ThumbnailRelativePath), thumbnail); err != nil {
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
	return validateImageAttachmentThumbnailRecord(record)
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
	if !safeRelativeAttachmentPath(record.OriginalRelativePath) {
		return fmt.Errorf("attachment %s originalRelativePath is invalid", record.ID)
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

func validateImageAttachmentThumbnailRecord(record imageAttachmentRecord) error {
	if record.ThumbnailRelativePath != attachmentThumbnailFileName {
		return fmt.Errorf("attachment %s thumbnailRelativePath is invalid", record.ID)
	}
	if record.ThumbnailMimeType != "image/png" {
		return fmt.Errorf("attachment %s thumbnailMimeType must be image/png", record.ID)
	}
	if record.ThumbnailWidth <= 0 || record.ThumbnailHeight <= 0 {
		return fmt.Errorf("attachment %s thumbnail dimensions must be positive", record.ID)
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
		ThumbnailURL:   imageAttachmentURL(record.WorkspaceID, record.ConversationID, record.ID, "thumbnail"),
		PreviewURL:     imageAttachmentURL(record.WorkspaceID, record.ConversationID, record.ID, "preview"),
	}
}

func (store *Store) imageAttachmentOriginalPath(record imageAttachmentRecord) string {
	return filepath.Join(store.imageAttachmentDir(record.WorkspaceID, record.ConversationID, record.ID), record.OriginalRelativePath)
}

func imagePartFromAttachment(attachment ImageAttachment, detail *ImageDetail) ImagePart {
	return ImagePart{
		AttachmentID: attachment.ID,
		FileName:     attachment.FileName,
		MimeType:     attachment.MimeType,
		ByteSize:     attachment.ByteSize,
		Width:        attachment.Width,
		Height:       attachment.Height,
		ThumbnailURL: attachment.ThumbnailURL,
		PreviewURL:   attachment.PreviewURL,
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

func encodeThumbnailPNG(source image.Image) ([]byte, int, int, error) {
	resized := resizeImageToFit(source, attachmentThumbnailMaxPixels)
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, resized); err != nil {
		return nil, 0, 0, fmt.Errorf("encode image attachment thumbnail: %w", err)
	}
	return buffer.Bytes(), resized.Bounds().Dx(), resized.Bounds().Dy(), nil
}

func resizeImageToFit(source image.Image, maxPixels int) image.Image {
	bounds := source.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()
	if width <= maxPixels && height <= maxPixels {
		copy := image.NewRGBA(image.Rect(0, 0, width, height))
		draw.Draw(copy, copy.Bounds(), source, bounds.Min, draw.Src)
		return copy
	}
	nextWidth, nextHeight := scaledDimensions(width, height, maxPixels)
	target := image.NewRGBA(image.Rect(0, 0, nextWidth, nextHeight))
	for y := 0; y < nextHeight; y++ {
		sourceY := bounds.Min.Y + y*height/nextHeight
		for x := 0; x < nextWidth; x++ {
			sourceX := bounds.Min.X + x*width/nextWidth
			target.Set(x, y, source.At(sourceX, sourceY))
		}
	}
	return target
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
