import { readdir, readFile } from "node:fs/promises"; // /promise version gives us a Promise-based API, so we can use await
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "./client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrationsDirectory = join(__dirname, "migrations"); // for bun specific just use join(import.meta.dir, "migrations")

async function migrate() {
  console.log("Running database migrations...");

  // Create migration tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    `;

  // Get already-applied migrations
  const appliedMigrations = await sql<{ version: string }[]>`
    SELECT version
    FROM schema_migrations
    ORDER BY version
  `;

  const appliedVersions = new Set(
    appliedMigrations.map((migration) => migration.version),
  );

  // Find all .sql migration files
  const files = await readdir(migrationsDirectory);
  const migrationFiles = files
    .filter((file) => file.endsWith(".sql") && !file.startsWith("._"))
    .sort();

  for (const file of migrationFiles) {
    const match = file.match(/^(\d+)_.*\.sql$/);

    if (!match) {
      throw new Error(
        `Invalid migration filename: ${file}. Expected format 001_name.sql`,
      );
    }

    const version = match[1];
    if (!version) {
      throw new Error(`Invalid migration filename: ${file}`);
    }

    if (appliedVersions.has(version)) {
      console.log(`Skipping ${file} - already applied.`);
      continue;
    }

    console.log(`Applying ${file}...`);

    const migrationPath = join(migrationsDirectory, file);
    const migrationSql = await readFile(migrationPath, "utf8"); // bun specific await Bun.file(migrationPath).text()

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);

      await transaction`
        INSERT INTO schema_migrations (version, name)
        VALUES (${version}, ${file})
      `;
    });

    console.log(`Applied ${file}`);
  }

  console.log("Database migrations completed.");
}

try {
  await migrate();
} catch (error) {
  console.error("Database migration failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
} finally {
  await sql.end();
}
