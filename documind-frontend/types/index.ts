export type User = {
    id: number;
    email: string;
    full_name: string;
  };
  
  export type RegisterResponse = {
    message: string;
    user: User;
  };
  
  export type DocumentItem = {
    id: number;
    filename: string;
    stored_filename: string;
    content_type: string | null;
    owner_id: number;
    text_length: number;
    chunk_count?: number;
    embedded_chunk_count?: number;
    status: "processing" | "ready" | "failed";
    error_message?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
  };
  
  export type DocumentDetail = {
    id: number;
    filename: string;
    stored_filename: string;
    content_type: string | null;
    owner_id: number;
    text_length: number;
    chunk_count?: number;
    embedded_chunk_count?: number;
    status: "processing" | "ready" | "failed";
    error_message?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    preview: string;
  };
  
  export type DocumentInsights = {
    document_type: string;
    summary: string;
    key_dates: string[];
    contacts: string[];
    organizations: string[];
    suggested_questions: string[];
  };
  
  export type UploadResponse = {
    message: string;
    document: DocumentDetail;
  };
  
  export type MessageResponse = {
    message: string;
    document_id?: number;
  };
  
  export type QaSource = {
    chunk_id: number;
    score: number;
    preview: string;
  };
  
  export type QaResponse = {
    id?: number;
    document_id: number;
    filename: string;
    question: string;
    answer: string;
    evidence?: string;
    sources: QaSource[];
    used_model: string | null;
    used_fallback: boolean;
    retrieval_mode?: string;
    created_at?: string;
  };
  
  export type QuestionHistoryItem = {
    id: number;
    question: string;
    answer: string;
    retrieval_mode: string;
    used_model: string | null;
    used_fallback: boolean;
    created_at: string;
  };
  
  export type QuestionHistoryResponse = {
    document_id: number;
    filename: string;
    count: number;
    history: QuestionHistoryItem[];
  };