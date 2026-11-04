from pydantic import BaseModel, EmailStr, Field
from typing import Literal

class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CareerIn(BaseModel):
    career_id: str

class EvidenceIn(BaseModel):
    move_id: str
    skill_id: str
    move_type: str
    difficulty: Literal["easy", "moderate", "hard"] = "moderate"
    artifact_type: Literal["summary", "link", "file"]
    artifact_url: str | None = None
    summary: str = Field(min_length=20, max_length=12000)
    revision_of: int | None = None
