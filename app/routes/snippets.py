from fastapi import APIRouter, HTTPException
from typing import Optional
from app.storage import storage
from app.models import SnippetItem

router = APIRouter(prefix="/api/snippets", tags=["snippets"])

@router.get("")
def list_snippets(tag: Optional[str] = None):
    snippets = storage.get_snippets()
    if tag:
        snippets = [s for s in snippets if tag in s.get("tags", [])]
    return snippets

@router.post("")
def create_snippet(snippet: SnippetItem):
    created = storage.add_snippet(snippet)
    return {"success": True, "snippet": created}

@router.put("/{snippet_id}")
def update_snippet(snippet_id: str, snippet: SnippetItem):
    updated = storage.update_snippet(snippet_id, snippet)
    if not updated:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return {"success": True, "snippet": updated}

@router.delete("/{snippet_id}")
def delete_snippet(snippet_id: str):
    deleted = storage.delete_snippet(snippet_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Snippet not found")
    return {"success": True}
