from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.question_log import QuestionLog
from app.models.user import User
from app.services.retrieval_service import answer_question_from_document

router = APIRouter(prefix="/qa", tags=["Q&A"])


class AskQuestionRequest(BaseModel):
    document_id: int
    question: str = Field(min_length=2, max_length=2000)


def get_owned_document_or_404(db: Session, document_id: int, user_id: int) -> Document:
    document = (
        db.query(Document)
        .filter(Document.id == document_id, Document.owner_id == user_id)
        .first()
    )
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return document


@router.post("/ask")
def ask_question(
    payload: AskQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, payload.document_id, current_user.id)

    if document.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is not ready for question answering.",
        )

    actual_chunk_count = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document.id)
        .count()
    )

    if actual_chunk_count <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document has no indexed chunks for retrieval.",
        )

    result = answer_question_from_document(
        db=db,
        document_id=document.id,
        question=payload.question.strip(),
    )

    log = QuestionLog(
        document_id=document.id,
        user_id=current_user.id,
        question=payload.question.strip(),
        answer=result["answer"],
        evidence=result["evidence"],
        retrieval_mode=result["retrieval_mode"],
        used_model=result["used_model"],
        used_fallback="true" if result["used_fallback"] else "false",
    )

    db.add(log)
    db.commit()
    db.refresh(log)

    return {
        "id": log.id,
        "document_id": document.id,
        "filename": document.filename,
        "question": payload.question.strip(),
        "answer": result["answer"],
        "evidence": result["evidence"],
        "sources": result["sources"],
        "used_model": result["used_model"],
        "used_fallback": result["used_fallback"],
        "retrieval_mode": result["retrieval_mode"],
        "created_at": log.created_at.isoformat() if log.created_at else None,
    }


@router.get("/history/{document_id}")
def get_question_history(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, document_id, current_user.id)

    history = (
        db.query(QuestionLog)
        .filter(QuestionLog.document_id == document.id)
        .order_by(QuestionLog.id.desc())
        .all()
    )

    return {
        "document_id": document.id,
        "filename": document.filename,
        "count": len(history),
        "history": [
            {
                "id": item.id,
                "question": item.question,
                "answer": item.answer,
                "retrieval_mode": item.retrieval_mode or "unknown",
                "used_model": item.used_model,
                "used_fallback": str(item.used_fallback).lower() == "true",
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in history
        ],
    }