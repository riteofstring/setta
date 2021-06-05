import graphene
from graphene_django import DjangoObjectType

from .models import Module, Object


class ModuleType(DjangoObjectType):
    class Meta:
        model = Module
        fields = ("id", "name", "folder", "originCollection")


class ObjectType(DjangoObjectType):
    class Meta:
        model = Object
        fields = ("id", "name", "belongsTo")


class Query(graphene.ObjectType):
    all_objects = graphene.List(ObjectType)
    module_by_name = graphene.Field(ModuleType, name=graphene.String(required=True))

    def resolve_all_objects(root, info):
        # We can easily optimize query count in the resolve method
        return Object.objects.select_related("belongsTo").all()

    def resolve_module_by_name(root, info, name):
        try:
            return Module.objects.get(name=name)
        except Module.DoesNotExist:
            return None


schema = graphene.Schema(query=Query)
