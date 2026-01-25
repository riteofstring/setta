from base64 import b64encode
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.types.chat_messages import (
    ChatFileAttachment,
    MessageImageUrlContent,
    MessageTextContent,
    UserChatMessage,
)
from setta.utils.chat_attachments import (
    build_attachment_content_blocks,
    build_attachments_prompt_text,
    collect_message_attachments,
    extract_attachment_text,
    extract_attachment_text_no_images,
    extract_attachment_urls,
)


def test_build_attachment_content_blocks_handles_images_text_and_binary() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir) / "setta_files")
        image_bytes = b"\x89PNG\r\n\x1a\n"
        image_path = dbe.path / "attachments" / "image.png"
        dbe.write(image_path, image_bytes, mode="wb")
        text_payload = "Hello\nWorld"
        text_path = dbe.path / "attachments" / "notes.txt"
        dbe.write(text_path, text_payload, mode="w")
        binary_bytes = b"\x00\x01\x02"
        binary_path = dbe.path / "attachments" / "blob.bin"
        dbe.write(binary_path, binary_bytes, mode="wb")

        attachments = [
            ChatFileAttachment(
                id=str(image_path),
                name="image.png",
                mimeType="image/png",
                size=len(image_bytes),
            ),
            ChatFileAttachment(
                id=str(text_path),
                name="notes.txt",
                mimeType="text/plain",
                size=len(text_payload),
            ),
            ChatFileAttachment(
                id=str(binary_path),
                name="blob.bin",
                mimeType="application/octet-stream",
                size=len(binary_bytes),
            ),
        ]

        blocks = build_attachment_content_blocks(dbe=dbe, attachments=attachments)

        assert len(blocks) == 3
        image_block = blocks[0]
        assert isinstance(image_block, MessageImageUrlContent)
        encoded = b64encode(image_bytes).decode("utf-8")
        assert image_block.image_url.url == f"data:image/png;base64,{encoded}"

        text_block = blocks[1]
        assert isinstance(text_block, MessageTextContent)
        assert text_block.text == f"[Attachment: notes.txt]\n{text_payload}"

        binary_block = blocks[2]
        assert isinstance(binary_block, MessageTextContent)
        assert "Content not inlined." in binary_block.text
        assert "Type: application/octet-stream" in binary_block.text


def test_build_attachments_prompt_text_skips_images_when_disabled() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir) / "setta_files")
        image_bytes = b"\x89PNG\r\n\x1a\n"
        image_path = dbe.path / "attachments" / "image.png"
        dbe.write(image_path, image_bytes, mode="wb")
        text_payload = "Hello\nWorld"
        text_path = dbe.path / "attachments" / "notes.txt"
        dbe.write(text_path, text_payload, mode="w")
        binary_bytes = b"\x00\x01\x02"
        binary_path = dbe.path / "attachments" / "blob.bin"
        dbe.write(binary_path, binary_bytes, mode="wb")

        attachments = [
            ChatFileAttachment(
                id=str(image_path),
                name="image.png",
                mimeType="image/png",
                size=len(image_bytes),
            ),
            ChatFileAttachment(
                id=str(text_path),
                name="notes.txt",
                mimeType="text/plain",
                size=len(text_payload),
            ),
            ChatFileAttachment(
                id=str(binary_path),
                name="blob.bin",
                mimeType="application/octet-stream",
                size=len(binary_bytes),
            ),
        ]

        text = build_attachments_prompt_text(
            dbe=dbe,
            attachments=attachments,
            include_images=False,
        )

        assert "[Attachment: image.png]" not in text
        assert "[Attachment: notes.txt]" in text
        assert "[Attachment: blob.bin]" in text


def test_collect_message_attachments_dedupes_by_id() -> None:
    attachment = ChatFileAttachment(
        id="artifacts/one.txt",
        name="one.txt",
        mimeType="text/plain",
        size=1,
    )
    duplicate = ChatFileAttachment(
        id="artifacts/one.txt",
        name="one-dupe.txt",
        mimeType="text/plain",
        size=1,
    )
    other = ChatFileAttachment(
        id="artifacts/two.txt",
        name="two.txt",
        mimeType="text/plain",
        size=1,
    )
    message_one = UserChatMessage(
        content=[MessageTextContent(text="First")],
        attachments=[attachment],
    )
    message_two = UserChatMessage(
        content=[MessageTextContent(text="Second")],
        attachments=[duplicate, other],
    )

    collected = collect_message_attachments([message_one, message_two])

    assert {item.id for item in collected} == {
        "artifacts/one.txt",
        "artifacts/two.txt",
    }
    first = next(item for item in collected if item.id == "artifacts/one.txt")
    assert first.name == "one.txt"


def test_extract_attachment_helpers_ignore_invalid_inputs() -> None:
    assert extract_attachment_urls(None) == {}
    assert extract_attachment_urls({"attachmentUrls": "nope"}) == {}
    assert extract_attachment_urls({"attachmentUrls": {1: "bad", "ok": 2}}) == {}
    assert extract_attachment_urls({"attachmentUrls": {"ok": "http://x"}}) == {
        "ok": "http://x"
    }

    assert extract_attachment_text(None) == ""
    assert extract_attachment_text({"attachmentText": 123}) == ""
    assert extract_attachment_text({"attachmentText": " hello "}) == "hello"

    assert extract_attachment_text_no_images(None) == ""
    assert extract_attachment_text_no_images({"attachmentTextNoImages": 123}) == ""
    assert (
        extract_attachment_text_no_images({"attachmentTextNoImages": " hi "}) == "hi"
    )
