from asgiref.sync import async_to_sync
from channels.consumer import SyncConsumer
from django.conf import settings

# https://stackoverflow.com/questions/56913676/dynamic-updates-in-real-time-to-a-django-template


class NewUISyncConsumer(SyncConsumer):
    def websocket_connect(self, event):
        self.send({"type": "websocket.accept"})

        async_to_sync(self.channel_layer.group_add)(
            settings.NEWUI_WEBSOCKET_GROUP_NAME, self.channel_name
        )

    def websocket_disconnect(self, event):
        async_to_sync(self.channel_layer.group_discard)(
            settings.NEWUI_WEBSOCKET_GROUP_NAME, self.channel_name
        )

    def newUI(self, event):
        self.send(
            {
                "type": "websocket.send",
                "text": event["content"],
            }
        )
