"""
ASGI config for abcde project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/3.1/howto/deployment/asgi/
"""

import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "abcde.settings")

from django.conf import settings
from django.urls import path
from ui_specs import consumers

# https://stackoverflow.com/questions/56913676/dynamic-updates-in-real-time-to-a-django-template

application = ProtocolTypeRouter(
    {
        "websocket": URLRouter(
            [
                path(
                    f"ws/{settings.NEWUI_WEBSOCKET_GROUP_NAME}/",
                    consumers.NewUISyncConsumer(),
                ),
            ]
        ),
    }
)
