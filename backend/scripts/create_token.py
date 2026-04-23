#!/usr/bin/env python3
"""
Admin CLI: bootstrap admin user and create PC tokens without Telegram auth.

First run (no admin user yet):
  uv run python scripts/create_token.py --telegram-id 123456789 --name "PC-01"

Subsequent runs:
  uv run python scripts/create_token.py --name "PC-02"
  uv run python scripts/create_token.py --name "PC-03"
"""
import argparse
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlmodel import select
from app.database import get_session
from app.models import Token, User
from app.services.token_service import generate_token, hash_token


def main() -> None:
    parser = argparse.ArgumentParser(description="Create agent token for a school PC")
    parser.add_argument("--telegram-id", type=int, help="Admin Telegram ID (required on first run)")
    parser.add_argument("--name", required=True, help="Token label, e.g. PC-01 or Cabinet-3-PC-2")
    cli = parser.parse_args()

    with get_session() as session:
        admin = session.exec(select(User).where(User.is_admin == True)).first()

        if admin is None:
            if not cli.telegram_id:
                print("ERROR: No admin user found. Provide --telegram-id on first run.", file=sys.stderr)
                sys.exit(1)
            admin = User(
                telegram_id=cli.telegram_id,
                username="admin",
                full_name="Admin",
                is_admin=True,
                is_active=True,
            )
            session.add(admin)
            session.flush()
            print(f"Admin user created: telegram_id={cli.telegram_id}")

        raw = generate_token()
        token = Token(
            name=cli.name,
            token_hash=hash_token(raw),
            created_by=admin.id,
        )
        session.add(token)
        session.commit()
        session.refresh(token)

    print(f"\nToken '{token.name}' created (id={token.id})")
    print(f"\n  TOKEN: {raw}\n")
    print("Paste this token into ClassroomSetup.exe. It will NOT be shown again.")


if __name__ == "__main__":
    main()
