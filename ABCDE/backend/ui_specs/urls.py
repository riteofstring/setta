from rest_framework import routers
from .api import UISpecsAPIView, SavedUIsAPIView
from django.conf.urls import url
from django.urls import path, include

urlpatterns = [
    path("api/ui_specs", UISpecsAPIView.as_view()),
    path("api/saved_uis", SavedUIsAPIView.as_view()),
]
