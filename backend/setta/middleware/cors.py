from fastapi.middleware.cors import CORSMiddleware

from setta.trusted_frontend_origins import is_trusted_frontend_origin


class SettaCORSMiddleware(CORSMiddleware):
    def is_allowed_origin(self, origin: str) -> bool:
        if super().is_allowed_origin(origin):
            return True
        return is_trusted_frontend_origin(origin)
