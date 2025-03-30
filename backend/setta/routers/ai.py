from fastapi import APIRouter
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from setta.utils.constants import C
from litellm import completion

load_dotenv()
router = APIRouter()


# class ApiKeyRequest(BaseModel):
#     key: str


class GetLLMResponseRequest(BaseModel):
    messages: list
    model: str


# @router.get("api/keys/status")
# def get_api_key_status():
#     return {
#         "anthropic": bool(os.getenv("ANTHROPIC_API_KEY")),
#         "openai": bool(os.getenv("OPENAI_API_KEY")),
#     }


# @router.post("api/keys/{provider}")
# def save_api_key(provider: str, request: ApiKeyRequest):
#     if provider not in ["anthropic", "openai"]:
#         raise HTTPException(status_code=400, detail="Invalid provider")

#     env_var = f"{provider.upper()}_API_KEY"
#     try:
#         env_file = find_dotenv()
#         set_key(env_file, env_var, request.key)
#         os.environ[env_var] = request.key  # Update current environment
#         return {"success": True}
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


# @router.delete("/api/keys/{provider}")
# def delete_api_key(provider: str):
#     return save_api_key(
#         provider, ApiKeyRequest(key="")
#     )  # Reuse save function with empty key


@router.post(C.ROUTE_GET_LLM_RESPONSE)
def route_get_llm_response(x: GetLLMResponseRequest):
    return completion(model=x.model, messages=x.messages)
