from __future__ import annotations

import re
from collections import Counter

EMAIL_REGEX = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PHONE_REGEX = re.compile(
    r"(?:\+?1[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}"
)

MONTHS = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
DATE_REGEXES = [
    re.compile(rf"\b{MONTHS}\s+\d{{1,2}},\s+\d{{4}}\b", re.IGNORECASE),
    re.compile(rf"\b{MONTHS}\s+\d{{4}}\b", re.IGNORECASE),
    re.compile(r"\b(?:Spring|Summer|Fall|Winter)\s+\d{4}\b", re.IGNORECASE),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
]

STOP_ORG_TERMS = {
    "including",
    "summary",
    "school",
    "institute",
    "university-new",
    "experience",
    "skills",
    "education",
    "projects",
    "phone",
    "email",
    "contact",
    "contacts",
    "admissions",
    "office",
    "welcome",
    "dear",
    "sincerely",
    "increasing",
    "increase",
    "llc",
    "inc",
}

ORG_HINTS = [
    "university",
    "college",
    "school",
    "hospital",
    "company",
    "corporation",
    "department",
    "business school",
    "rutgers",
    "google",
    "amazon",
    "microsoft",
    "openai",
    "meta",
]

RESUME_FILENAME_HINTS = ["resume", "cv"]
ADMISSION_FILENAME_HINTS = ["admit", "admission", "offer", "welcome", "decision"]
INVOICE_FILENAME_HINTS = ["invoice", "receipt", "bill"]
CONTRACT_FILENAME_HINTS = ["contract", "agreement"]
COVER_LETTER_FILENAME_HINTS = ["cover letter", "cover-letter"]

QUESTION_LIBRARY = {
    "resume": [
        "Summarize this resume.",
        "What are the main technical skills?",
        "What work experience is included?",
        "What is the GPA?",
        "What is the expected graduation date?",
        "What projects are mentioned?",
    ],
    "admission_letter": [
        "Summarize this admission letter.",
        "What program was the applicant admitted to?",
        "What term or start date is mentioned?",
        "What are the next steps for the recipient?",
        "Who sent this letter?",
        "What contact information is provided?",
    ],
    "invoice": [
        "Summarize this invoice.",
        "What is the total amount?",
        "Who issued the invoice?",
        "Who is the recipient?",
        "What date or due date is mentioned?",
        "What payment details appear here?",
    ],
    "contract": [
        "Summarize this contract.",
        "Who are the parties involved?",
        "What are the main obligations?",
        "What dates or deadlines are mentioned?",
        "Are there termination terms?",
        "What key clauses appear in this agreement?",
    ],
    "cover_letter": [
        "Summarize this cover letter.",
        "Who is the applicant applying to?",
        "What role or field is being targeted?",
        "What strengths are emphasized?",
        "What experience is highlighted?",
        "What contact details are included?",
    ],
    "general_document": [
        "Summarize this document.",
        "What is the main purpose of this document?",
        "What key dates are mentioned?",
        "What important names or organizations appear?",
        "What contact information appears here?",
        "What actions or next steps are mentioned?",
    ],
}


def normalize_whitespace(text: str) -> str:
    return " ".join((text or "").split()).strip()


def first_non_empty_lines(text: str, limit: int = 20) -> list[str]:
    return [line.strip() for line in (text or "").splitlines() if line.strip()][:limit]


def detect_document_type(text: str, filename: str) -> str:
    lower_text = (text or "").lower()
    lower_name = (filename or "").lower()
    header_text = "\n".join(first_non_empty_lines(text, 20)).lower()

    if any(hint in lower_name for hint in ADMISSION_FILENAME_HINTS):
        return "admission_letter"
    if any(hint in lower_name for hint in INVOICE_FILENAME_HINTS):
        return "invoice"
    if any(hint in lower_name for hint in CONTRACT_FILENAME_HINTS):
        return "contract"
    if any(hint in lower_name for hint in COVER_LETTER_FILENAME_HINTS):
        return "cover_letter"
    if any(hint in lower_name for hint in RESUME_FILENAME_HINTS):
        return "resume"

    admission_signals = [
        "we are pleased to offer you admission",
        "offer you admission",
        "welcome to the program",
        "graduate admissions",
        "admitted to",
        "program for fall",
        "masters of",
    ]
    if sum(1 for signal in admission_signals if signal in lower_text) >= 2:
        return "admission_letter"

    invoice_signals = ["invoice", "bill to", "amount due", "payment due", "invoice number"]
    if sum(1 for signal in invoice_signals if signal in lower_text) >= 2:
        return "invoice"

    contract_signals = [
        "this agreement",
        "terms and conditions",
        "termination",
        "governing law",
        "confidentiality",
    ]
    if sum(1 for signal in contract_signals if signal in lower_text) >= 2:
        return "contract"

    cover_letter_signals = [
        "dear hiring manager",
        "i am applying",
        "i am excited to apply",
        "thank you for your consideration",
        "sincerely",
    ]
    if sum(1 for signal in cover_letter_signals if signal in header_text) >= 2:
        return "cover_letter"

    resume_signals = ["experience", "education", "skills", "projects", "linkedin", "gpa"]
    if sum(1 for signal in resume_signals if signal in lower_text) >= 3:
        return "resume"

    return "general_document"


