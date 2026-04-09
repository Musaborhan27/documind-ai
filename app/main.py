from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from app.core.config import settings
from app.db.database import Base, engine
from app.routes.auth import router as auth_router
from app.routes.document import router as document_router
from app.routes.qa import router as qa_router
from app.routes.user import router as user_router

import app.models.document
import app.models.document_chunk
import app.models.question_log
import app.models.user

app = FastAPI(title="DocuMind AI")


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


app.include_router(auth_router)
app.include_router(user_router)
app.include_router(document_router)
app.include_router(qa_router)


@app.get("/")
def root():
    return {"message": "DocuMind AI backend is running"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/db-check")
def db_check():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"database": "connected"}
    except OperationalError as exc:
        return {"database": "error", "detail": str(exc)}