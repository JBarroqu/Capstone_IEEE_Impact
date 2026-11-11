"""Text from uploaded documents (from Growth-Validation main.py, used for evidence files and resumes). Type comes from
magic bytes, never from the browser's claimed type. Capped at 12,000 characters."""
import io

MAX_TEXT = 12_000
PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TXT = "text/plain"
IMAGES = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg"}


def sniff(data: bytes) -> str | None:
    if data[:5] == b"%PDF-":
        return PDF
    if data[:4] == b"PK\x03\x04" and b"word/" in data[:4000]:
        return DOCX
    for magic, mime in IMAGES.items():
        if data.startswith(magic):
            return mime
    try:
        data[:4000].decode("utf-8")
        return TXT if b"\x00" not in data[:4000] else None
    except UnicodeDecodeError:
        return None


def extract_text(data: bytes, mime: str) -> str:
    if mime == PDF:
        from pypdf import PdfReader

        text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages[:15])
    elif mime == DOCX:
        import docx

        text = "\n".join(p.text for p in docx.Document(io.BytesIO(data)).paragraphs)
    elif mime == TXT:
        text = data.decode("utf-8", errors="replace")
    else:
        return ""
    return text[:MAX_TEXT].strip()
