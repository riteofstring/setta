from setta.websockets.msg_handlers.artifact import WMHArtifact
from setta.websockets.msg_handlers.base import BaseWebsocketMsgHandler
from setta.websockets.msg_handlers.cli import WMHCLI
from setta.websockets.msg_handlers.frontend import WMHFrontend
from setta.websockets.msg_handlers.mcp import WMHMCP
from setta.websockets.msg_handlers.python_logger import WMHPythonLogger
from setta.websockets.msg_handlers.python_script import WMHPythonScript
from setta.websockets.msg_handlers.terminals import WMHTerminals


class WebsocketMsgHandlers:
    def __init__(
        self,
        websocket_manager,
        lsp_writers,
        project_manager,
        script_metadata,
        dbq,
        specific_file_watcher,
    ):
        self.base = BaseWebsocketMsgHandler(websocket_manager)
        self.artifact = WMHArtifact(websocket_manager)
        self.terminals = WMHTerminals(websocket_manager)
        self.frontend = WMHFrontend(
            websocket_manager,
            lsp_writers,
            project_manager,
            script_metadata,
            specific_file_watcher,
        )
        self.cli = WMHCLI(websocket_manager)
        self.python_script = WMHPythonScript(
            websocket_manager, script_metadata, project_manager
        )
        self.python_logger = WMHPythonLogger(websocket_manager)
        self.mcp = WMHMCP(websocket_manager, dbq)
