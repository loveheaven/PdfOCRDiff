"""Text diff service using difflib."""

import difflib


def compute_diff(text_a: str, text_b: str) -> list[dict]:
    """
    Compute character-level diff between text_a and text_b.

    Returns a list of diff segments:
        {"type": "equal"|"delete"|"insert"|"replace", ...}
    - equal:   {"type":"equal",   "text": "..."}
    - delete:  {"type":"delete",  "text": "..."}       (only in A)
    - insert:  {"type":"insert",  "text": "..."}       (only in B)
    - replace: {"type":"replace", "text_a":"...", "text_b":"..."}
    """
    matcher = difflib.SequenceMatcher(None, text_a, text_b)
    diffs = []

    for op, a_start, a_end, b_start, b_end in matcher.get_opcodes():
        if op == "equal":
            diffs.append({"type": "equal", "text": text_a[a_start:a_end]})
        elif op == "delete":
            diffs.append({"type": "delete", "text": text_a[a_start:a_end]})
        elif op == "insert":
            diffs.append({"type": "insert", "text": text_b[b_start:b_end]})
        elif op == "replace":
            diffs.append({
                "type": "replace",
                "text_a": text_a[a_start:a_end],
                "text_b": text_b[b_start:b_end],
            })

    return diffs
