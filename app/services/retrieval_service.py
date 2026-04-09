from __future__ import annotations

import json
import math
import re
from typing import Any

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.services.insight_service import detect_document_type
from app.services.openai_client import generate_answer, get_embedding

WORD_REGEX = re.compile(r"\b[a-zA-Z0-9]+\b")


def tokenize(text: str) -> set[str]:
    return {token.lower() for token in WORD_REGEX.findall(text or "")}


def lexical_score(question: str, content: str) -> float:
    q_tokens = tokenize(question)
    c_tokens = tokenize(content)

    if not q_tokens or not c_tokens:
        return 0.0

    overlap = q_tokens.intersection(c_tokens)
    return len(overlap) / max(len(q_tokens), 1)


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0

    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)


def parse_embedding(raw_value: Any) -> list[float] | None:
    if raw_value is None:
        return None

    if isinstance(raw_value, list):
        return raw_value

    if isinstance(raw_value, str):
        try:
            parsed = json.loads(raw_value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return None

    return None


def retrieve_top_chunks(
    db: Session,
    document_id: int,
    question: str,
    limit: int = 4,
) -> tuple[list[dict], str]:
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )

    if not chunks:
        return [], "none"

    query_embedding = get_embedding(question)
    scored = []

    for chunk in chunks:
        content = chunk.content or ""
        if not content.strip():
            continue

        lex = lexical_score(question, content)
        emb = 0.0

        if query_embedding is not None and chunk.embedding_json:
            parsed = parse_embedding(chunk.embedding_json)
            if parsed is not None:
                emb = cosine_similarity(query_embedding, parsed)

        final_score = (emb * 0.7) + (lex * 0.3) if query_embedding is not None else lex

        scored.append(
            {
                "chunk_id": chunk.chunk_index + 1,
                "text": content,
                "score": round(final_score, 4),
                "lexical_score": round(lex, 4),
                "embedding_score": round(emb, 4),
            }
        )

    scored.sort(key=lambda item: item["score"], reverse=True)
    return scored[:limit], ("semantic+lexical" if query_embedding is not None else "lexical")


def build_context(chunks: list[dict]) -> str:
    return "\n\n".join(f"[Chunk {item['chunk_id']}]\n{item['text']}" for item in chunks)


def build_sources(chunks: list[dict]) -> list[dict]:
    return [
        {
            "chunk_id": item["chunk_id"],
            "score": item["score"],
            "preview": item["text"][:400],
        }
        for item in chunks
    ]


def clean_sentence_end(text: str) -> str:
    text = " ".join((text or "").split()).strip()
    text = re.sub(r"\s+", " ", text)
    text = text.rstrip(",;:-")
    return text


def first_sentence(text: str) -> str:
    parts = re.split(r"(?<=[.!?])\s+", clean_sentence_end(text))
    return parts[0].strip() if parts and parts[0].strip() else clean_sentence_end(text)


def answer_from_patterns(question: str, document_text: str) -> str | None:
    q = question.lower()

    if "gpa" in q:
        match = re.search(r"\bGPA[:\s]*([0-4]\.\d{1,2})\b", document_text, re.IGNORECASE)
        if match:
            return f"The GPA listed in the document is {match.group(1)}."

    if "email" in q or "contact" in q:
        match = re.search(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", document_text)
        if match:
            return f"The document lists this email address: {match.group(0)}."

    if "phone" in q:
        match = re.search(r"(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}", document_text)
        if match:
            return f"The phone number listed in the document is {match.group(0)}."

    if "what program" in q or "program" in q:
        match = re.search(
            r"(Master(?:s)? of [A-Za-z ,&/-]+|Bachelor(?:s)? of [A-Za-z ,&/-]+)",
            document_text,
            re.IGNORECASE,
        )
        if match:
            value = clean_sentence_end(match.group(1))
            return f"The program mentioned in the document is {value}."

    return None


def build_fallback_answer(question: str, document_text: str, chunks: list[dict], filename: str = "") -> str:
    if not chunks:
        return "I could not find relevant information in the document for that question."

    q = question.lower()
    document_type = detect_document_type(document_text, filename)

    pattern_answer = answer_from_patterns(question, document_text)
    if pattern_answer:
        return pattern_answer

    best_text = clean_sentence_end(chunks[0]["text"])
    best_sentence = first_sentence(best_text)

    if "summarize" in q or "summary" in q:
        return best_sentence

    if "who" in q:
        return f"The document most clearly mentions: {best_sentence}"
    if "when" in q or "date" in q or "deadline" in q:
        return f"The most relevant date-related information I found is: {best_sentence}"
    if "next step" in q or "what should" in q:
        return f"The document suggests this next-step information: {best_sentence}"

    if document_type == "resume":
        return f"Based on the resume, the most relevant information is: {best_sentence}"
    if document_type == "admission_letter":
        return f"Based on the admission letter, the most relevant information is: {best_sentence}"
    if document_type == "invoice":
        return f"Based on the invoice, the most relevant information is: {best_sentence}"

    return f"Based on the document, the most relevant information is: {best_sentence}"


def answer_question_from_document(
    db: Session,
    document_id: int,
    question: str,
) -> dict:
    document = db.query(Document).filter(Document.id == document_id).first()
    if document is None:
        return {
            "answer": "Document not found.",
            "evidence": "",
            "sources": [],
            "used_model": None,
            "used_fallback": True,
            "retrieval_mode": "none",
        }

    top_chunks, retrieval_mode = retrieve_top_chunks(
        db=db,
        document_id=document_id,
        question=question,
        limit=4,
    )

    if not top_chunks:
        return {
            "answer": "No relevant document content was found for this question.",
            "evidence": "",
            "sources": [],
            "used_model": None,
            "used_fallback": True,
            "retrieval_mode": "none",
        }

    context = build_context(top_chunks)
    evidence = build_context(top_chunks[:2])
    sources = build_sources(top_chunks)

    ai_answer = generate_answer(question=question, context=context)
    document_text = document.extracted_text or ""

    if ai_answer:
        answer = clean_sentence_end(ai_answer)
        used_model = "openai"
        used_fallback = False
    else:
        answer = build_fallback_answer(
            question=question,
            document_text=document_text,
            chunks=top_chunks,
            filename=document.filename or "",
        )
        used_model = None
        used_fallback = True

    return {
        "answer": answer,
        "evidence": evidence,
        "sources": sources,
        "used_model": used_model,
        "used_fallback": used_fallback,
        "retrieval_mode": retrieval_mode,
    }