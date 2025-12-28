import unittest

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from setta.auth.cookies import set_auth_cookie


class AuthCookieTests(unittest.TestCase):
    def _build_app(self) -> FastAPI:
        app = FastAPI()

        @app.get("/set-cookie")
        async def set_cookie(request: Request):
            response = JSONResponse({"ok": True})
            set_auth_cookie(response, "token-value", request=request)
            return response

        return app

    def test_set_auth_cookie_secure_https(self) -> None:
        app = self._build_app()
        client = TestClient(app, base_url="https://testserver")
        self.addCleanup(client.close)

        response = client.get("/set-cookie")

        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.get("set-cookie", "")
        self.assertIn("Secure", cookie_header)

    def test_set_auth_cookie_secure_http(self) -> None:
        app = self._build_app()
        client = TestClient(app, base_url="http://testserver")
        self.addCleanup(client.close)

        response = client.get("/set-cookie")

        self.assertEqual(response.status_code, 200)
        cookie_header = response.headers.get("set-cookie", "")
        self.assertNotIn("Secure", cookie_header)


if __name__ == "__main__":
    unittest.main()
