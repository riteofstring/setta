package frontendbindings

type GitDiffMode string

const (
	GitDiffModeUnstaged GitDiffMode = "unstaged"
	GitDiffModeStaged   GitDiffMode = "staged"
)

type GitRepoInfo struct {
	IsGitRepo  bool    `json:"isGitRepo"`
	RepoRoot   *string `json:"repoRoot"`
	HeadBranch *string `json:"headBranch"`
	HeadCommit *string `json:"headCommit"`
}

type GitStatusEntry struct {
	Path           string  `json:"path"`
	OldPath        *string `json:"oldPath"`
	IndexStatus    string  `json:"indexStatus"`
	WorktreeStatus string  `json:"worktreeStatus"`
	Kind           string  `json:"kind"`
}

type GetGitStatusResponse struct {
	Repo        GitRepoInfo      `json:"repo"`
	Entries     []GitStatusEntry `json:"entries"`
	IsTruncated bool             `json:"isTruncated"`
}

type GetGitDiffRequestInput struct {
	Path    string      `json:"path"`
	OldPath *string     `json:"oldPath"`
	Mode    GitDiffMode `json:"mode"`
}

type GetGitDiffResponse struct {
	RepoRoot    string      `json:"repoRoot"`
	Path        string      `json:"path"`
	Mode        GitDiffMode `json:"mode"`
	Diff        string      `json:"diff"`
	IsTruncated bool        `json:"isTruncated"`
}

type GitCommit struct {
	Hash         string   `json:"hash"`
	Parents      []string `json:"parents"`
	AuthorName   string   `json:"authorName"`
	AuthorEmail  string   `json:"authorEmail"`
	AuthorTimeMs int64    `json:"authorTimeMs"`
	Subject      string   `json:"subject"`
	Decorations  []string `json:"decorations"`
}

type GetGitLogRequestInput struct {
	Rev      string `json:"rev"`
	AllRefs  bool   `json:"allRefs"`
	Offset   int    `json:"offset"`
	PageSize int    `json:"pageSize"`
}

type GetGitLogResponse struct {
	RepoRoot   string      `json:"repoRoot"`
	HeadBranch *string     `json:"headBranch"`
	Commits    []GitCommit `json:"commits"`
	Offset     int         `json:"offset"`
	PageSize   int         `json:"pageSize"`
	NextOffset *int        `json:"nextOffset"`
	HasMore    bool        `json:"hasMore"`
	IsCapped   bool        `json:"isCapped"`
}

type GitCommitChangedFile struct {
	Path      string  `json:"path"`
	OldPath   *string `json:"oldPath"`
	Status    string  `json:"status"`
	Additions *int    `json:"additions"`
	Deletions *int    `json:"deletions"`
}

type GetGitCommitDetailsRequestInput struct {
	CommitHash string `json:"commitHash"`
}

type GetGitCommitDetailsResponse struct {
	RepoRoot        string                 `json:"repoRoot"`
	CommitHash      string                 `json:"commitHash"`
	Parents         []string               `json:"parents"`
	AuthorName      string                 `json:"authorName"`
	AuthorEmail     string                 `json:"authorEmail"`
	AuthorTimeMs    int64                  `json:"authorTimeMs"`
	CommitterName   string                 `json:"committerName"`
	CommitterEmail  string                 `json:"committerEmail"`
	CommitterTimeMs int64                  `json:"committerTimeMs"`
	Subject         string                 `json:"subject"`
	Body            string                 `json:"body"`
	Files           []GitCommitChangedFile `json:"files"`
	IsTruncated     bool                   `json:"isTruncated"`
}

type GetGitCommitFileDiffRequestInput struct {
	CommitHash string  `json:"commitHash"`
	Path       string  `json:"path"`
	OldPath    *string `json:"oldPath"`
}

type GetGitCommitFileDiffResponse struct {
	RepoRoot    string `json:"repoRoot"`
	CommitHash  string `json:"commitHash"`
	Path        string `json:"path"`
	Diff        string `json:"diff"`
	IsTruncated bool   `json:"isTruncated"`
}
