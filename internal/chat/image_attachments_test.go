package chat

import (
	"bytes"
	"context"
	"encoding/binary"
	"hash/crc32"
	"image"
	"image/color"
	"image/png"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/workspace"
)

func TestCreateImageAttachmentFromBytesStoresMetadataAndResources(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "Images")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}

	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 3, 2))
	if err != nil {
		t.Fatalf("create image attachment: %v", err)
	}

	if attachment.FileName != "fixture.png" || attachment.MimeType != "image/png" || attachment.Width != 3 || attachment.Height != 2 {
		t.Fatalf("attachment metadata = %+v, want fixture.png image/png 3x2", attachment)
	}
	if !strings.HasPrefix(attachment.ThumbnailURL, "setta-attachment://image/") || !strings.HasSuffix(attachment.ThumbnailURL, "/thumbnail") {
		t.Fatalf("thumbnail URL = %q, want app attachment thumbnail URL", attachment.ThumbnailURL)
	}
	if !strings.HasSuffix(attachment.PreviewURL, "/preview") {
		t.Fatalf("preview URL = %q, want app attachment preview URL", attachment.PreviewURL)
	}

	loaded, err := service.store.LoadImageAttachment("workspace_api", conversation.ID, attachment.ID)
	if err != nil {
		t.Fatalf("load image attachment: %v", err)
	}
	if loaded.ID != attachment.ID || loaded.ByteSize != attachment.ByteSize {
		t.Fatalf("loaded attachment = %+v, want %+v", loaded, attachment)
	}
	for _, variant := range []string{"thumbnail", "preview"} {
		path, mimeType, err := service.store.ImageAttachmentResourcePath("workspace_api", conversation.ID, attachment.ID, variant)
		if err != nil {
			t.Fatalf("resource path %s: %v", variant, err)
		}
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("stat %s resource %s: %v", variant, path, err)
		}
		if mimeType == "" {
			t.Fatalf("%s resource mime type was empty", variant)
		}
	}
}

func TestDecodeImageAttachmentRejectsOversizedDimensionsBeforeFullDecode(t *testing.T) {
	_, err := decodeImageAttachment(testPNGHeader(t, maxImageAttachmentDimension+1, 1))
	if err == nil || !strings.Contains(err.Error(), "maximum dimension") {
		t.Fatalf("decode oversized dimensions error = %v, want maximum dimension error", err)
	}
}

func TestSafeRelativeAttachmentPathRejectsDotSegments(t *testing.T) {
	for _, value := range []string{".", ".."} {
		if safeRelativeAttachmentPath(value) {
			t.Fatalf("safeRelativeAttachmentPath(%q) = true, want false", value)
		}
	}
}

func TestSendUserInputWithImagePersistsPartAndDeliversLocalPath(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventAssistantDelta, Text: "done"}})
	harness.model = "scripted-fast"
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "Images")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 2, 2))
	if err != nil {
		t.Fatalf("create image attachment: %v", err)
	}
	detail := ImageDetailHigh

	result, err := service.SendUserInput("workspace_api", conversation.ID, ChatInput{Parts: []ChatInputPart{
		{Type: MessagePartText, Text: &ChatTextInput{Text: "describe this", Format: TextFormatPlain}},
		{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: attachment.ID, Detail: &detail}},
	}})
	if err != nil {
		t.Fatalf("send image input: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	if len(result.UserMessage.Parts) != 2 || result.UserMessage.Parts[1].Image == nil {
		t.Fatalf("user message parts = %+v, want text and image parts", result.UserMessage.Parts)
	}
	imagePart := result.UserMessage.Parts[1].Image
	if imagePart.AttachmentID != attachment.ID || imagePart.Detail == nil || *imagePart.Detail != ImageDetailHigh {
		t.Fatalf("image part = %+v, want attachment id and high detail", imagePart)
	}
	turn := waitForFakeTurnRequest(t, harness, result.Run.ID)
	if chatInputText(turn.Input) != "describe this" {
		t.Fatalf("turn input text = %q, want text summary", chatInputText(turn.Input))
	}
	if len(turn.Input.Parts) != 2 || turn.Input.Parts[1].Image == nil || turn.Input.Parts[1].Image.LocalPath == "" {
		t.Fatalf("delivered input = %+v, want image local path", turn.Input)
	}
	if _, err := os.Stat(turn.Input.Parts[1].Image.LocalPath); err != nil {
		t.Fatalf("stat delivered local image path: %v", err)
	}
}

func TestSendUserInputRejectsImagesWhenHarnessDoesNotSupportThem(t *testing.T) {
	harness := imageUnsupportedHarness{FakeHarness: NewFakeHarness(nil)}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "Images")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 2, 2))
	if err != nil {
		t.Fatalf("create image attachment: %v", err)
	}

	_, err = service.SendUserInput("workspace_api", conversation.ID, ChatInput{Parts: []ChatInputPart{
		{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: attachment.ID}},
	}})
	if err == nil || !strings.Contains(err.Error(), "does not support image input") {
		t.Fatalf("send image error = %v, want unsupported image input", err)
	}
	if messages, err := service.store.LoadMessages("workspace_api", conversation.ID); err != nil {
		t.Fatalf("load messages: %v", err)
	} else if len(messages) != 0 {
		t.Fatalf("persisted messages after rejected image input: %+v", messages)
	}
}

