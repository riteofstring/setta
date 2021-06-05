import graphene
from django.db.models import F
from graphene_django import DjangoObjectType

from . import utils
from .models import UI, Folder, ModuleCollection


class UIType(DjangoObjectType):
    class Meta:
        model = UI
        fields = ("name",)


class ModuleCollectionType(DjangoObjectType):
    class Meta:
        model = ModuleCollection
        fields = ("name",)


class FolderType(DjangoObjectType):
    class Meta:
        model = Folder
        fields = ("name",)

    uis = graphene.List(UIType)
    module_collections = graphene.List(ModuleCollectionType)

    def resolve_uis(self, info):
        return UI.objects.filter(folder__name=self.name)

    def resolve_module_collections(self, info):
        return ModuleCollection.objects.filter(folder__name=self.name)


class Query(graphene.ObjectType):
    all_folders = graphene.List(FolderType)

    def resolve_all_folders(root, info):
        return Folder.objects.filter(owner=info.context.user)


# class ModuleMutation(graphene.Mutation):
#     class Arguments:
#         # The input arguments for this mutation
#         name = graphene.String(required=True)

#     # The class attributes define the response of the mutation
#     module = graphene.Field(ModuleType)

#     @classmethod
#     def mutate(cls, root, info, name):
#         module = Module.objects.get(name=name)
#         # question.text = text
#         # question.save()
#         # Notice we return an instance of this mutation
#         return ModuleMutation(module=module)


# class Mutation(graphene.ObjectType):
#     update_module = ModuleMutation.Field()


schema = graphene.Schema(query=Query)