def summarize_text(text: str, max_sentences: int = 3) -> str:
    normalized = normalize_whitespace(text)
    if not normalized:
        return "No summary available."

    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    selected = []

    for sentence in sentences:
        cleaned = sentence.strip()
        if len(cleaned) >= 35:
            selected.append(cleaned)
        if len(selected) >= max_sentences:
            break

    if selected:
        return " ".join(selected)

    return normalized[:260] + ("..." if len(normalized) > 260 else "")


def extract_contacts(text: str) -> list[str]:
    emails = EMAIL_REGEX.findall(text or "")
    phones = PHONE_REGEX.findall(text or "")
    merged = list(dict.fromkeys(emails + phones))
    return merged[:8]


def extract_key_dates(text: str) -> list[str]:
    matches: list[str] = []
    for regex in DATE_REGEXES:
        matches.extend(regex.findall(text or ""))

    cleaned = []
    seen = set()
    for item in matches:
        value = " ".join(item.split()).strip()
        key = value.lower()
        if value and key not in seen:
            cleaned.append(value)
            seen.add(key)

    return cleaned[:10]


def clean_org_candidate(value: str) -> str:
    candidate = normalize_whitespace(value)
    candidate = re.sub(r"\b(?:Phone|Fax|Email)\b[:\s].*$", "", candidate, flags=re.IGNORECASE).strip()
    candidate = re.sub(r"\s{2,}", " ", candidate).strip(" ,.-")
    return candidate


def is_bad_org_candidate(value: str) -> bool:
    lower = value.lower()

    if not value:
        return True
    if len(value) < 4 or len(value) > 70:
        return True
    if "@" in value:
        return True
    if re.search(r"\d{3}[-)\s.]\d{3}", value):
        return True
    if lower in STOP_ORG_TERMS:
        return True
    if value.count(" ") > 6:
        return True
    if lower.startswith(("the ", "of ", "and ")):
        return True

    return False


def extract_organizations(text: str) -> list[str]:
    candidates: list[str] = []
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]

    for line in lines:
        lower_line = line.lower()

        if any(hint in lower_line for hint in ORG_HINTS):
            parts = re.split(r"[|,/;]", line)
            for part in parts:
                cleaned = clean_org_candidate(part)
                if any(hint in cleaned.lower() for hint in ORG_HINTS) and not is_bad_org_candidate(cleaned):
                    candidates.append(cleaned)

        phrase_matches = re.findall(
            r"\b(?:[A-Z][A-Za-z&.-]*\s){0,4}(?:University|College|School|Hospital|Company|Corporation|Department|Business School)\b",
            line,
        )
        for match in phrase_matches:
            cleaned = clean_org_candidate(match)
            if not is_bad_org_candidate(cleaned):
                candidates.append(cleaned)

    final_items = []
    seen = set()
    for item, _count in Counter(candidates).most_common():
        key = item.lower()
        if key not in seen:
            seen.add(key)
            final_items.append(item)

    return final_items[:6]


def generate_suggested_questions(document_type: str) -> list[str]:
    return QUESTION_LIBRARY.get(document_type, QUESTION_LIBRARY["general_document"]).copy()


def build_document_insights(text: str, filename: str) -> dict:
    document_type = detect_document_type(text, filename)

    return {
        "document_type": document_type,
        "summary": summarize_text(text),
        "key_dates": extract_key_dates(text),
        "contacts": extract_contacts(text),
        "organizations": extract_organizations(text),
        "suggested_questions": generate_suggested_questions(document_type),
    }