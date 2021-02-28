import json

import channels.layers
from asgiref.sync import async_to_sync
from django.conf import settings


def broadcast_newUI(newUI):
    channel_layer = channels.layers.get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        settings.NEWUI_WEBSOCKET_GROUP_NAME,
        {
            "type": "newUI",
            "content": json.dumps(newUI),
        },
    )
