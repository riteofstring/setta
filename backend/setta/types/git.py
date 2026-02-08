from typing import Literal

from pydantic import BaseModel, Field

GitDiffMode = Literal["unstaged", "staged"]

GitStatusKind = Literal["conflict", "staged", "unstaged", "untracked"]


class GitRepoInfoResponse(BaseModel):
    isGitRepo: bool
    repoRoot: str | None = None
    headBranch: str | None = None
    headCommit: str | None = None


class GitStatusEntry(BaseModel):
    path: str
    oldPath: str | None = None
    indexStatus: str
    worktreeStatus: str
    kind: GitStatusKind


class GetGitStatusResponse(BaseModel):
    repo: GitRepoInfoResponse
    entries: list[GitStatusEntry]
    isTruncated: bool = False


class GetGitDiffRequest(BaseModel):
    path: str
    mode: GitDiffMode
    oldPath: str | None = None


class GetGitDiffResponse(BaseModel):
    repoRoot: str
    path: str
    mode: GitDiffMode
    diff: str
    isTruncated: bool


class GitCommit(BaseModel):
    hash: str
    parents: list[str]
    authorName: str
    authorEmail: str
    authorTimeMs: int
    subject: str
    decorations: list[str] = Field(default_factory=list)


class GetGitLogRequest(BaseModel):
    rev: str = "HEAD"
    allRefs: bool = False
    offset: int = 0
    pageSize: int = 250


class GetGitLogResponse(BaseModel):
    repoRoot: str
    headBranch: str | None
    commits: list[GitCommit]
    offset: int
    pageSize: int
    nextOffset: int | None
    hasMore: bool
    isCapped: bool


class GitCommitChangedFile(BaseModel):
    path: str
    oldPath: str | None = None
    status: str
    additions: int | None = None
    deletions: int | None = None


class GetGitCommitDetailsRequest(BaseModel):
    commitHash: str


class GetGitCommitDetailsResponse(BaseModel):
    repoRoot: str
    commitHash: str
    parents: list[str]
    authorName: str
    authorEmail: str
    authorTimeMs: int
    committerName: str
    committerEmail: str
    committerTimeMs: int
    subject: str
    body: str
    files: list[GitCommitChangedFile]
    isTruncated: bool


class GetGitCommitFileDiffRequest(BaseModel):
    commitHash: str
    path: str
    oldPath: str | None = None


class GetGitCommitFileDiffResponse(BaseModel):
    repoRoot: str
    commitHash: str
    path: str
    diff: str
    isTruncated: bool
