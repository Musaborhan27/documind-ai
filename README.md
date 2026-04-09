# DocuMind AI

DocuMind AI is a full-stack document intelligence application that allows users to upload documents, extract readable text, generate structured insights, and ask grounded questions about document contents through a clean interactive dashboard.

The project combines a FastAPI backend with a Next.js frontend and is built as a portfolio-ready AI product focused on document ingestion, text extraction, retrieval, Q&A, and user-specific document history.

---

## Features

- User registration and login with JWT authentication
- Upload support for **PDF**, **TXT**, and **DOCX** files
- Automatic text extraction and document chunking
- AI-assisted document insights, including:
  - summary
  - key dates
  - contacts
  - organizations
  - document type detection
  - suggested follow-up questions
- Grounded question answering over uploaded documents
- Evidence and source chunk previews for answers
- Per-document question history
- Document reprocessing support
- Delete uploaded documents
- Search, filter, and sort documents in the dashboard
- Dark-themed modern UI built with Next.js

---

## Tech Stack

### Backend
- FastAPI
- SQLAlchemy
- SQLite
- JWT authentication
- OpenAI-compatible API integration
- `pypdf` for PDF parsing
- `python-docx` for DOCX parsing

### Frontend
- Next.js
- React
- TypeScript
- Axios
- Tailwind CSS

---

## Project Structure

```bash
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
│   ├── types/
│   ├── package.json
│   └── README.md
├── .env.example
├── .gitignore
├── README.md
└── requirements.txt
````

---

## How It Works

1. A user creates an account or logs in.
2. The user uploads a supported document.
3. The backend extracts and cleans the text.
4. The text is split into chunks for retrieval.
5. Embeddings are generated for chunk-level semantic search.
6. The system builds document insights such as summary, entities, dates, and document type.
7. The user asks questions about the uploaded file.
8. The system retrieves the most relevant chunks and returns an answer with supporting evidence.
9. Question history is stored per document for later review.

---

## API Overview

### Auth

* `POST /auth/register` — register a new user
* `POST /auth/login` — log in and receive a bearer token

### Users

* `GET /users/me` — get the current authenticated user

### Documents

* `GET /documents/` — list the current user’s documents
* `POST /documents/upload` — upload and process a document
* `GET /documents/{document_id}` — get document details
* `GET /documents/{document_id}/insights` — get generated insights
* `POST /documents/{document_id}/reprocess` — reprocess a document
* `DELETE /documents/{document_id}` — delete a document

### Q&A

* `POST /qa/ask` — ask a question about a document
* `GET /qa/history/{document_id}` — get question history for a document

---

## Environment Variables

Create a `.env` file in the project root using the values from `.env.example`.

```env
DATABASE_URL=sqlite:///./documind.db
SECRET_KEY=replace-this-with-a-long-random-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
BACKEND_CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
MAX_UPLOAD_SIZE_BYTES=10485760
UPLOAD_DIR=uploads
```

### Notes

* `SECRET_KEY` should be at least 32 characters long.
* The backend uses SQLite by default.
* The frontend expects the backend to run on `http://127.0.0.1:8000` unless overridden.
* Uploaded files are stored in the `uploads` directory.

---

## Backend Setup

### 1. Clone the repository

```bash
git clone https://github.com/Musaborhan27/documind-ai.git
cd documind-ai
```

### 2. Create and activate a virtual environment

```bash
python -m venv venv
source venv/bin/activate
```

On Windows:

```bash
venv\Scripts\activate
```

### 3. Install backend dependencies

```bash
pip install -r requirements.txt
```

### 4. Create your `.env` file

```bash
cp .env.example .env
```

Then update the values inside `.env`, especially:

* `SECRET_KEY`
* `OPENAI_API_KEY`

### 5. Run the backend server

```bash
uvicorn app.main:app --reload
```

The backend will be available at:

* API root: `http://127.0.0.1:8000`
* Swagger docs: `http://127.0.0.1:8000/docs`

---

## Frontend Setup

### 1. Move into the frontend folder

```bash
cd documind-frontend
```

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Set the frontend API URL

Create a `.env.local` file inside `documind-frontend`:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

### 4. Run the frontend

```bash
npm run dev
```

The frontend will be available at:

```bash
http://localhost:3000
```

---

## Supported File Types

DocuMind AI currently supports:

* `.pdf`
* `.txt`
* `.docx`

If a document contains no readable text after extraction, processing will fail gracefully and return an error state.

---

## Retrieval and Answering Approach

DocuMind AI uses a hybrid retrieval flow:

* lexical overlap scoring
* embedding-based semantic similarity
* chunk ranking for context selection
* AI-generated answer when model access is available
* fallback answer generation when model output is unavailable

This design helps the system stay usable even when external model generation fails, while still returning grounded answers based on document content.

---

## Why This Project

This project demonstrates practical skills across:

* backend API development with FastAPI
* authentication and protected routes
* document parsing and preprocessing
* retrieval-based question answering
* structured AI output generation
* frontend state management and API integration
* building a complete end-to-end AI product

It is designed to showcase the kind of applied engineering used in modern AI-powered SaaS products.

---

## Future Improvements

* PostgreSQL support for production deployment
* Background job processing for large files
* Better OCR support for scanned PDFs
* Multi-document Q&A
* Exportable chat/history reports
* Admin dashboard and analytics
* Cloud storage integration
* Docker deployment setup
* Automated tests and CI pipeline

---

## License

This project is open for learning, portfolio, and educational use.
You can add a custom license here if you plan to distribute it publicly.

---

## Author

Built by **Musab Orhan** as an AI-powered full-stack portfolio project.
