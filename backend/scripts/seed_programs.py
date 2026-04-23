#!/usr/bin/env python3
"""
Seed default allowed programs into DB.
Run once after database setup:
  uv run python scripts/seed_programs.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import select
from app.database import get_session
from app.models import AllowedProgram

DEFAULTS = [
    ("chrome",    "Google Chrome",     "🌐", "Браузер",                  "chrome.exe"),
    ("word",      "Microsoft Word",    "📝", "Текстовый редактор",       "WINWORD.EXE"),
    ("excel",     "Microsoft Excel",   "📊", "Таблицы",                  "EXCEL.EXE"),
    ("ppt",       "PowerPoint",        "📑", "Презентации",              "POWERPNT.EXE"),
    ("paint",     "Paint",             "🎨", "Графический редактор",     "mspaint.exe"),
    ("calc",      "Калькулятор",       "🧮", "Стандартная утилита",      "calc.exe"),
    ("notepad",   "Блокнот",           "🗒",  "Текстовый файл",           "notepad.exe"),
    ("scratch",   "Scratch",           "🐱", "Визуальное программирование", "Scratch.exe"),
    ("vscode",    "VS Code",           "💻", "Редактор кода",            "Code.exe"),
]

with get_session() as session:
    added = 0
    for slug, name, icon, desc, exe in DEFAULTS:
        existing = session.exec(select(AllowedProgram).where(AllowedProgram.slug == slug)).first()
        if existing:
            continue
        program = AllowedProgram(
            slug=slug,
            name=name,
            icon=icon,
            description=desc,
            windows_path=exe,
            is_active=True,
        )
        session.add(program)
        added += 1
    session.commit()

print(f"Added {added} programs (skipped existing).")
