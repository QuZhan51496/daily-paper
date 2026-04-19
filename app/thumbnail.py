import asyncio
import logging
from pathlib import Path
from urllib.parse import quote
import httpx
import fitz  # pymupdf

logger = logging.getLogger(__name__)

THUMBNAIL_DIR = Path(__file__).parent.parent / "data" / "thumbnails"
ARXIV_PDF_URL = "https://arxiv.org/pdf/{arxiv_id}"


def _render_thumbnail(pdf_bytes: bytes, out_path: Path) -> None:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        page = doc[0]
        rect = page.rect
        clip = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y1 / 2)
        mat = fitz.Matrix(2, 2)
        pix = page.get_pixmap(matrix=mat, clip=clip)
        pix.save(str(out_path))
    finally:
        doc.close()


async def get_thumbnail_path(arxiv_id: str) -> Path | None:
    """获取论文首页上半部分缩略图，有缓存直接返回，无则生成。"""
    THUMBNAIL_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = quote(arxiv_id, safe="")
    cache_path = THUMBNAIL_DIR / f"{safe_name}.png"

    if cache_path.exists():
        return cache_path

    try:
        url = ARXIV_PDF_URL.format(arxiv_id=arxiv_id)
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                logger.warning(f"PDF download failed for {arxiv_id}: {resp.status_code}")
                return None

        await asyncio.to_thread(_render_thumbnail, resp.content, cache_path)
        logger.info(f"Thumbnail generated for {arxiv_id}")
        return cache_path

    except Exception as e:
        logger.warning(f"Thumbnail generation failed for {arxiv_id}: {e}")
        return None
