import fitz
import sys, os

paths = [
    r"d:\Catlogue\PDF\Ready to Print.pdf",
    r"d:\Logo & Intro Video\2.pdf",
]
for p in paths:
    print("=" * 80)
    print("FILE:", p)
    print("=" * 80)
    if not os.path.exists(p):
        print("MISSING")
        continue
    doc = fitz.open(p)
    print("Pages:", doc.page_count)
    for i, page in enumerate(doc):
        text = page.get_text("text")
        print(f"\n--- Page {i+1} ---")
        print(text[:4000])
    doc.close()
