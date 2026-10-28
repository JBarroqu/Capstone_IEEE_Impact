"""Create any missing tables and indexes (replaces drizzle-kit push). Safe to run on every start.
It never alters or drops existing columns: for a schema change, add the column here as an explicit ALTER below."""
import asyncio

from sqlalchemy import text

from wish_api import db

# Columns added after a table first existed: (table, column, type). create_all skips existing tables, so add them here.
ADDED_COLUMNS = [("wishes", "follow_ups", "jsonb")]


async def main():
    async with db.engine().begin() as c:
        await c.run_sync(db.metadata.create_all)
        for table, col, typ in ADDED_COLUMNS:
            await c.execute(text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{col}" {typ}'))
    await db.engine().dispose()
    print("schema up to date")


asyncio.run(main())
