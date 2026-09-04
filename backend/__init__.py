"""Loads .env before any submodule reads its required env vars (DATABASE_URL, GROQ_API_KEY, etc.)."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
