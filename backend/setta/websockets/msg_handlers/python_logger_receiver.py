from setta.websockets.msg_handlers.base import BaseWebsocketMsgReceiver


class WMHPythonLoggerReceiver(BaseWebsocketMsgReceiver):
    async def process_json_str(self, json_str, *_, **__):
        # TODO
        pass
