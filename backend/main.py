from __future__ import annotations
import json
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, Session

DB = Path(__file__).resolve().parent / 'professional_state.db'
engine = create_engine(f'sqlite:///{DB}', connect_args={'check_same_thread': False})

class Base(DeclarativeBase):
    pass

class ProfileRecord(Base):
    __tablename__ = 'profiles'
    user_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    data: Mapped[str] = mapped_column(Text, nullable=False)

class Education(BaseModel):
    institution: str = ''
    major: str = ''

class Contribution(BaseModel):
    title: str = Field(min_length=1)
    type: Literal['project', 'coursework', 'professional', 'other'] = 'project'
    description: str = ''
    verificationStatus: Literal['self_reported', 'verified'] = 'self_reported'

class ProfessionalState(BaseModel):
    userId: str = 'demo-user'
    name: str = 'Alex Morgan'
    headline: str = 'Computer Science Student | Aspiring Software Engineer'
    bio: str = 'Building projects, developing technical skills, and looking for opportunities to collaborate.'
    education: Education = Field(default_factory=Education)
    position: str = 'Student'
    skills: list[str] = Field(default_factory=list)
    interests: list[str] = Field(default_factory=list)
    featuredContributions: list[Contribution] = Field(default_factory=list)
    growthAreas: list[str] = Field(default_factory=list)

SAMPLE = ProfessionalState(
    education=Education(institution='Arizona State University', major='Computer Science'),
    skills=['Python', 'JavaScript', 'Team Collaboration'],
    interests=['Software Engineering', 'Artificial Intelligence'],
    growthAreas=['Industry Experience', 'System Design'],
    featuredContributions=[Contribution(title='Software Development Project', description='Built a collaborative application.')],
)
Base.metadata.create_all(engine)

app = FastAPI(title='Impact++ Professional State API', version='0.1.0')
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'], allow_credentials=False, allow_methods=['GET', 'PUT'], allow_headers=['Content-Type'])

@app.get('/api/v1/health')
def health():
    return {'status': 'ok'}

@app.get('/api/v1/profiles/demo-user', response_model=ProfessionalState)
def get_profile():
    with Session(engine) as session:
        record = session.get(ProfileRecord, 'demo-user')
        return ProfessionalState.model_validate_json(record.data) if record else SAMPLE

@app.put('/api/v1/profiles/demo-user', response_model=ProfessionalState)
def save_profile(profile: ProfessionalState):
    if profile.userId != 'demo-user':
        raise HTTPException(400, 'Only demo-user is supported in this proof of concept')
    with Session(engine) as session:
        session.merge(ProfileRecord(user_id='demo-user', data=profile.model_dump_json()))
        session.commit()
    return profile

@app.get('/api/v1/profiles/demo-user/state', response_model=ProfessionalState)
def get_professional_state():
    return get_profile()