func TestSendUserInputRefreshesStaleImageCapabilitySettings(t *testing.T) {
	harness := imageUnsupportedHarness{FakeHarness: NewFakeHarness(nil)}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "Images")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	reasoning := ReasoningEffortMedium
	conversation.CodexEffectiveSettings = &ChatCodexEffectiveSettings{
		Model:                      "stale-vision",
		ModelDisplayName:           "Stale Vision",
		ReasoningEffort:            &reasoning,
		ReasoningEffortDisplayName: "Medium",
		SupportsImages:             true,
	}
	if err := service.store.SaveConversation(conversation); err != nil {
		t.Fatalf("save stale settings conversation: %v", err)
	}
	attachment, err := service.CreateImageAttachmentFromBytes("workspace_api", conversation.ID, "fixture.png", testPNG(t, 2, 2))
	if err != nil {
		t.Fatalf("create image attachment: %v", err)
	}

	_, err = service.SendUserInput("workspace_api", conversation.ID, ChatInput{Parts: []ChatInputPart{
		{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: attachment.ID}},
	}})
	if err == nil || !strings.Contains(err.Error(), "does not support image input") {
		t.Fatalf("send image error = %v, want refreshed unsupported image input", err)
	}
}

func TestCodexUserInputMapsImagePartsToLocalImageItems(t *testing.T) {
	detail := ImageDetailHigh
	items, err := codexUserInputForTurn(TurnRequest{
		Input: ChatInput{Parts: []ChatInputPart{
			{Type: MessagePartText, Text: &ChatTextInput{Text: "look here", Format: TextFormatPlain}},
			{Type: MessagePartImage, Image: &ChatImageInput{AttachmentID: "attachment_test", Detail: &detail, LocalPath: "/tmp/fixture.png"}},
		}},
	})
	if err != nil {
		t.Fatalf("codex input: %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %+v, want text and image", items)
	}
	if items[0]["type"] != "text" || items[0]["text"] != "look here" {
		t.Fatalf("text item = %+v, want look here", items[0])
	}
	if items[1]["type"] != "localImage" || items[1]["path"] != "/tmp/fixture.png" || items[1]["detail"] != "high" {
		t.Fatalf("image item = %+v, want localImage high detail", items[1])
	}
}

type imageUnsupportedHarness struct {
	*FakeHarness
}

func (harness imageUnsupportedHarness) ResolveCodexEffectiveSettings(context.Context, workspace.WorkspaceSummary, Conversation) (*ChatCodexEffectiveSettings, error) {
	reasoning := ReasoningEffortMedium
	return &ChatCodexEffectiveSettings{
		Model:                      "scripted-text-only",
		ModelDisplayName:           "Scripted Text Only",
		ReasoningEffort:            &reasoning,
		ReasoningEffortDisplayName: "Medium",
		SupportsImages:             false,
	}, nil
}

func waitForFakeTurnRequest(t *testing.T, harness *FakeHarness, runID string) TurnRequest {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		for _, request := range harness.TurnRequests() {
			if request.Run.ID == runID {
				return request
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for turn request %s", runID)
	return TurnRequest{}
}

func testPNG(t *testing.T, width int, height int) []byte {
	t.Helper()

	imageData := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			imageData.Set(x, y, color.RGBA{R: uint8(x * 40), G: uint8(y * 40), B: 120, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, imageData); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buffer.Bytes()
}

func testPNGHeader(t *testing.T, width int, height int) []byte {
	t.Helper()

	var buffer bytes.Buffer
	buffer.Write([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	writePNGChunk(t, &buffer, "IHDR", pngIHDRData(width, height))
	writePNGChunk(t, &buffer, "IEND", nil)
	return buffer.Bytes()
}

func pngIHDRData(width int, height int) []byte {
	data := make([]byte, 13)
	binary.BigEndian.PutUint32(data[0:4], uint32(width))
	binary.BigEndian.PutUint32(data[4:8], uint32(height))
	data[8] = 8
	data[9] = 2
	return data
}

func writePNGChunk(t *testing.T, buffer *bytes.Buffer, chunkType string, data []byte) {
	t.Helper()

	if len(chunkType) != 4 {
		t.Fatalf("png chunk type %q must be four bytes", chunkType)
	}
	_ = binary.Write(buffer, binary.BigEndian, uint32(len(data)))
	buffer.WriteString(chunkType)
	buffer.Write(data)
	crc := crc32.NewIEEE()
	_, _ = crc.Write([]byte(chunkType))
	_, _ = crc.Write(data)
	_ = binary.Write(buffer, binary.BigEndian, crc.Sum32())
}
