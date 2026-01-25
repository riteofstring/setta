import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.chat_toolkit.managed.sanitization import sanitize_tool_arguments
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.id import ID


class ManagedSanitizationTests(unittest.TestCase):
    def test_sanitizes_known_canonical_ids(self) -> None:
        with TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            temporary_to_canonical, canonical_to_temporary = dbe.read_temporary_id_map()
            canonical_id = ID("section-1")
            temporary_id = convert_canonical_ids_to_temporary(
                canonical_id,
                canonical_to_temporary,
                temporary_to_canonical,
            )
            dbe.write_temporary_id_map(canonical_to_temporary)

            arguments = {"sectionId": canonical_id}
            sanitized = sanitize_tool_arguments(dbe, arguments)

            self.assertEqual(sanitized["sectionId"], temporary_id)


if __name__ == "__main__":
    unittest.main()
