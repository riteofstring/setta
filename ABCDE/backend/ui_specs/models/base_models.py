from django.contrib.auth.models import User
from django.db import models


def get_base_model(
    name,
    constraint_fields,
    parent_table=None,
    has_uuid=False,
    has_name=False,
    has_owner=False,
    has_value=False,
    additional_tables=None,
    additional_constraints=None,
):
    constraint_name = f"{name}_unique"
    attrs = {}
    if has_uuid:
        attrs["uuid"] = models.TextField()

    if has_name:
        attrs["name"] = models.TextField()

    if has_owner:
        attrs["owner"] = models.ForeignKey(User, on_delete=models.CASCADE)

    if parent_table is not None:
        attrs["parent"] = models.ForeignKey(parent_table, on_delete=models.CASCADE)

    if has_value:
        attrs["value"] = models.TextField(null=True)

    if additional_tables is not None:
        for field_name, t in additional_tables.items():
            attrs[field_name] = t

    if additional_constraints is None:
        additional_constraints = []

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=constraint_fields, name=constraint_name)
        ] + additional_constraints

    attrs["__module__"] = __name__
    attrs["Meta"] = Meta

    return type(name, (models.Model,), attrs)


def get_base_relationship_model(
    name, table, parent_table=None, single_parent=False, child_table=None
):
    constraint_name = f"{name}_unique"
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
        parent_table, on_delete=models.CASCADE, related_name=f"{name}_parent"
    )
    if child_table is not None:
        attrs["child"] = models.ForeignKey(
            child_table,
            on_delete=models.SET_NULL,
            related_name=f"{name}_child",
            null=True,
        )

    return type(name, (models.Model,), attrs)
