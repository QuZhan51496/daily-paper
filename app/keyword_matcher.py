def filter_papers_by_keywords(papers: list[dict], keywords_str: str) -> list[dict]:
    """Filter papers by comma-separated keywords. Matches against title + abstract (case-insensitive)."""
    keywords = [k.strip().lower() for k in keywords_str.split(",") if k.strip()]
    if not keywords:
        return papers
    return [p for p in papers if _matches(p, keywords)]


def _matches(paper: dict, keywords: list[str]) -> bool:
    text = (paper.get("title", "") + " " + paper.get("abstract", "")).lower()
    return any(kw in text for kw in keywords)
