from django.contrib.auth.models import User
from django.db import models


def get_base_model(name, constraint_name, parent_table=None):

    attrs = {}
    fields = ["name", "owner"]
    if parent_table is not None:
        fields += ["parent"]
        attrs["parent"] = models.ForeignKey(parent_table, on_delete=models.CASCADE)

    class Meta:
        constraints = [models.UniqueConstraint(fields=fields, name=constraint_name)]

    attrs["__module__"] = __name__
    attrs["Meta"] = Meta
    attrs["name"] = models.TextField()
    attrs["owner"] = models.ForeignKey(User, on_delete=models.CASCADE)
    return type(name, (models.Model,), attrs)


def get_base_relationship_model(
    name, table, constraint_name, parent_table=None, single_parent=False
):
    parent_table = table if parent_table is None else parent_table
    fields = ["entity"]
    if not single_parent:
        fields += ["parent"]

    class Meta:
        constraints = [models.UniqueConstraint(fields=fields, name=constraint_name)]

    attrs = {}
    attrs["__module__"] = __name__
    attrs["Meta"] = Meta
    attrs["entity"] = models.ForeignKey(table, on_delete=models.CASCADE)
    attrs["parent"] = models.ForeignKey(
        parent_table, on_delete=models.CASCADE, related_name="parent"
    )

    return type(name, (models.Model,), attrs)
