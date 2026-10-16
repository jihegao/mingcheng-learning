"""A small local CLI diary for classroom practice. Use fictional entries."""

import json
from datetime import datetime
from pathlib import Path


DATA_DIR = Path.home() / ".csp-diary"
DATA_FILE = DATA_DIR / "entries.jsonl"


def load_entries():
    if not DATA_FILE.exists():
        return []
    with DATA_FILE.open("r", encoding="utf-8") as file:
        return [json.loads(line) for line in file if line.strip()]


def save_entry(text):
    entry = {
        "created_at": datetime.now().astimezone().isoformat(timespec="minutes"),
        "text": text,
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("a", encoding="utf-8") as file:
        file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def add_entry():
    text = input("Write one fictional diary entry: ").strip()
    if not text:
        print("Nothing was saved.")
        return
    save_entry(text)
    print("Entry saved locally.")


def show_entries(entries):
    if not entries:
        print("No matching entries.")
        return
    for number, entry in enumerate(entries, start=1):
        print(f'{number}. [{entry["created_at"]}] {entry["text"]}')


def search_entries():
    term = input("Search word: ").strip().casefold()
    if not term:
        print("Enter a search word.")
        return
    matches = [
        entry for entry in load_entries() if term in entry["text"].casefold()
    ]
    show_entries(matches)


def main():
    while True:
        print("\nCLI Diary: 1 Add | 2 List | 3 Search | 4 Quit")
        choice = input("Choose 1–4: ").strip()
        if choice == "1":
            add_entry()
        elif choice == "2":
            show_entries(load_entries())
        elif choice == "3":
            search_entries()
        elif choice == "4":
            print("Goodbye.")
            break
        else:
            print("Choose 1, 2, 3, or 4.")


if __name__ == "__main__":
    main()
