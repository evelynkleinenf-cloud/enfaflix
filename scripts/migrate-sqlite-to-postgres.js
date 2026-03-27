require("dotenv").config();

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { Pool } = require("pg");

const sqlitePath = path.join(__dirname, "..", "data", "enfaflix.sqlite");
const schemaPath = path.join(__dirname, "..", "supabase", "schema.sql");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL precisa estar definida para migrar para Postgres.");
}

if (!fs.existsSync(sqlitePath)) {
  throw new Error(`Banco SQLite nao encontrado em ${sqlitePath}`);
}

if (!fs.existsSync(schemaPath)) {
  throw new Error(`Schema SQL nao encontrado em ${schemaPath}`);
}

const sqlite = new sqlite3.Database(sqlitePath);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false }
});

function sqliteAll(sql) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, [], (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function ensureSchema() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  await pool.query(schema);
}

async function resetTables(client) {
  await client.query(`
    TRUNCATE TABLE
      course_materials,
      certificates,
      course_evaluations,
      lesson_completions,
      promo_codes,
      orders,
      enrollments,
      lessons,
      courses,
      users
    RESTART IDENTITY CASCADE
  `);
}

async function copyTable(client, tableName, columns) {
  const rows = await sqliteAll(`SELECT ${columns.join(", ")} FROM ${tableName}`);
  if (rows.length === 0) {
    return 0;
  }

  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = columns.map((column) => row[column]);
    await client.query(sql, values);
  }

  return rows.length;
}

async function syncIdentity(client, tableName) {
  await client.query(`
    SELECT setval(
      pg_get_serial_sequence('${tableName}', 'id'),
      COALESCE((SELECT MAX(id) FROM ${tableName}), 1),
      true
    )
  `);
}

async function main() {
  console.log("Aplicando schema no Postgres...");
  await ensureSchema();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await resetTables(client);

    const tables = [
      ["users", ["id", "nome", "email", "password_hash", "is_admin", "created_at"]],
      ["courses", ["id", "title", "description", "price_cents", "created_at"]],
      ["lessons", ["id", "course_id", "title", "content", "text_file_path", "video_path", "youtube_url", "pdf_path", "position", "created_at"]],
      ["enrollments", ["id", "user_id", "course_id", "enrolled_at"]],
      ["orders", ["id", "user_id", "course_id", "status", "amount_cents", "original_amount_cents", "discount_cents", "promo_code", "group_reference", "reference", "payment_note", "created_at", "approved_at"]],
      ["promo_codes", ["id", "code", "title", "description", "discount_type", "discount_value", "min_courses", "eligible_course_ids", "max_redemptions", "expires_at", "active", "created_at"]],
      ["lesson_completions", ["id", "user_id", "lesson_id", "completed_at"]],
      ["course_evaluations", ["id", "user_id", "course_id", "rating", "answers_json", "comment", "created_at"]],
      ["certificates", ["id", "user_id", "course_id", "certificate_code", "issued_at"]],
      ["course_materials", ["id", "course_id", "title", "file_path", "created_at"]]
    ];

    for (const [tableName, columns] of tables) {
      const copied = await copyTable(client, tableName, columns);
      if (columns.includes("id")) {
        await syncIdentity(client, tableName);
      }
      console.log(`${tableName}: ${copied} registro(s) migrado(s).`);
    }

    await client.query("COMMIT");
    console.log("Migracao concluida com sucesso.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha na migracao:", error);
  process.exit(1);
});
