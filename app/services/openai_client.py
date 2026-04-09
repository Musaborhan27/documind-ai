from __future__ import annotations

from typing import Any, Optional

from app.core.config import settings

try:
    from openai import OpenAI
except Exception:  # pragma: no cover
    OpenAI = None  # type: ignore


def has_openai_config() -> bool:
    return bool(
        OpenAI is not None
        and settings.OPENAI_API_KEY
        and settings.OPENAI_API_KEY.strip()
    )


def get_client() -> Optional[Any]:
    if not has_openai_config():
        return None

    try:
        return OpenAI(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL,
        )
    except Exception:
        return None


def get_embedding(text: str) -> Optional[list[float]]:
    client = get_client()
    if client is None:
        return None

    cleaned = " ".join((text or "").split()).strip()
    if not cleaned:
        return None

    try:
        response = client.embeddings.create(
            model=settings.OPENAI_EMBEDDING_MODEL,
            input=cleaned[:8000],
        )
        return response.data[0].embedding
    except Exception:
        return None


def generate_answer(question: str, context: str) -> Optional[str]:
    client = get_client()
    if client is None:
        return None

    prompt = f"""
You are answering a question using only the provided document context.

Rules:
- Use only the context.
- If the answer is not clearly present, say so.
- Keep the answer direct and concise.
- Do not invent facts.
- Prefer short, useful answers over long summaries.

Question:
{question}

Document Context:
{context}
""".strip()

    try:
        response = client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": "You answer strictly from the provided document context.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            temperature=0.2,
        )
        if not response.choices:
            return None
        message = response.choices[0].message.content
        return message.strip() if message else None
    except Exception:
        return None