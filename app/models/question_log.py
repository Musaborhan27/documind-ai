from sqlalchemy import Column, Integer, ForeignKey, Text, String, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.database import Base


class QuestionLog(Base):
    __tablename__ = "question_logs"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    evidence = Column(Text, nullable=True)

    retrieval_mode = Column(String, nullable=True)
    used_model = Column(String, nullable=True)
    used_fallback = Column(String, nullable=False, default="true")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="question_logs")
    user = relationship("User")