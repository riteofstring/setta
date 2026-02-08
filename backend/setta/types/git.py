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


class GetGitDiffRequest(BaseModel):
    path: str
    mode: GitDiffMode


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
    maxCount: int = 2000
    allRefs: bool = False


class GetGitLogResponse(BaseModel):
    repoRoot: str
    headBranch: str | None
    commits: list[GitCommit]


class GetGitCommitDiffRequest(BaseModel):
    commitHash: str


class GetGitCommitDiffResponse(BaseModel):
    repoRoot: str
    commitHash: str
    diff: str
    isTruncated: bool
