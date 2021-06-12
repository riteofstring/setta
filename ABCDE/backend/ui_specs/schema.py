import graphene
from django.db.models import F
from graphene_django import DjangoObjectType

from . import utils
from .models import (
    UI,
    Folder,
    Module,
    ModuleCollection,
    Object,
    ParameterCollection,
    SectionCollection,
)


class UIType(DjangoObjectType):
    class Meta:
        model = UI
        fields = ("name",)


class SectionCollectionType(DjangoObjectType):
    class Meta:
        model = SectionCollection
        fields = ("name",)


class ModuleCollectionType(DjangoObjectType):
    class Meta:
        model = ModuleCollection
        fields = ("name",)


class ParameterCollectionType(DjangoObjectType):
    class Meta:
        model = ParameterCollection
        fields = ("name",)


class ObjectType(DjangoObjectType):
    class Meta:
        model = Object
        fields = ("name",)


class ModuleType(DjangoObjectType):
    class Meta:
        model = Module
        fields = ("name",)

    objects = graphene.List(ObjectType)

    def resolve_objects(self, info):
        return Object.objects.filter(belongsTo=self.name)


class FolderType(DjangoObjectType):
    class Meta:
        model = Folder
        fields = ("name",)

    uis = graphene.List(UIType)
    section_collections = graphene.List(SectionCollectionType)
    module_collections = graphene.List(ModuleCollectionType)
    parameter_collections = graphene.List(ParameterCollectionType)
    modules = graphene.List(ModuleType)

    def resolve_uis(self, info):
        return UI.objects.filter(folder__name=self.name)

    def resolve_module_collections(self, info):
        return ModuleCollection.objects.filter(folder__name=self.name)

    def resolve_section_collections(self, info):
        return SectionCollection.objects.filter(folder__name=self.name)

    def resolve_parameter_collections(self, info):
        return ParameterCollection.objects.filter(folder__name=self.name)

    def resolve_modules(self, info):
        return Module.objects.filter(folder__name=self.name)


class Query(graphene.ObjectType):
    all_folders = graphene.List(FolderType)

    def resolve_all_folders(root, info):
        return Folder.objects.filter(owner=info.context.user)


class ModuleInput(graphene.InputObjectType):
    name = graphene.String(required=True)


class ModuleCollectionInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    modules = graphene.List(ModuleInput, required=True)


class SectionInput(graphene.InputObjectType):
    name = graphene.String(required=True)


class SectionCollectionInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    sections = graphene.List(SectionInput, required=True)


class UIInput(graphene.InputObjectType):
    name = graphene.String(required=True)
    section_collection = SectionCollectionInput(required=True)
    module_collection = ModuleCollectionInput(required=True)


class FolderMutation(graphene.Mutation):
    class Arguments:
        # The input arguments for this mutation
        folder_name = graphene.String()
        ui = UIInput()

    # The class attributes define the response of the mutation
    folder = graphene.Field(FolderType)

    @classmethod
    def mutate(cls, root, info, folder_name, ui):
        print(ui)
        folder, _ = utils.generic_create(
            Folder, {"owner": info.context.user, "name": folder_name}
        )
        # question.text = text
        # question.save()
        # Notice we return an instance of this mutation
        output = FolderMutation(folder=folder)
        print("output", output)
        return output


class Mutation(graphene.ObjectType):
    update_folder = FolderMutation.Field()


schema = graphene.Schema(query=Query, mutation=Mutation)
