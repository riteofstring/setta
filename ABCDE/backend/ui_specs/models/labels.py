from django.contrib.auth.models import User
from django.db import models

from .base_models import get_base_model, get_base_relationship_model

Folder = get_base_model("Folder", ["name", "owner"], has_name=True, has_owner=True)
Tag = get_base_model("Tag", ["name", "owner"], has_name=True, has_owner=True)


def get_base_folder_model(name, table):
    return get_base_relationship_model(
        name, table, single_parent=False, parent_table=Folder
    )


def get_base_tag_model(name, table):
    return get_base_relationship_model(
        name, table, single_parent=False, parent_table=Tag
    )
