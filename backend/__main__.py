"""Start the API using the port configured in the project .env file."""
import os
from pathlib import Path

import uvicorn
from dotenv import load_dotenv


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    load_dotenv(root / ".env")
    load_dotenv(root / "backend" / ".env")
    port = int(os.getenv("PORT", "8000"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be between 1 and 65535")
    uvicorn.run("backend.main:app", host=os.getenv("HOST", "127.0.0.1"), port=port)
