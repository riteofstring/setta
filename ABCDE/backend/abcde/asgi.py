"""
ASGI config for abcde project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.1/howto/deployment/asgi/
"""

import os

from accounts.websocket_authentication import TokenAuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "abcde.settings")

from django.conf import settings
from django.urls import path
from ui_specs import consumers

# https://stackoverflow.com/questions/56913676/dynamic-updates-in-real-time-to-a-django-template

application = ProtocolTypeRouter(
    {
        "websocket": TokenAuthMiddlewareStack(
            URLRouter(
                [
                    path(
                        f"ws/{settings.CLI_WEBSOCKET_GROUP_NAME}/",
                        consumers.CLISyncConsumer().as_asgi(),
                    ),
                    # path(
                    #     f"ws/{settings.NEWGENERATEDCODE_WEBSOCKET_GROUP_NAME}/",
                    #     consumers.NewGeneratedCodeSyncConsumer(),
                    # ),
                ]
            )
        ),
    }
)
