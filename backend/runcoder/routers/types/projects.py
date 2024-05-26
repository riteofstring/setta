from typing import List, Optional

from pydantic import BaseModel


class ProjectRequest(BaseModel):
    format: str
    projectId: Optional[str] = None


class ProjectSaveRequest(BaseModel):
    project: dict


class SaveAsNewProjectConfigRequest(BaseModel):
    project: dict
    newConfigName: str


class SaveAsExistingProjectConfigRequest(BaseModel):
    project: dict
    configName: str


class CreateProjectRequest(BaseModel):
    name: Optional[str] = None
    previewImgColor: str


class DeleteProjectsRequest(BaseModel):
    ids: List[str]


class SetProjectNameRequest(BaseModel):
    currProjectName: str
    newProjectName: str


class SetProjectConfigNameRequest(BaseModel):
    projectId: str
    currProjectConfigName: str
    newProjectConfigName: str
