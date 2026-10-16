"""Regression tests using fictional entries and temporary storage only."""

import ast
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest
from html.parser import HTMLParser
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
DIARY = ROOT / "sites/apcsp/site/practice/cli-diary/diary.py"
TUTORIAL = DIARY.with_name("index.html")
spec = importlib.util.spec_from_file_location("diary", DIARY)
diary = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diary)


class CodeBlocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks = {}
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "pre":
            self.current = dict(attrs).get("id")
            if self.current:
                self.blocks[self.current] = ""

    def handle_data(self, data):
        if self.current:
            self.blocks[self.current] += data

    def handle_endtag(self, tag):
        if tag == "pre":
            self.current = None


class DiaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name) / ".csp-diary"
        self.file = self.directory / "entries.jsonl"
        self.paths = patch.multiple(diary, DATA_DIR=self.directory, DATA_FILE=self.file)
        self.paths.start()
        self.addCleanup(self.paths.stop)

    def interact(self, function, answers, *args):
        output = io.StringIO()
        with patch("builtins.input", side_effect=answers), contextlib.redirect_stdout(output):
            function(*args)
        return output.getvalue()

    def seed(self):
        entries = [
            {"created_at": "2026-09-29T10:30+08:00", "text": text}
            for text in ("Alpha", "Python B", "Python C")
        ]
        entries[0]["tag"] = "preserve existing fields"
        diary.write_entries(entries)
        return entries

    def test_empty_startup_and_invalid_menu_then_quit(self):
        output = self.interact(diary.main, ["bad", "3", "4", "1", "missing", "5"])
        self.assertLess(output.index("No entries yet."), output.index("CLI Diary:"))
        self.assertIn("Choose 1, 2, 3, 4, or 5.", output)
        self.assertIn("No matching entries.", output)
        self.assertIn("Goodbye.", output)
        self.assertFalse(self.file.exists())

    def test_add_blank_and_unicode(self):
        self.interact(diary.add_entry, ["   "])
        self.assertFalse(self.file.exists())
        self.interact(diary.add_entry, ["课堂虚构 Python 日记"])
        self.assertEqual(diary.load_entries()[0]["text"], "课堂虚构 Python 日记")
        self.assertIn("课堂虚构", self.file.read_text())

    def test_search_edit_maps_second_result_to_third_saved_entry(self):
        original = self.seed()
        self.interact(diary.search_entries, ["pYtHoN", "2", "1", "Python C revised"], diary.load_entries())
        saved = diary.load_entries()
        self.assertEqual(saved[:2], original[:2])
        self.assertEqual(saved[2], dict(original[2], text="Python C revised"))

    def test_search_delete_and_repeated_operations_refresh_positions(self):
        original = self.seed()
        self.interact(diary.main, ["1", "python", "1", "2", "y", "3", "2", "Y", "3", "1", "y", "2", "New fictional entry", "5"])
        self.assertEqual([e["text"] for e in diary.load_entries()], ["New fictional entry"])
        self.assertEqual(original[1]["text"], "Python B")

    def test_duplicate_records_delete_only_selected_occurrence(self):
        duplicate = {"created_at": "same time", "text": "same fictional entry"}
        diary.write_entries([duplicate, {"created_at": "middle", "text": "keep me"}, duplicate])
        self.interact(diary.search_entries, ["same fictional", "2", "2", "y"], diary.load_entries())
        self.assertEqual([e["created_at"] for e in diary.load_entries()], ["same time", "middle"])

    def test_invalid_and_cancelled_actions_leave_file_unchanged(self):
        self.seed()
        before = self.file.read_bytes()
        for number in ("abc", "0", "-1", "99", "1.5", "²", ""):
            self.interact(diary.search_entries, ["python", number], diary.load_entries())
            self.interact(diary.main, ["3", number, "5"])
        for answers in ([""], ["absent"], ["python", "1", ""], ["python", "1", "9"], ["python", "1", "1", "   "], ["python", "1", "2", ""], ["python", "1", "2", "no"]):
            self.interact(diary.search_entries, answers, diary.load_entries())
        self.assertEqual(self.file.read_bytes(), before)

    def test_view_first_entry_and_edit_preserves_metadata(self):
        original = self.seed()
        output = self.interact(diary.main, ["4", "1", "1", "Edited Alpha", "5"])
        self.assertIn("Created: " + original[0]["created_at"], output)
        self.assertEqual(diary.load_entries()[0], dict(original[0], text="Edited Alpha"))

    def test_last_deletion_persists_and_add_still_works(self):
        self.interact(diary.add_entry, ["Only fictional entry"])
        self.interact(diary.main, ["3", "1", "y", "5"])
        self.assertEqual(self.file.read_bytes(), b"")
        output = self.interact(diary.main, ["2", "Another", "5"])
        self.assertIn("No entries yet.", output)
        self.assertEqual(diary.load_entries()[0]["text"], "Another")

    def test_many_menu_operations_do_not_recurse(self):
        self.interact(diary.main, ["bad"] * 1100 + ["5"])

    def test_real_process_restart_uses_only_temporary_home(self):
        env = dict(os.environ, HOME=self.temp.name, PYTHONDONTWRITEBYTECODE="1")
        def run(answers):
            result = subprocess.run([sys.executable, str(DIARY)], input="\n".join(answers) + "\n", text=True, capture_output=True, env=env, cwd=self.temp.name, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            return result.stdout
        run(["2", "Fictional Python 中文", "5"])
        output = run(["5"])
        self.assertLess(output.index("Fictional Python 中文"), output.index("CLI Diary:"))
        run(["1", "python", "1", "1", "Revised 中文", "5"])
        self.assertIn("Revised 中文", run(["5"]))
        run(["3", "1", "y", "5"])
        self.assertIn("No entries yet.", run(["5"]))

    def test_malformed_existing_file_fails_without_overwriting(self):
        self.directory.mkdir()
        self.file.write_text('{"damaged":\n')
        before = self.file.read_bytes()
        with self.assertRaises(json.JSONDecodeError):
            diary.main()
        self.assertEqual(self.file.read_bytes(), before)

    def test_live_frq_section_is_preserved_and_matches_current_program(self):
        page = TUTORIAL.read_text()
        self.assertIn('id="frq"', page)
        for heading in ("先了解考试流程", "WR1 ·", "WR2(a) ·", "WR2(b) ·", "WR2(c) ·", "交卷前自查"):
            self.assertIn(heading, page)
        self.assertNotIn("show_entries(load_entries())", page)
        self.assertNotIn("show_entries(matches)", page)
        self.assertNotIn("Enter a search word.", page)
        for entries, indices, expected in (([], None, "No entries yet. Add one to begin."), ([], [], "No matching entries.")):
            message = "No matching entries." if indices is not None else "No entries yet. Add one to begin."
            output = self.interact(diary.show_entries, [], entries, indices, message)
            self.assertEqual(output.strip(), expected)
        self.assertIn('indices[number - 1]', page)

    def test_tutorial_progression_runs_and_procedures_match_reference(self):
        parser = CodeBlocks()
        parser.feed(TUTORIAL.read_text())
        blocks = parser.blocks
        def replace_branch(source, start, end, replacement):
            a, b = source.index(start), source.index(end)
            return source[:a] + textwrap.indent(replacement, "    ") + "\n" + source[b:]
        menu = blocks["stage-menu"]
        self.interact(lambda: exec(menu, {}), ["2", "bad", "5"])
        memory = menu.replace('    print("No entries yet. Add one to begin.")', textwrap.indent(blocks["stage-memory-list"], "    "))
        memory = replace_branch(memory, '    elif choice == "2":', '    elif choice == "3":', blocks["stage-memory"])
        output = self.interact(lambda: exec(memory, {}), ["2", "Fictional example", "2", "", "5"])
        self.assertIn("1. Fictional example", output)
        storage = blocks["stage-storage"].replace('Path.home() / ".csp-diary"', repr(str(self.directory)))
        # Keep DATA_DIR a Path while replacing only its classroom storage location.
        storage = storage.replace('DATA_DIR = ' + repr(str(self.directory)), 'DATA_DIR = Path(' + repr(str(self.directory)) + ')')
        persistent = memory.replace("entries = []\n", "", 1).replace("entries.append(text)", "save_entry(text)")
        a = persistent.index('    print("\\nYour diary entries:")')
        b = persistent.index('    print("\\nCLI Diary:')
        persistent = storage + "\n\n" + persistent[:a] + textwrap.indent(blocks["stage-list"], "    ") + "\n" + persistent[b:]
        searched = replace_branch(persistent, '    if choice == "1":', '    elif choice == "2":', blocks["stage-search"])
        output = self.interact(lambda: exec(searched, {}), ["2", "Fictional Python", "1", "python", "1", "absent", "1", "", "5"])
        self.assertIn("Fictional Python", output)
        self.assertIn("No matching entries.", output)
        self.assertIn("Search cancelled.", output)
        output = self.interact(lambda: exec(searched, {}), ["5"])
        self.assertIn("Fictional Python", output)
        reference = ast.parse(DIARY.read_text())
        functions = {node.name: ast.dump(node) for node in reference.body if isinstance(node, ast.FunctionDef)}
        for name in ("stage-rewrite", "stage-choose", "stage-edit", "stage-delete"):
            node = ast.parse(blocks[name]).body[0]
            self.assertEqual(ast.dump(node), functions[node.name])
        # The selection snippet must use the returned original index, including zero.
        for index in (0, 2, None):
            calls = []
            exec(blocks["stage-selection"], {"indices": [2, 4], "entries": [], "choose_entry": lambda _: index, "view_entry": lambda entries, position: calls.append(position)})
            self.assertEqual(calls, [] if index is None else [index])


if __name__ == "__main__":
    unittest.main()
