package frontendbindings

import "setta/internal/gitread"

type GitDiffMode gitread.DiffMode

const (
	GitDiffModeUnstaged GitDiffMode = GitDiffMode(gitread.DiffModeUnstaged)
	GitDiffModeStaged   GitDiffMode = GitDiffMode(gitread.DiffModeStaged)
)

type GitRepoInfo gitread.RepoInfo

type GitStatusEntry gitread.StatusEntry

type GitWorktreeEntry gitread.GitWorktreeEntry

type GetGitStatusResponse gitread.StatusResponse

type GetGitDiffRequestInput gitread.DiffRequest

type GetGitDiffResponse gitread.DiffResponse

type GitCommit gitread.Commit

type GetGitLogRequestInput gitread.LogRequest

type GetGitLogResponse gitread.LogResponse

type GitCommitChangedFile gitread.CommitChangedFile

type GetGitCommitDetailsRequestInput gitread.CommitDetailsRequest

type GetGitCommitDetailsResponse gitread.CommitDetailsResponse

type GetGitCommitFileDiffRequestInput gitread.CommitFileDiffRequest

type GetGitCommitFileDiffResponse gitread.CommitFileDiffResponse
