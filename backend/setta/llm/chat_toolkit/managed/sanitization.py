import copy
import json
from typing import Any

from setta.database.db_objs import DBE
from setta.mcp.utils import convert_existing_canonical_ids_to_temporary


def sanitize_tool_arguments(dbe: DBE, arguments: dict[str, Any]) -> dict[str, Any]:
    _, canonical_to_temporary = dbe.read_temporary_id_map()
    cloned = copy.deepcopy(arguments)
    converted = convert_existing_canonical_ids_to_temporary(
        cloned,
        canonical_to_temporary,
    )
    return json.loads(json.dumps(converted))
