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

    if not github_url.startswith(("https://github.com/", "git@github.com:")):
        print(f"Invalid GitHub URL: {github_url}")
        return False

    temp_dir = Path(tempfile.mkdtemp(prefix=f"setta-{project_id}-"))

    # Clone repository
    success = run_git_clone(github_url, temp_dir)
    if not success:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return False

    # Remove .git directory
    shutil.rmtree(temp_dir / ".git", ignore_errors=True)

    # Upload files
    result = upload_directory_to_storage(temp_dir, user_id, project_id)

    # Cleanup
    shutil.rmtree(temp_dir, ignore_errors=True)

    return result


def run_git_clone(github_url: str, target_dir: Path) -> bool:
    """Run git clone command."""
    try:
        result = subprocess.run(
            ["git", "clone", "--depth", "1", github_url, str(target_dir)],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            print(f"Git clone failed: {result.stderr}")
            return False

        return True

    except subprocess.TimeoutExpired:
        print("Git clone timed out")
        return False
    except Exception as e:
        print(f"Error running git: {e}")
        return False


def upload_directory_to_storage(source_dir: Path, user_id: str, project_id: str) -> bool:
    """Upload all files from a directory to R2 storage."""
    files = list(source_dir.rglob("*"))
    files = [f for f in files if f.is_file()]

    if not files:
        print("No files to upload")
        return False

    uploaded = 0

    for file_path in files:
        relative_path = file_path.relative_to(source_dir)

        if upload_single_file(file_path, relative_path, user_id, project_id):
            uploaded += 1

    print(f"Uploaded {uploaded}/{len(files)} files")
    return uploaded > 0


def upload_single_file(file_path: Path, relative_path: Path, user_id: str, project_id: str) -> bool:
    """Upload a single file to storage."""
    try:
        content = file_path.read_bytes()
    except Exception as e:
        print(f"Cannot read {relative_path}: {e}")
        return False

    return storage_service.save_file(user_id, project_id, str(relative_path), content)


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
