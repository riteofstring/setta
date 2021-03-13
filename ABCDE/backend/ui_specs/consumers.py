import json

from asgiref.sync import async_to_sync
from channels.consumer import SyncConsumer
from django.conf import settings

# https://stackoverflow.com/questions/56913676/dynamic-updates-in-real-time-to-a-django-template


class CLISyncConsumer(SyncConsumer):
    def websocket_connect(self, event):
        self.send({"type": "websocket.accept"})

        print("websocket_connect")
        # print(self.scope)

        async_to_sync(self.channel_layer.group_add)(
            settings.CLI_WEBSOCKET_GROUP_NAME, self.channel_name
        )

    def websocket_disconnect(self, event):
        async_to_sync(self.channel_layer.group_discard)(
            settings.CLI_WEBSOCKET_GROUP_NAME, self.channel_name
        )

    def websocket_receive(self, event):

        print("websocket_receive")
        print(event)

        async_to_sync(self.channel_layer.group_send)(
            settings.CLI_WEBSOCKET_GROUP_NAME,
            {
                "type": "cli",
                "content": event["text"],
            },
        )

    def cli(self, event):
        self.send(
            {
                "type": "websocket.send",
                "text": event["content"],
            }
        )


# class NewGeneratedCodeSyncConsumer(SyncConsumer):
#     def websocket_connect(self, event):
#         self.send({"type": "websocket.accept"})

#         async_to_sync(self.channel_layer.group_add)(
#             settings.NEWGENERATEDCODE_WEBSOCKET_GROUP_NAME, self.channel_name
#         )

#     def websocket_disconnect(self, event):
#         async_to_sync(self.channel_layer.group_discard)(
#             settings.NEWGENERATEDCODE_WEBSOCKET_GROUP_NAME, self.channel_name
#         )

#     def newGeneratedCode(self, event):
#         self.send(
#             {
#                 "type": "websocket.send",
#                 "text": event["content"],
#             }
#         )
