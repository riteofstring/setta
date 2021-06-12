from django.contrib.auth.models import User
from django.db import models

from .base_models import get_base_model, get_base_relationship_model

Folder = get_base_model("Folder", "folder_unique")
Tag = get_base_model("Tag", "tag_unique")


def get_base_folder_model(name, table, constraint_name):
    return get_base_relationship_model(
        name, table, constraint_name, single_parent=False, parent_table=Folder
    )


def get_base_tag_model(table, constraint_name):
    return get_base_relationship_model(
        name, table, constraint_name, single_parent=False, parent_table=Tag
    )
