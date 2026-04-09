"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { api, getApiErrorMessage, loadStoredToken, setAuthToken } from "@/lib/api";
import type {
  DocumentDetail,
  DocumentInsights,
  DocumentItem,
  MessageResponse,
  QaResponse,
  QuestionHistoryItem,
  QuestionHistoryResponse,
  RegisterResponse,
  UploadResponse,
  User,
} from "@/types";

type AuthMode = "login" | "register";
type NoticeTone = "success" | "error" | "info";

const FALLBACK_QUICK_ACTIONS = [
  "Summarize this document.",
  "What is this document about?",
  "Extract the key dates.",
  "List the important names or organizations.",
  "List the contact information.",
  "What actions or next steps are mentioned?",
];

export default function HomePage() {
  const [tokenLoaded, setTokenLoaded] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [user, setUser] = useState<User | null>(null);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [selectedDocumentDetail, setSelectedDocumentDetail] = useState<DocumentDetail | null>(null);
  const [documentInsights, setDocumentInsights] = useState<DocumentInsights | null>(null);
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentFilter, setDocumentFilter] = useState<"all" | "ready" | "processing" | "failed">("all");
  const [documentSort, setDocumentSort] = useState<"newest" | "oldest" | "name">("newest");
  const [showPreview, setShowPreview] = useState(false);

  const [question, setQuestion] = useState("");
  const [qaResult, setQaResult] = useState<QaResponse | null>(null);
  const [questionHistory, setQuestionHistory] = useState<QuestionHistoryItem[]>([]);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [authLoading, setAuthLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [qaLoading, setQaLoading] = useState(false);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<number | null>(null);
  const [copyingAnswer, setCopyingAnswer] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("info");

  useEffect(() => {
    loadStoredToken();
    setTokenLoaded(true);
  }, []);

  useEffect(() => {
    if (!tokenLoaded) return;
    fetchCurrentUser();
  }, [tokenLoaded]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  useEffect(() => {
    if (selectedDocumentId !== null) {
      fetchDocumentDetail(selectedDocumentId);
      fetchQuestionHistory(selectedDocumentId);
      fetchDocumentInsights(selectedDocumentId);
      setQaResult(null);
      setQuestion("");
      setPageError(null);
    } else {
      setSelectedDocumentDetail(null);
      setDocumentInsights(null);
      setQuestionHistory([]);
      setQaResult(null);
      setQuestion("");
    }
  }, [selectedDocumentId]);

  const selectedDocument = useMemo(() => {
    return documents.find((doc) => doc.id === selectedDocumentId) || null;
  }, [documents, selectedDocumentId]);

  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    const q = documentSearch.trim().toLowerCase();
    if (q) {
      result = result.filter((doc) => doc.filename.toLowerCase().includes(q));
    }

    if (documentFilter !== "all") {
      result = result.filter((doc) => doc.status === documentFilter);
    }

    if (documentSort === "name") {
      result.sort((a, b) => a.filename.localeCompare(b.filename));
    } else if (documentSort === "oldest") {
      result.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return aTime - bTime;
      });
    } else {
      result.sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      });
    }

    return result;
  }, [documents, documentSearch, documentFilter, documentSort]);

  const quickActions = documentInsights?.suggested_questions?.length
    ? documentInsights.suggested_questions
    : FALLBACK_QUICK_ACTIONS;

  const canAskQuestion =
    !!selectedDocumentId &&
    selectedDocumentDetail?.status === "ready" &&
    (selectedDocumentDetail?.chunk_count ?? 0) > 0 &&
    question.trim().length > 1 &&
    !qaLoading;

  const readyCount = documents.filter((doc) => doc.status === "ready").length;
  const processingCount = documents.filter((doc) => doc.status === "processing").length;
  const failedCount = documents.filter((doc) => doc.status === "failed").length;

  function setNotice(message: string, tone: NoticeTone = "info") {
    setPageMessage(message);
    setNoticeTone(tone);
  }

  async function fetchCurrentUser() {
    try {
      const response = await api.get<User>("/users/me");
      setUser(response.data);
      setPageError(null);
    } catch {
      setUser(null);
    }
  }

  async function fetchDocuments(preferredDocumentId?: number) {
    try {
      setDocumentsLoading(true);
      const response = await api.get<DocumentItem[]>("/documents/");
      const docs = response.data;
      setDocuments(docs);

      if (docs.length === 0) {
        setSelectedDocumentId(null);
        return;
      }

      if (preferredDocumentId && docs.some((doc) => doc.id === preferredDocumentId)) {
        setSelectedDocumentId(preferredDocumentId);
        return;
      }

      if (selectedDocumentId && docs.some((doc) => doc.id === selectedDocumentId)) {
        return;
      }

      const firstReadyDocument = docs.find((doc) => doc.status === "ready");
      setSelectedDocumentId(firstReadyDocument?.id ?? docs[0].id);
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Could not load documents."));
    } finally {
      setDocumentsLoading(false);
    }
  }

  async function fetchDocumentDetail(documentId: number) {
    try {
      setDetailLoading(true);
      const response = await api.get<DocumentDetail>(`/documents/${documentId}`);
      setSelectedDocumentDetail(response.data);
    } catch (error) {
      setSelectedDocumentDetail(null);
      setPageError(getApiErrorMessage(error, "Could not load selected document detail."));
    } finally {
      setDetailLoading(false);
    }
  }

  async function fetchDocumentInsights(documentId: number) {
    try {
      const response = await api.get<DocumentInsights>(`/documents/${documentId}/insights`);
      setDocumentInsights(response.data);
    } catch {
      setDocumentInsights(null);
    }
  }

  async function fetchQuestionHistory(documentId: number) {
    try {
      const response = await api.get<QuestionHistoryResponse>(`/qa/history/${documentId}`);
      setQuestionHistory(response.data.history);
    } catch {
      setQuestionHistory([]);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();

    setAuthLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      await api.post<RegisterResponse>("/auth/register", {
        email,
        full_name: fullName,
        password,
      });

      setAuthMode("login");
      setNotice("Registration successful. You can log in now.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Registration failed."));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    setAuthLoading(true);
    setPageError(null);
    setPageMessage(null);

    try {
      const formData = new URLSearchParams();
      formData.append("grant_type", "password");
      formData.append("username", email);
      formData.append("password", password);

      const response = await api.post(
        "/auth/login",
        formData,
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      );

      setAuthToken(response.data.access_token);
      await fetchCurrentUser();
      await fetchDocuments();
      setNotice("Login successful.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Login failed. Check email/password."));
    } finally {
      setAuthLoading(false);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setDocuments([]);
    setSelectedDocumentId(null);
    setSelectedDocumentDetail(null);
    setDocumentInsights(null);
    setQaResult(null);
    setQuestionHistory([]);
    setUploadFile(null);
    setQuestion("");
    setDocumentSearch("");
    setDocumentFilter("all");
    setDocumentSort("newest");
    setShowPreview(false);
    setPageError(null);
    setNotice("Logged out.", "info");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function handleOpenFilePicker() {
    setPageError(null);
    setPageMessage(null);
    fileInputRef.current?.click();
  }

  function isAllowedFile(file: File) {
    const validExtensions = [".pdf", ".txt", ".docx"];
    const lower = file.name.toLowerCase();
    return validExtensions.some((ext) => lower.endsWith(ext));
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function handleFileSelection(file: File | null) {
    if (!file) {
      setUploadFile(null);
      return;
    }

    if (!isAllowedFile(file)) {
      setPageError("Only PDF, TXT, and DOCX files are supported.");
      setUploadFile(null);
      return;
    }

    setUploadFile(file);
    setPageError(null);
    setPageMessage(null);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelection(file);
  }

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!uploadFile) {
      setPageError("Please choose a file before uploading.");
      return;
    }

    setUploadLoading(true);
    setPageError(null);
    setNotice("Uploading and processing document...", "info");

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const response = await api.post<UploadResponse>("/documents/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const newDocumentId = response.data.document.id;

      await fetchDocuments(newDocumentId);
      await fetchDocumentDetail(newDocumentId);
      await fetchQuestionHistory(newDocumentId);
      await fetchDocumentInsights(newDocumentId);

      setSelectedDocumentId(newDocumentId);
      setUploadFile(null);
      setQuestion("");
      setQaResult(null);
      setShowPreview(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      setNotice("Document uploaded and processed successfully.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Upload failed."));
      setPageMessage(null);
    } finally {
      setUploadLoading(false);
    }
  }

  async function handleAskQuestion(event: FormEvent) {
    event.preventDefault();

    if (!selectedDocumentId) {
      setPageError("Please select a document first.");
      return;
    }

    if (selectedDocumentDetail?.status !== "ready") {
      setPageError("The selected document is not ready for question answering yet.");
      return;
    }

    if (!question.trim()) {
      setPageError("Please enter a question.");
      return;
    }

    setQaLoading(true);
    setPageError(null);
    setNotice("Generating answer...", "info");

    try {
      const response = await api.post<QaResponse>("/qa/ask", {
        document_id: selectedDocumentId,
        question: question.trim(),
      });

      setQaResult(response.data);
      await fetchQuestionHistory(selectedDocumentId);
      setNotice("Question answered successfully.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Question answering failed."));
      setPageMessage(null);
    } finally {
      setQaLoading(false);
    }
  }

  async function handleReprocessDocument() {
    if (!selectedDocumentId) return;

    setReprocessLoading(true);
    setPageError(null);
    setNotice("Reprocessing document...", "info");

    try {
      await api.post<MessageResponse>(`/documents/${selectedDocumentId}/reprocess`);
      await fetchDocuments(selectedDocumentId);
      await fetchDocumentDetail(selectedDocumentId);
      await fetchQuestionHistory(selectedDocumentId);
      await fetchDocumentInsights(selectedDocumentId);
      setQaResult(null);
      setQuestion("");
      setNotice("Document reprocessed successfully.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Reprocess failed."));
      setPageMessage(null);
    } finally {
      setReprocessLoading(false);
    }
  }

  async function handleDeleteDocument(documentId: number) {
    const confirmed = window.confirm("Are you sure you want to delete this document?");
    if (!confirmed) return;

    setDeleteLoadingId(documentId);
    setPageError(null);
    setNotice("Deleting document...", "info");

    try {
      await api.delete<MessageResponse>(`/documents/${documentId}`);

      const remainingDocs = documents.filter((doc) => doc.id !== documentId);
      setDocuments(remainingDocs);

      if (selectedDocumentId === documentId) {
        const nextReady = remainingDocs.find((doc) => doc.status === "ready");
        const fallback = remainingDocs[0] ?? null;
        const nextId = nextReady?.id ?? fallback?.id ?? null;
        setSelectedDocumentId(nextId);

        if (!nextId) {
          setSelectedDocumentDetail(null);
          setDocumentInsights(null);
          setQuestionHistory([]);
          setQaResult(null);
          setQuestion("");
        }
      }

      setNotice("Document deleted successfully.", "success");
    } catch (error) {
      setPageError(getApiErrorMessage(error, "Delete failed."));
      setPageMessage(null);
    } finally {
      setDeleteLoadingId(null);
    }
  }

  async function handleCopyAnswer() {
    if (!qaResult?.answer) return;

    try {
      setCopyingAnswer(true);
      await navigator.clipboard.writeText(qaResult.answer);
      setNotice("Answer copied to clipboard.", "success");
    } catch {
      setPageError("Could not copy the answer.");
    } finally {
      setCopyingAnswer(false);
    }
  }

  function getStatusBadgeClasses(status: string) {
    if (status === "ready") {
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    }
    if (status === "failed") {
      return "border border-rose-500/30 bg-rose-500/10 text-rose-300";
    }
    return "border border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  function getNoticeClasses() {
    if (noticeTone === "success") {
      return "border border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    }
    if (noticeTone === "error") {
      return "border border-rose-500/30 bg-rose-500/10 text-rose-200";
    }
    return "border border-sky-500/30 bg-sky-500/10 text-sky-200";
  }

  function formatDate(dateValue?: string | null) {
    if (!dateValue) return "Unknown";
    try {
      return new Date(dateValue).toLocaleString();
    } catch {
      return dateValue;
    }
  }

  function getUserInitials(name?: string) {
    if (!name) return "U";
    const parts = name.trim().split(" ").filter(Boolean);
    return parts.slice(0, 2).map((item) => item[0]?.toUpperCase()).join("") || "U";
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16213f_0%,_#0b1020_55%,_#060913_100%)] px-6 py-10 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
              <div className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                AI-powered document intelligence
              </div>

              <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-5xl">
                DocuMind AI
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                Upload a document, extract its structure, and ask grounded questions with sources,
                evidence, insights, and history in one place.
              </p>

              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <FeatureCard
                  title="Upload"
                  text="PDF, TXT, or DOCX support with one clean ingestion flow."
                />
                <FeatureCard
                  title="Analyze"
                  text="Chunking, embeddings, document insights, and retrieval built in."
                />
                <FeatureCard
                  title="Ask"
                  text="Question answering with answers, evidence, and source previews."
                />
              </div>
            </div>

            <section className="rounded-[28px] border border-white/10 bg-[#121a2f]/90 p-6 shadow-2xl backdrop-blur">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">
                    {authMode === "login" ? "Welcome back" : "Create your account"}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold">
                    {authMode === "login" ? "Login" : "Register"}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "register" : "login");
                    setPageError(null);
                    setPageMessage(null);
                  }}
                  className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                >
                  {authMode === "login" ? "Need signup?" : "Back to login"}
                </button>
              </div>

              {pageError && (
                <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {pageError}
                </div>
              )}

              {pageMessage && (
                <div className={`mb-4 rounded-2xl px-4 py-3 text-sm ${getNoticeClasses()}`}>
                  {pageMessage}
                </div>
              )}

              <form
                onSubmit={authMode === "login" ? handleLogin : handleRegister}
                className="space-y-4"
              >
                {authMode === "register" && (
                  <div>
                    <label className="mb-2 block text-sm text-slate-300">Full Name</label>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none transition focus:border-indigo-400"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Email</label>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none transition focus:border-indigo-400"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-slate-300">Password</label>
                  <input
                    type="password"
                    className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 outline-none transition focus:border-indigo-400"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authLoading
                    ? authMode === "login"
                      ? "Logging in..."
                      : "Creating account..."
                    : authMode === "login"
                    ? "Login"
                    : "Create Account"}
                </button>
              </form>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16213f_0%,_#0b1020_55%,_#060913_100%)] text-white">
      <div className="mx-auto max-w-[1600px] px-4 py-6 md:px-6 xl:px-8">
        <section className="mb-6 rounded-[30px] border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur xl:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                Document Q&A dashboard
              </div>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">
                DocuMind AI
              </h1>

              <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">
                Upload, inspect, and query your documents with retrieval-backed answers, smart
                insights, and recent question history.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[420px]">
              <StatCard label="Documents" value={String(documents.length)} helper="Total uploaded" />
              <StatCard label="Ready" value={String(readyCount)} helper="Queryable now" />
              <StatCard
                label="Processing"
                value={String(processingCount + failedCount)}
                helper={failedCount > 0 ? `${failedCount} failed included` : "Pending or failed"}
              />
            </div>
          </div>

          {(pageError || pageMessage) && (
            <div className="mt-5">
              {pageError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                  {pageError}
                </div>
              ) : (
                <div className={`rounded-2xl px-4 py-3 text-sm font-medium ${getNoticeClasses()}`}>
                  {pageMessage}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[320px_minmax(420px,1fr)_420px]">
          <div className="space-y-6">
            <Panel>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-sm font-semibold text-indigo-200">
                    {getUserInitials(user.full_name)}
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{user.full_name}</p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
                >
                  Logout
                </button>
              </div>
            </Panel>

            <Panel title="Upload Document" subtitle="Drag and drop a file or choose one manually.">
              <form onSubmit={handleUpload} className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="hidden"
                  onChange={(e) => handleFileSelection(e.target.files?.[0] ?? null)}
                />

                <div
                  onClick={handleOpenFilePicker}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={`cursor-pointer rounded-[24px] border border-dashed p-5 transition ${
                    isDragging
                      ? "border-indigo-400 bg-indigo-500/10"
                      : "border-white/10 bg-[#0b1020]/80 hover:border-indigo-400/60 hover:bg-[#10182e]"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="mb-3 rounded-2xl bg-white/5 px-3 py-2 text-xs text-slate-300">
                      PDF / TXT / DOCX
                    </div>
                    <p className="text-sm font-medium text-white">
                      {uploadFile ? uploadFile.name : "Drop your file here"}
                    </p>
                    <p className="mt-2 text-xs leading-6 text-slate-400">
                      {uploadFile
                        ? `${formatFileSize(uploadFile.size)} selected`
                        : "Click to browse from your computer"}
                    </p>
                  </div>
                </div>

                {uploadFile && (
                  <div className="rounded-2xl border border-white/10 bg-[#0b1020] p-3">
                    <p className="text-sm font-medium text-white">{uploadFile.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{formatFileSize(uploadFile.size)}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!uploadFile || uploadLoading}
                  className="w-full rounded-2xl bg-emerald-600 px-4 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploadLoading ? "Uploading..." : "Upload Document"}
                </button>
              </form>
            </Panel>

            <Panel
              title="Documents"
              subtitle={`${documents.length} total • ${readyCount} ready`}
              actions={
                <button
                  type="button"
                  onClick={() => fetchDocuments(selectedDocumentId ?? undefined)}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
                >
                  Refresh
                </button>
              }
            >
              <div className="space-y-3">
                <input
                  value={documentSearch}
                  onChange={(e) => setDocumentSearch(e.target.value)}
                  placeholder="Search documents..."
                  className="w-full rounded-2xl border border-white/10 bg-[#0b1020] px-4 py-3 text-sm outline-none transition focus:border-indigo-400"
                />

                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={documentFilter}
                    onChange={(e) =>
                      setDocumentFilter(
                        e.target.value as "all" | "ready" | "processing" | "failed"
                      )
                    }
                    className="rounded-2xl border border-white/10 bg-[#0b1020] px-3 py-3 text-sm outline-none"
                  >
                    <option value="all">All statuses</option>
                    <option value="ready">Ready</option>
                    <option value="processing">Processing</option>
                    <option value="failed">Failed</option>
                  </select>

                  <select
                    value={documentSort}
                    onChange={(e) => setDocumentSort(e.target.value as "newest" | "oldest" | "name")}
                    className="rounded-2xl border border-white/10 bg-[#0b1020] px-3 py-3 text-sm outline-none"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>

              <div className="mt-4">
                {documentsLoading ? (
                  <EmptyCard text="Loading documents..." />
                ) : filteredDocuments.length === 0 ? (
                  <EmptyCard text="No documents matched your search or filter." />
                ) : (
                  <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                    {filteredDocuments.map((doc) => {
                      const isSelected = doc.id === selectedDocumentId;

                      return (
                        <div
                          key={doc.id}
                          className={`rounded-[22px] border p-4 transition ${
                            isSelected
                              ? "border-indigo-400 bg-indigo-500/10 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]"
                              : "border-white/10 bg-[#0b1020] hover:border-indigo-400/50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedDocumentId(doc.id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-white">
                                  {doc.filename}
                                </p>
                                <p className="mt-1 text-xs text-slate-400">
                                  {formatDate(doc.created_at)}
                                </p>
                              </div>

                              <span
                                className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${getStatusBadgeClasses(
                                  doc.status
                                )}`}
                              >
                                {doc.status}
                              </span>
                            </div>

                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                              <MiniInfo label="Chunks" value={String(doc.chunk_count ?? 0)} />
                              <MiniInfo
                                label="Embedded"
                                value={String(doc.embedded_chunk_count ?? 0)}
                              />
                            </div>
                          </button>

                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedDocumentId(doc.id)}
                              className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5"
                            >
                              Open
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteDocument(doc.id)}
                              disabled={deleteLoadingId === doc.id}
                              className="rounded-xl border border-rose-500/30 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
                            >
                              {deleteLoadingId === doc.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel
              title="Selected Document"
              subtitle={
                selectedDocumentDetail
                  ? "Metadata, preview, and processing summary"
                  : "Choose a document from the left panel"
              }
              actions={
                selectedDocumentId ? (
                  <button
                    type="button"
                    onClick={handleReprocessDocument}
                    disabled={reprocessLoading}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {reprocessLoading ? "Reprocessing..." : "Reprocess"}
                  </button>
                ) : null
              }
            >
              {detailLoading ? (
                <EmptyCard text="Loading selected document..." />
              ) : !selectedDocumentDetail ? (
                <EmptyCard text="No document selected yet." />
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-semibold text-white">
                          {selectedDocumentDetail.filename}
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                          Uploaded {formatDate(selectedDocumentDetail.created_at)}
                        </p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeClasses(
                          selectedDocumentDetail.status
                        )}`}
                      >
                        {selectedDocumentDetail.status}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <MetricTile
                        label="Text Length"
                        value={String(selectedDocumentDetail.text_length ?? 0)}
                      />
                      <MetricTile
                        label="Chunk Count"
                        value={String(selectedDocumentDetail.chunk_count ?? 0)}
                      />
                      <MetricTile
                        label="Embedded Chunks"
                        value={String(selectedDocumentDetail.embedded_chunk_count ?? 0)}
                      />
                      <MetricTile
                        label="Detected Type"
                        value={documentInsights?.document_type || "unknown"}
                      />
                    </div>

                    {selectedDocumentDetail.error_message && (
                      <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                        {selectedDocumentDetail.error_message}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setShowPreview((prev) => !prev)}
                        className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300 transition hover:bg-white/5"
                      >
                        {showPreview ? "Hide Preview" : "Show Preview"}
                      </button>
                    </div>
                  </div>

                  {showPreview && (
                    <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                      <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Document Preview</h3>
                        <span className="text-xs text-slate-400">
                          First extracted text sample
                        </span>
                      </div>

                      <div className="max-h-[360px] overflow-y-auto rounded-2xl border border-white/10 bg-[#09101e] p-4 text-sm leading-7 text-slate-200">
                        {selectedDocumentDetail.preview?.trim() ? (
                          selectedDocumentDetail.preview
                        ) : (
                          <span className="text-slate-400">No preview available.</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="Smart Insights" subtitle="Summary, dates, contacts, and organizations">
              {!documentInsights ? (
                <EmptyCard text="Upload or select a processed document to view smart insights." />
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                    <p className="mb-2 text-sm font-medium text-slate-400">Summary</p>
                    <p className="text-sm leading-7 text-slate-200">
                      {documentInsights.summary || "No summary available."}
                    </p>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                      <p className="mb-3 text-sm font-medium text-slate-400">Key Dates</p>
                      {documentInsights.key_dates.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {documentInsights.key_dates.map((item) => (
                            <span
                              key={item}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                            >
                              {item}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No dates detected.</p>
                      )}
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                      <p className="mb-3 text-sm font-medium text-slate-400">Contacts</p>
                      {documentInsights.contacts.length > 0 ? (
                        <div className="space-y-2">
                          {documentInsights.contacts.map((item) => (
                            <div
                              key={item}
                              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                            >
                              {item}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No contacts detected.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                    <p className="mb-3 text-sm font-medium text-slate-400">Organizations</p>
                    {documentInsights.organizations.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {documentInsights.organizations.map((item) => (
                          <span
                            key={item}
                            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400">No organizations detected.</p>
                    )}
                  </div>
                </div>
              )}
            </Panel>
          </div>

          <div className="space-y-6">
            <Panel title="Ask Questions" subtitle="Use suggestions or write your own question">
              <form onSubmit={handleAskQuestion} className="space-y-4">
                <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                    Selected document
                  </p>
                  <p className="mt-2 truncate text-sm font-medium text-white">
                    {selectedDocument?.filename || "No document selected"}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-slate-300">Suggested Questions</p>
                  <div className="flex flex-wrap gap-2">
                    {quickActions.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setQuestion(item)}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition hover:border-indigo-400 hover:bg-indigo-500/10"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedDocumentDetail?.status !== "ready" && selectedDocumentDetail && (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                    This document is not ready yet. Current status: {selectedDocumentDetail.status}
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">Question</label>
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={7}
                    className="w-full rounded-[24px] border border-white/10 bg-[#0b1020] px-4 py-4 text-sm leading-7 outline-none transition focus:border-indigo-400"
                    placeholder="Ask anything about the selected document."
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canAskQuestion}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3.5 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {qaLoading ? "Asking..." : "Ask Question"}
                </button>
              </form>
            </Panel>

            <Panel
              title="Answer"
              subtitle="Grounded response with evidence and sources"
              actions={
                qaResult?.answer ? (
                  <button
                    onClick={handleCopyAnswer}
                    disabled={copyingAnswer}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
                  >
                    {copyingAnswer ? "Copying..." : "Copy Answer"}
                  </button>
                ) : null
              }
            >
              {!qaResult ? (
                <EmptyCard text="Ask a question after selecting a ready document to see the answer here." />
              ) : (
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-indigo-400/20 bg-indigo-500/10 p-5">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {qaResult.retrieval_mode && (
                        <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-slate-200">
                          {qaResult.retrieval_mode}
                        </span>
                      )}
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] text-slate-200">
                        {qaResult.used_fallback ? "Fallback used" : qaResult.used_model || "AI answer"}
                      </span>
                    </div>

                    <p className="text-sm leading-8 text-slate-100">{qaResult.answer}</p>
                  </div>

                  {qaResult.evidence && (
                    <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                      <p className="mb-3 text-sm font-medium text-slate-400">Evidence</p>
                      <div className="max-h-[220px] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-slate-200">
                        {qaResult.evidence}
                      </div>
                    </div>
                  )}

                  <div className="rounded-[24px] border border-white/10 bg-[#0b1020] p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-sm font-medium text-slate-400">Sources</p>
                      <span className="text-xs text-slate-500">
                        {qaResult.sources?.length ?? 0} source(s)
                      </span>
                    </div>

                    {!qaResult.sources?.length ? (
                      <p className="text-sm text-slate-400">No source previews returned.</p>
                    ) : (
                      <div className="space-y-3">
                        {qaResult.sources.map((source, index) => (
                          <div
                            key={`${source.chunk_id}-${index}`}
                            className="rounded-2xl border border-white/10 bg-white/5 p-4"
                          >
                            <p className="mb-2 text-xs text-slate-400">
                              Source {index + 1} • Chunk {source.chunk_id} • Score {source.score}
                            </p>
                            <p className="whitespace-pre-wrap text-sm leading-7 text-slate-200">
                              {source.preview}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Panel>

            <Panel title="Recent Questions" subtitle="Click any item to restore it into the answer panel">
              {questionHistory.length === 0 ? (
                <EmptyCard text="No questions asked for this document yet." />
              ) : (
                <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                  {questionHistory.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setQuestion(item.question);
                        setQaResult({
                          document_id: selectedDocumentId || 0,
                          filename: selectedDocument?.filename || "",
                          question: item.question,
                          answer: item.answer,
                          evidence: "This answer was restored from question history. Ask again to regenerate sources and fresh retrieval evidence.",
                          sources: [],
                          used_model: item.used_model,
                          used_fallback: item.used_fallback,
                          retrieval_mode: item.retrieval_mode,
                          created_at: item.created_at,
                        });
                      }}
                      className="w-full rounded-[22px] border border-white/10 bg-[#0b1020] p-4 text-left transition hover:border-indigo-400/60 hover:bg-[#10182e]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500">{formatDate(item.created_at)}</p>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-slate-300">
                          {item.retrieval_mode || "history"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-white">{item.question}</p>
                      <p className="mt-2 line-clamp-4 text-sm leading-7 text-slate-300">
                        {item.answer}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-[#121a2f]/90 p-5 shadow-2xl backdrop-blur xl:p-6">
      {(title || subtitle || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-xl font-semibold text-white">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

function FeatureCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0b1020]/80 p-5">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-7 text-slate-400">{text}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-[#0b1020]/85 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{helper}</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-200">{value}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[24px] border border-dashed border-white/10 bg-[#0b1020] p-5 text-sm leading-7 text-slate-400">
      {text}
    </div>
  );
}