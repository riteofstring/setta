import graphene
from django.db.models import F
from graphene_django import DjangoObjectType

from . import utils
from .models import (
    UI,
    Folder,
    Object,
    ParameterValue,
    ParameterValueCollection,
    Section,
    SectionPositions,
    SectionToUI,
    UIToFolder,
    UIType,
)


class UITypeGQL(DjangoObjectType):
    class Meta:
        model = UIType
        fields = ("value",)


class ParameterValueGQL(DjangoObjectType):
    class Meta:
        model = ParameterValue
        fields = ("value", "ui_type")


class ParameterValueCollectionGQL(DjangoObjectType):
    class Meta:
        model = ParameterValueCollection
        fields = ("id", "name")

    values = graphene.List(ParameterValueGQL)

    def resolve_values(self, info):
        return ParameterValue.objects.filter(collection=self.id)


class ObjectGQL(DjangoObjectType):
    class Meta:
        model = Object
        fields = ("name",)


class SectionPositionsGQL(DjangoObjectType):
    class Meta:
        model = SectionPositions
        fields = ("position",)


class SectionGQL(DjangoObjectType):
    class Meta:
        model = Section
        fields = ("id", "name", "variable_name", "selected_object", "entered_values")

    position = graphene.Field(SectionPositionsGQL, ui_id=graphene.Int(required=False))

    def resolve_position(self, info, ui_id):
        if ui_id is None:
            ui_id = info.context.ui_id
        return SectionPositions.objects.get(section=self.id, ui=ui_id)


class UIToFolderGQL(DjangoObjectType):
    class Meta:
        model = UIToFolder
        fields = ("entity", "parent")


class UIGQL(DjangoObjectType):
    class Meta:
        model = UI
        fields = ("id", "name")

    sections = graphene.List(SectionGQL)

    def resolve_sections(self, info):
        info.context.ui_id = self.id
        return Section.objects.filter(
            pk__in=SectionToUI.objects.filter(parent__pk=self.id).values("entity")
        )


# class ModuleCollectionType(DjangoObjectType):
#     class Meta:
#         model = ModuleCollection
#         fields = ("name",)


# class ParameterCollectionType(DjangoObjectType):
#     class Meta:
#         model = ParameterCollection
#         fields = ("name",)


# class ObjectType(DjangoObjectType):
#     class Meta:
#         model = Object
#         fields = ("name",)


# class ModuleType(DjangoObjectType):
#     class Meta:
#         model = Module
#         fields = ("name",)

#     objects = graphene.List(ObjectType)

#     def resolve_objects(self, info):
#         return Object.objects.filter(belongsTo=self.name)


class FolderGQL(DjangoObjectType):
    class Meta:
        model = Folder
        fields = ("id", "name")

    uis = graphene.List(UIGQL)
    # module_collections = graphene.List(ModuleCollectionType)
    # parameter_collections = graphene.List(ParameterCollectionType)
    # modules = graphene.List(ModuleType)

    def resolve_uis(self, info):
        return UI.objects.filter(
            pk__in=UIToFolder.objects.filter(parent__pk=self.id).values("entity")
        )

    # def resolve_module_collections(self, info):
    #     return ModuleCollection.objects.filter(folder__name=self.name)

    # def resolve_section_collections(self, info):
    #     return SectionCollection.objects.filter(folder__name=self.name)

    # def resolve_parameter_collections(self, info):
    #     return ParameterCollection.objects.filter(folder__name=self.name)

    # def resolve_modules(self, info):
    #     return Module.objects.filter(folder__name=self.name)


class Query(graphene.ObjectType):
    all_folders = graphene.List(FolderGQL)
    full_ui = graphene.Field(UIGQL, name=graphene.String(required=True))

    def resolve_all_folders(root, info):
        return Folder.objects.filter(owner=info.context.user)

    def resolve_full_ui(root, info, name):
        return UI.objects.get(owner=info.context.user, name=name)


schema = graphene.Schema(query=Query)

# class ModuleInput(graphene.InputObjectType):
#     name = graphene.String(required=True)


# class ModuleCollectionInput(graphene.InputObjectType):
#     name = graphene.String(required=True)
#     modules = graphene.List(ModuleInput, required=True)


# class SectionInput(graphene.InputObjectType):
#     name = graphene.String(required=True)


# class SectionCollectionInput(graphene.InputObjectType):
#     name = graphene.String(required=True)
#     sections = graphene.List(SectionInput, required=True)


# class UIInput(graphene.InputObjectType):
#     name = graphene.String(required=True)
#     section_collection = SectionCollectionInput(required=True)
#     module_collection = ModuleCollectionInput(required=True)


# class FolderMutation(graphene.Mutation):
#     class Arguments:
#         # The input arguments for this mutation
#         folder_name = graphene.String()
#         ui = UIInput()

#     # The class attributes define the response of the mutation
#     folder = graphene.Field(FolderType)

#     @classmethod
#     def mutate(cls, root, info, folder_name, ui):
#         folder, _ = utils.generic_create(
#             Folder, {"owner": info.context.user, "name": folder_name}
#         )
#         ui, _ = utils.generic_create(UI, {"folder": folder, "name": ui["name"]})


#         # Notice we return an instance of this mutation
#         output = FolderMutation(folder=folder)
#         return output


# class Mutation(graphene.ObjectType):
#     update_folder = FolderMutation.Field()


# schema = graphene.Schema(query=Query, mutation=Mutation)
