"""EPUB parsing service – extract text from EPUB files."""

import ebooklib
from ebooklib import epub
from bs4 import BeautifulSoup


def parse_epub(epub_path: str) -> list[dict]:
    """
    Parse an EPUB file and extract chapter texts.

    Returns a list of dicts: [{"title": str, "text": str}, ...]
    """
    book = epub.read_epub(epub_path)
    chapters = []

    for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
        soup = BeautifulSoup(item.get_content(), "lxml")
        text = soup.get_text(separator="\n", strip=True)
        if not text.strip():
            continue

        title = ""
        title_tag = soup.find(["h1", "h2", "h3", "title"])
        if title_tag:
            title = title_tag.get_text(strip=True)

        chapters.append({
            "title": title or item.get_name(),
            "text": text,
        })

    return chapters
