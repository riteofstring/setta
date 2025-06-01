import socket
from typing import Dict, Optional

import httpx


class HTTPClient:
    """Reusable HTTP client with common functionality"""

    def __init__(
        self, headers: Optional[Dict[str, str]] = None, base_timeout: float = 30.0
    ):
        self.headers = headers or {}
        self.base_timeout = base_timeout

    def make_request(self, method: str, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make HTTP request with error handling"""
        try:
            timeout = kwargs.pop("timeout", self.base_timeout)

            with httpx.Client() as client:
                response = client.request(
                    method=method,
                    url=url,
                    headers={**self.headers, **kwargs.pop("headers", {})},
                    timeout=timeout,
                    **kwargs,
                )
                return response
        except Exception as e:
            print(f"Request failed: {type(e).__name__}: {e}")
            return None

    def get(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make GET request"""
        return self.make_request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make POST request"""
        return self.make_request("POST", url, **kwargs)

    def delete(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make DELETE request"""
        return self.make_request("DELETE", url, **kwargs)

    def put(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make PUT request"""
        return self.make_request("PUT", url, **kwargs)

    def patch(self, url: str, **kwargs) -> Optional[httpx.Response]:
        """Make PATCH request"""
        return self.make_request("PATCH", url, **kwargs)


def is_success(response: Optional[httpx.Response]) -> bool:
    """Check if response was successful"""
    return response is not None and 200 <= response.status_code < 300


def parse_json(response: Optional[httpx.Response]) -> Optional[dict]:
    """Parse JSON response"""
    if not response or not is_success(response):
        return None

    try:
        return response.json()
    except Exception as e:
        print(f"Failed to parse response: {e}")
        return None


def check_dns(hostname: str, timeout: int = 60) -> bool:
    """Check if hostname resolves to an IP"""
    for i in range(timeout // 3):
        try:
            ip = socket.gethostbyname(hostname)
            print(f"✓ DNS resolved {hostname} to {ip}")
            return True
        except socket.gaierror:
            if i % 4 == 0:  # Print every 12 seconds
                print(f"Waiting for DNS to resolve {hostname}...")
            import time

            time.sleep(3)

    print(f"✗ DNS did not resolve {hostname} after {timeout} seconds")
    return False
