import logging

from setta.database.db_objs import DBE


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_read_deployment_manifest_optional_returns_none_for_invalid_manifest(
    tmp_path,
):
    dbe = DBE(tmp_path)
    (tmp_path / "manifest.json").write_text('{"version": 1}', encoding="utf-8")

    logger = logging.getLogger("setta.database.db_objs")
    handler = _CaptureHandler()
    original_level = logger.level
    logger.setLevel(logging.WARNING)
    logger.addHandler(handler)
    try:
        assert dbe.read_deployment_manifest_optional() is None
    finally:
        logger.removeHandler(handler)
        logger.setLevel(original_level)

    assert any(
        "Invalid deployment manifest" in record.getMessage()
        for record in handler.records
    )
