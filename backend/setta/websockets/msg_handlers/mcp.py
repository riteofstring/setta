from pydantic import TypeAdapter

from setta.database.db.chats.load import load_uuid_mapping_for_llm
from setta.database.db.chats.save import save_uuid_mapping_for_llm
from setta.database.db_objs import DBE
from setta.mcp.utils import (
    IDDoesNotExist,
    SettaMCPToolError,
    replace_ids_with_uuids,
    replace_uuids_with_ids,
)
from setta.utils.constants import C
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.websocket_manager import WebsocketManager


class WMHMCP(BaseWebsocketMsgHandler):
    def __init__(self, websocket_manager: WebsocketManager):
        self.websocket_manager = websocket_manager

    async def use_frontend_tool(self, fn_name, return_type, args=None):
        # Generate request ID
        request_id = self.websocket_manager.create_pending_request()

        if args is None:
            args = {}
        # Send request to frontend with the ID
        await self.websocket_manager.broadcast(
            {"id": request_id, "fnName": fn_name, "args": args},
            C.WS_MCP_TOOL_USE,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )

        # Wait for response
        result = await self.websocket_manager.wait_for_pending_request(request_id)
        if isinstance(result, dict) and C.SETTA_MCP_TOOL_ERROR in result:
            raise SettaMCPToolError(result[C.SETTA_MCP_TOOL_ERROR])
        result = TypeAdapter(return_type).validate_python(result)
        result = replace_uuids_with_ids(result, self.uuid_to_id, self.id_to_uuid)
        with self.dbe.session as db:
            save_uuid_mapping_for_llm(db, self.uuid_to_id)
            await self.send_uuid_mapping()
        return result

    async def send_uuid_mapping(self):
        await self.websocket_manager.broadcast(
            self.id_to_uuid,
            C.WS_UUID_MAPPING_FOR_LLM,
            connectionType=C.WEBSOCKET_CONNECTION_TYPE_FRONTEND,
        )
