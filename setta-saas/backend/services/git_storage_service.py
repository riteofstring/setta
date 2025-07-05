"""
Git repository management service for cloning repos to R2 storage.
"""

import shutil
import subprocess
import tempfile
from pathlib import Path

import services.storage_service as storage_service


def clone_github_to_storage(github_url: str, user_id: str, project_id: str) -> bool:
    """Clone a GitHub repository to R2 storage."""
    if not all([github_url, user_id, project_id]):
        print("Missing required parameters")
        return False

    # Normalize GitHub URL - accept various formats
    github_url = normalize_github_url(github_url)
    if not github_url:
        print("Invalid GitHub URL format")
        return False

    temp_dir = None
    try:
        # Create temporary directory
        temp_dir = Path(tempfile.mkdtemp(prefix=f"setta-{project_id}-"))
        print(f"Created temp directory: {temp_dir}")

        # Clone repository
        success = run_git_clone(github_url, temp_dir)
        if not success:
            return False

        # Find the cloned directory (git creates a subdirectory)
        cloned_dirs = [d for d in temp_dir.iterdir() if d.is_dir() and d.name != ".git"]
        if not cloned_dirs:
            print("No cloned directory found")
            return False

        repo_dir = cloned_dirs[0]
        print(f"Found cloned repo at: {repo_dir}")

        # Remove .git directory to save space
        git_dir = repo_dir / ".git"
        if git_dir.exists():
            shutil.rmtree(git_dir, ignore_errors=True)
            print("Removed .git directory")

        # Upload files from the repo directory
        result = upload_directory_to_storage(repo_dir, user_id, project_id)
        return result

    except Exception as e:
        print(f"Error in clone_github_to_storage: {e}")
        return False
    finally:
        # Cleanup
        if temp_dir and temp_dir.exists():
            shutil.rmtree(temp_dir, ignore_errors=True)
            print("Cleaned up temp directory")


def normalize_github_url(url: str) -> str:
    """Normalize GitHub URL to HTTPS format."""
    url = url.strip()

    # Handle common GitHub URL formats
    if url.startswith("git@github.com:"):
        # Convert SSH to HTTPS: git@github.com:user/repo.git -> https://github.com/user/repo.git
        url = url.replace("git@github.com:", "https://github.com/")
    elif url.startswith("github.com/"):
        # Add https:// if missing
        url = f"https://{url}"
    elif not url.startswith("https://github.com/"):
        # Invalid format
        return None

    # Ensure .git suffix
    if not url.endswith(".git"):
        url += ".git"

    print(f"Normalized GitHub URL: {url}")
    return url


def run_git_clone(github_url: str, target_dir: Path) -> bool:
    """Run git clone command."""
    try:
        # Clone into the target directory (not a subdirectory)
        cmd = ["git", "clone", "--depth", "1", github_url]

        print(f"Running command: {' '.join(cmd)}")
        print(f"In directory: {target_dir}")

        result = subprocess.run(
            cmd,
            cwd=str(target_dir),  # Run in target directory
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            print(f"Git clone failed with return code {result.returncode}")
            print(f"STDOUT: {result.stdout}")
            print(f"STDERR: {result.stderr}")

            # Check for common errors
            if "could not read Username" in result.stderr:
                print(
                    "ERROR: Repository appears to be private. Public repositories only are supported."
                )
            elif "Repository not found" in result.stderr:
                print("ERROR: Repository not found. Check the URL.")
            elif "fatal: unable to access" in result.stderr:
                print("ERROR: Network error accessing repository.")

            return False

        print("Git clone successful")
        return True

    except subprocess.TimeoutExpired:
        print("Git clone timed out after 5 minutes")
        return False
    except FileNotFoundError:
        print("ERROR: git command not found. Is git installed?")
        return False
    except Exception as e:
        print(f"Error running git clone: {type(e).__name__}: {e}")
        return False


def upload_directory_to_storage(source_dir: Path, user_id: str, project_id: str) -> bool:
    """Upload all files from a directory to R2 storage."""
    try:
        files = list(source_dir.rglob("*"))
        files = [f for f in files if f.is_file()]

        if not files:
            print("No files to upload")
            return False

        print(f"Found {len(files)} files to upload")
        uploaded = 0
        failed = []

        for file_path in files:
            relative_path = file_path.relative_to(source_dir)

            # Skip certain files
            if should_skip_file(relative_path):
                print(f"Skipping: {relative_path}")
                continue

            if upload_single_file(file_path, relative_path, user_id, project_id):
                uploaded += 1
                print(f"Uploaded: {relative_path}")
            else:
                failed.append(str(relative_path))

        print(f"Upload complete: {uploaded}/{len(files)} files uploaded successfully")
        if failed:
            print(f"Failed uploads: {', '.join(failed)}")

        return uploaded > 0

    except Exception as e:
        print(f"Error uploading directory: {e}")
        return False


def should_skip_file(file_path: Path) -> bool:
    """Check if file should be skipped during upload."""
    skip_patterns = [
        "__pycache__",
        ".pyc",
        ".pyo",
        ".DS_Store",
        "Thumbs.db",
        ".env.local",
        ".env.*.local",
        "node_modules",
        ".pytest_cache",
        ".coverage",
        "*.log",
    ]

    path_str = str(file_path)
    for pattern in skip_patterns:
        if pattern in path_str:
            return True

    return False


def upload_single_file(file_path: Path, relative_path: Path, user_id: str, project_id: str) -> bool:
    """Upload a single file to storage."""
    try:
        # Check file size
        file_size = file_path.stat().st_size
        if file_size > 50 * 1024 * 1024:  # 50MB limit
            print(f"File too large ({file_size} bytes): {relative_path}")
            return False

        content = file_path.read_bytes()
        return storage_service.save_file(user_id, project_id, str(relative_path), content)

    except Exception as e:
        print(f"Cannot read {relative_path}: {e}")
        return False


def sync_storage_to_directory(user_id: str, project_id: str, target_dir: str) -> bool:
    """Download all project files from R2 to a directory."""
    if not all([user_id, project_id, target_dir]):
        print("Missing required parameters")
        return False

    # Get file list
    files = storage_service.list_files(user_id, project_id)
    if not files:
        print("No files in storage")
        return False

    # Create target directory
    target_path = Path(target_dir)
    target_path.mkdir(parents=True, exist_ok=True)

    downloaded = 0

    for file_info in files:
        if download_single_file(file_info["path"], user_id, project_id, target_path):
            downloaded += 1

    print(f"Downloaded {downloaded}/{len(files)} files")
    return downloaded > 0


def download_single_file(file_path: str, user_id: str, project_id: str, target_dir: Path) -> bool:
    """Download a single file from storage."""
    content = storage_service.read_file(user_id, project_id, file_path)
    if content is None:
        return False

    full_path = target_dir / file_path
    full_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        full_path.write_bytes(content)
        return True
    except Exception as e:
        print(f"Cannot write {file_path}: {e}")
        return False
