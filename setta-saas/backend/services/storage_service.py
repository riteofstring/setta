"""
Simple Cloudflare R2 storage for user projects
"""

import os

import boto3
from botocore.exceptions import ClientError

# Get config from environment
ACCESS_KEY = os.getenv("STORAGE_ACCESS_KEY")
SECRET_KEY = os.getenv("STORAGE_SECRET_KEY")
BUCKET_NAME = os.getenv("STORAGE_BUCKET_NAME", "user-projects")
R2_ENDPOINT = os.getenv("R2_ENDPOINT")

# Initialize S3 client for R2
s3 = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=SECRET_KEY,
    region_name="auto",
)


def save_file(user_id: str, project_id: str, file_path: str, content: bytes) -> bool:
    """Save file to R2"""
    if not user_id or not project_id or not file_path:
        return False

    key = f"{user_id}/{project_id}/{file_path.strip('/')}"

    try:
        s3.put_object(Bucket=BUCKET_NAME, Key=key, Body=content)
        return True
    except Exception:
        return False


def read_file(user_id: str, project_id: str, file_path: str) -> bytes | None:
    """Read file from R2"""
    if not user_id or not project_id or not file_path:
        return None

    key = f"{user_id}/{project_id}/{file_path.strip('/')}"

    try:
        response = s3.get_object(Bucket=BUCKET_NAME, Key=key)
        return response["Body"].read()
    except ClientError:
        return None


def delete_file(user_id: str, project_id: str, file_path: str) -> bool:
    """Delete file from R2"""
    if not user_id or not project_id or not file_path:
        return False

    key = f"{user_id}/{project_id}/{file_path.strip('/')}"

    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=key)
        return True
    except Exception:
        return False


def delete_project(user_id: str, project_id: str) -> bool:
    """Delete all files in a project"""
    if not user_id or not project_id:
        return False

    prefix = f"{user_id}/{project_id}/"

    try:
        # Get all objects with prefix
        response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)

        if "Contents" not in response:
            return True  # Nothing to delete

        # Build delete list
        objects = [{"Key": obj["Key"]} for obj in response["Contents"]]

        # Delete all objects
        s3.delete_objects(Bucket=BUCKET_NAME, Delete={"Objects": objects})

        return True
    except Exception:
        return False


def list_files(user_id: str, project_id: str) -> list[dict]:
    """List all files in a project"""
    if not user_id or not project_id:
        return []

    prefix = f"{user_id}/{project_id}/"
    files = []

    try:
        response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=prefix)

        if "Contents" not in response:
            return []

        for obj in response["Contents"]:
            path = obj["Key"].replace(prefix, "", 1)  # Remove prefix once
            files.append(
                {"path": path, "size": obj["Size"], "modified": obj["LastModified"].isoformat()}
            )

        return files
    except Exception:
        return []


def get_download_url(user_id: str, project_id: str, file_path: str) -> str | None:
    """Get temporary download URL (1 hour)"""
    if not user_id or not project_id or not file_path:
        return None

    key = f"{user_id}/{project_id}/{file_path.strip('/')}"

    try:
        url = s3.generate_presigned_url(
            "get_object", Params={"Bucket": BUCKET_NAME, "Key": key}, ExpiresIn=3600
        )
        return url
    except Exception:
        return None


def get_upload_url(user_id: str, project_id: str, file_path: str) -> dict | None:
    """Get temporary upload URL for browser uploads (1 hour)"""
    if not user_id or not project_id or not file_path:
        return None

    key = f"{user_id}/{project_id}/{file_path.strip('/')}"

    try:
        response = s3.generate_presigned_post(Bucket=BUCKET_NAME, Key=key, ExpiresIn=3600)
        return {"url": response["url"], "fields": response["fields"]}
    except Exception:
        return None


def create_bucket():
    """Create bucket if it doesn't exist"""
    try:
        s3.head_bucket(Bucket=BUCKET_NAME)
        print(f"Bucket {BUCKET_NAME} exists")
    except ClientError:
        try:
            s3.create_bucket(Bucket=BUCKET_NAME)
            print(f"Created bucket {BUCKET_NAME}")
        except Exception as e:
            print(f"Error creating bucket: {e}")
