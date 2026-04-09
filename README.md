# DocuMind AI

DocuMind AI is a full-stack document intelligence application that lets users upload documents, extract readable text, generate structured insights, and ask grounded questions about document contents through an interactive dashboard.

The project combines a FastAPI backend with a Next.js frontend and is designed as a portfolio-quality AI product demo focused on document ingestion, retrieval, Q&A, and history tracking.

## Features

- User authentication with JWT-based login
- Upload support for PDF, TXT, and DOCX files
- Automatic text extraction and chunking
- Smart document insights:
  - summary
  - key dates
  - contacts
  - organizations
  - document type detection
  - document-specific suggested questions
- Question answering over uploaded documents
- Source previews and evidence display
- Per-document question history
- Reprocessing support for documents
- Clean dark-mode dashboard UI

## Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- SQLite
- python-docx
- pypdf / pdfplumber
- OpenAI-compatible API integration

### Frontend
- Next.js
- React
- TypeScript
- Axios
- Tailwind CSS

## Project Structure

```text
documind-ai/
├── app/
│   ├── core/
│   ├── db/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── main.py
├── documind-frontend/
│   ├── app/
│   ├── lib/
│   ├── public/
│   └── types/
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt