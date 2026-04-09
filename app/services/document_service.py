from __future__ import annotations

import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.insight_service import build_document_insights
from app.services.openai_client import get_embedding

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".docx"}


def ensure_upload_dir() -> None:
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def get_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def validate_upload_file(file: UploadFile) -> None:
    extension = get_extension(file.filename or "")
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF, TXT, and DOCX files are supported.",
        )


def get_file_size(upload_file: UploadFile) -> int:
    upload_file.file.seek(0, os.SEEK_END)
    size = upload_file.file.tell()
    upload_file.file.seek(0)
    return size


def save_upload_file(file: UploadFile) -> tuple[str, str]:
    ensure_upload_dir()

    extension = get_extension(file.filename or "")
    stored_filename = f"{uuid.uuid4().hex}{extension}"
    destination = Path(settings.UPLOAD_DIR) / stored_filename

    file.file.seek(0)
    with destination.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            output.write(chunk)

    file.file.seek(0)
    return stored_filename, str(destination)


def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as file:
        return file.read()


def extract_text_from_pdf(file_path: str) -> str:
    errors = []

    try:
        from pypdf import PdfReader

        reader = PdfReader(file_path)
        pages = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text() or "")
            except Exception as page_exc:
                errors.append(f"pypdf page extraction error: {page_exc}")
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception as exc:
        errors.append(f"pypdf failed: {exc}")

    try:
        import pdfplumber

        pages = []
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                try:
                    pages.append(page.extract_text() or "")
                except Exception as page_exc:
                    errors.append(f"pdfplumber page extraction error: {page_exc}")
        text = "\n".join(pages).strip()
        if text:
            return text
    except Exception as exc:
        errors.append(f"pdfplumber failed: {exc}")

    raise RuntimeError(
        "Could not extract readable text from PDF. "
        + (" | ".join(errors) if errors else "Unknown PDF extraction error.")
    )


def extract_text_from_docx(file_path: str) -> str:
    try:
        from docx import Document as DocxDocument
    except Exception as exc:
        raise RuntimeError("python-docx is required for DOCX extraction.") from exc

    doc = DocxDocument(file_path)
    paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
    return "\n".join(paragraphs)


def extract_text(file_path: str, extension: str) -> str:
    if extension == ".txt":
        return extract_text_from_txt(file_path)
    if extension == ".pdf":
        return extract_text_from_pdf(file_path)
    if extension == ".docx":
        return extract_text_from_docx(file_path)

    raise RuntimeError("Unsupported file type.")


def clean_text(text: str) -> str:
    if not text:
        return ""

    lines = [line.strip() for line in text.splitlines()]
    cleaned_lines = [line for line in lines if line]
    return "\n".join(cleaned_lines).strip()


def chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    if not text.strip():
        return []

    normalized = " ".join(text.split())
    chunks: list[str] = []

    start = 0
    total_length = len(normalized)

    while start < total_length:
        end = min(start + chunk_size, total_length)
        chunk = normalized[start:end].strip()
        if chunk:
            chunks.append(chunk)

        if end >= total_length:
            break

        start = max(end - overlap, 0)

    return chunks


def compute_document_stats(db: Session, document: Document) -> dict:
    chunk_count = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document.id)
        .count()
    )

    embedded_chunk_count = (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.document_id == document.id,
            DocumentChunk.embedding_json.isnot(None),
        )
        .count()
    )

    return {
        "text_length": len(document.extracted_text or ""),
        "chunk_count": chunk_count,
        "embedded_chunk_count": embedded_chunk_count,
    }


def process_document(db: Session, document: Document) -> None:
    if not document.file_path:
        document.status = "failed"
        document.error_message = "File path is missing."
        db.commit()
        return

    try:
        extension = get_extension(document.filename or "")
        raw_text = extract_text(document.file_path, extension)
        text = clean_text(raw_text)

        if not text.strip():
            document.extracted_text = ""
            document.status = "failed"
            document.error_message = "No readable text could be extracted from this file."
            db.commit()
            return

        document.status = "processing"
        document.error_message = None
        document.extracted_text = text

        db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
        db.commit()

        chunks = chunk_text(text)
        if not chunks:
            document.status = "failed"
            document.error_message = "Text was extracted but chunking produced no content."
            db.commit()
            return

        for index, chunk_text_value in enumerate(chunks):
            chunk = DocumentChunk(
                document_id=document.id,
                chunk_index=index,
                content=chunk_text_value,
                embedding_json=None,
            )

            embedding = get_embedding(chunk_text_value)
            if embedding is not None:
                import json
                chunk.embedding_json = json.dumps(embedding)

            db.add(chunk)

        document.status = "ready"
        document.error_message = None
        db.commit()
        db.refresh(document)

    except Exception as exc:
        document.status = "failed"
        document.error_message = f"Processing failed: {str(exc)}"
        db.commit()


def serialize_document(document: Document, db: Session | None = None) -> dict:
    stats = compute_document_stats(db, document) if db is not None else {
        "text_length": len(document.extracted_text or ""),
        "chunk_count": len(document.chunks),
        "embedded_chunk_count": sum(1 for chunk in document.chunks if chunk.embedding_json),
    }

    return {
        "id": document.id,
        "filename": document.filename,
        "stored_filename": document.stored_filename,
        "content_type": document.content_type,
        "owner_id": document.owner_id,
        "text_length": stats["text_length"],
        "chunk_count": stats["chunk_count"],
        "embedded_chunk_count": stats["embedded_chunk_count"],
        "status": document.status,
        "error_message": document.error_message,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
    }


def serialize_document_detail(document: Document, db: Session | None = None) -> dict:
    data = serialize_document(document, db=db)
    data["preview"] = (document.extracted_text or "")[:3000]
    return data


def build_insights_for_document(document: Document) -> dict:
    return build_document_insights(
        text=document.extracted_text or "",
        filename=document.filename or "document",
    )