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


def write_entries(entries):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with DATA_FILE.open("w", encoding="utf-8") as file:
        for entry in entries:
            file.write(json.dumps(entry, ensure_ascii=False) + "\n")


def add_entry():
    text = input("Write one fictional diary entry (Enter to cancel): ").strip()
    if not text:
        print("Nothing was saved.")
        return
    save_entry(text)
    print("Entry saved locally.")


def show_entries(entries, indices=None, empty_message="No entries yet. Add one to begin."):
    if indices is None:
        indices = list(range(len(entries)))
    if not indices:
        print(empty_message)
        return
    for number, index in enumerate(indices, start=1):
        entry = entries[index]
        print(f'{number}. [{entry["created_at"]}] {entry["text"]}')


def choose_entry(indices):
    if not indices:
        return None
    choice = input("Entry number (Enter to cancel): ").strip()
    if not choice:
        print("Cancelled.")
        return None
    try:
        number = int(choice)
    except ValueError:
        print("Choose a displayed entry number.")
        return None
    if not 1 <= number <= len(indices):
        print("Choose a displayed entry number.")
        return None
    return indices[number - 1]


def edit_entry(entries, index):
    text = input("Replacement text (Enter to cancel): ").strip()
    if not text:
        print("Nothing was changed.")
        return
    entries[index]["text"] = text
    write_entries(entries)
    print("Entry updated locally.")


def delete_entry(entries, index):
    entry = entries[index]
    print(f'Delete [{entry["created_at"]}] {entry["text"]}')
    confirm = input("Type y to delete (Enter to cancel): ").strip().casefold()
    if confirm != "y":
        print("Nothing was deleted.")
        return
    del entries[index]
    write_entries(entries)
    print("Entry deleted locally.")


def view_entry(entries, index):
    entry = entries[index]
    print(f'\nCreated: {entry["created_at"]}\n{entry["text"]}')
    action = input("1 Edit | 2 Delete | Enter Return: ").strip()
    if action == "1":
        edit_entry(entries, index)
    elif action == "2":
        delete_entry(entries, index)
    elif action:
        print("Choose 1, 2, or Enter. Returning to the diary list.")


def search_entries(entries):
    term = input("Search word (Enter to cancel): ").strip().casefold()
    if not term:
        print("Search cancelled.")
        return
    indices = [
        index for index, entry in enumerate(entries)
        if term in entry["text"].casefold()
    ]
    print("\nSearch results:")
    show_entries(entries, indices, "No matching entries.")
    index = choose_entry(indices)
    if index is not None:
        view_entry(entries, index)


def main():
    while True:
        entries = load_entries()
        print("\nYour diary entries:")
        show_entries(entries)
        print("\nCLI Diary: 1 Search | 2 Add | 3 Delete | 4 View/edit | 5 Quit")
        choice = input("Choose 1–5: ").strip()
        if choice == "1":
            search_entries(entries)
        elif choice == "2":
            add_entry()
        elif choice in ("3", "4"):
            index = choose_entry(list(range(len(entries))))
            if index is not None:
                if choice == "3":
                    delete_entry(entries, index)
                else:
                    view_entry(entries, index)
        elif choice == "5":
            print("Goodbye.")
            break
        else:
            print("Choose 1, 2, 3, 4, or 5.")


if __name__ == "__main__":
    main()
