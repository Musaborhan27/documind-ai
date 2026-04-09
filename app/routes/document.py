from __future__ import annotations

import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_user, get_db
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.user import User
from app.services.document_service import (
    build_insights_for_document,
    get_file_size,
    process_document,
    save_upload_file,
    serialize_document,
    serialize_document_detail,
    validate_upload_file,
)

router = APIRouter(prefix="/documents", tags=["Documents"])


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


@router.get("/")
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    documents = (
        db.query(Document)
        .filter(Document.owner_id == current_user.id)
        .order_by(Document.id.desc())
        .all()
    )
    return [serialize_document(document, db=db) for document in documents]


@router.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    validate_upload_file(file)

    file_size = get_file_size(file)
    if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES} bytes.",
        )

    stored_filename, saved_path = save_upload_file(file)

    document = Document(
        filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        file_path=saved_path,
        content_type=file.content_type,
        extracted_text="",
        status="processing",
        error_message=None,
        owner_id=current_user.id,
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    process_document(db, document)
    db.refresh(document)

    return {
        "message": "Document uploaded and processed successfully."
        if document.status == "ready"
        else "Document uploaded, but processing failed.",
        "document": serialize_document_detail(document, db=db),
    }


@router.get("/{document_id}")
def get_document_detail(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, document_id, current_user.id)
    return serialize_document_detail(document, db=db)


@router.get("/{document_id}/insights")
def get_document_insights(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, document_id, current_user.id)

    if document.status != "ready":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is not ready for insights.",
        )

    return build_insights_for_document(document)


@router.post("/{document_id}/reprocess")
def reprocess_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, document_id, current_user.id)
    process_document(db, document)
    db.refresh(document)

    return {
        "message": "Document reprocessed successfully."
        if document.status == "ready"
        else "Document reprocessed, but processing failed.",
        "document_id": document.id,
        "status": document.status,
        "error_message": document.error_message,
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    document = get_owned_document_or_404(db, document_id, current_user.id)

    file_path = document.file_path

    db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
    db.delete(document)
    db.commit()

    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    return {
        "message": "Document deleted successfully.",
        "document_id": document_id,
    }