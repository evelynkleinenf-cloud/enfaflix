function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  return String(value).toLowerCase() === "true";
}

function getAppConfig() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";
  const jwtSecret = process.env.JWT_SECRET || "troque-esta-chave-em-producao";
  const appBaseUrl = process.env.APP_BASE_URL || "";
  const databaseUrl = process.env.DATABASE_URL || "";
  const dbClient = process.env.DB_CLIENT || (databaseUrl ? "postgres" : "sqlite");
  const allowLocalFileUploads = parseBoolean(process.env.ALLOW_LOCAL_FILE_UPLOADS, !isProduction);
  const allowSqliteInProduction = parseBoolean(process.env.ALLOW_SQLITE_IN_PRODUCTION, false);

  return {
    nodeEnv,
    isProduction,
    jwtSecret,
    appBaseUrl,
    databaseUrl,
    dbClient,
    allowLocalFileUploads,
    allowSqliteInProduction
  };
}

function validateProductionConfig(config) {
  if (!config.isProduction) {
    return;
  }

  if (!config.appBaseUrl) {
    throw new Error("APP_BASE_URL precisa estar configurada em producao.");
  }

  if (!process.env.JWT_SECRET || config.jwtSecret === "troque-esta-chave-em-producao") {
    throw new Error("JWT_SECRET precisa ser forte e obrigatoria em producao.");
  }

  if (config.dbClient === "postgres" && !config.databaseUrl) {
    throw new Error("DATABASE_URL precisa estar configurada para usar Postgres em producao.");
  }

  if (config.dbClient !== "postgres" && !config.allowSqliteInProduction) {
    throw new Error("Producao com SQLite local foi bloqueada. Configure Postgres/Supabase ou defina ALLOW_SQLITE_IN_PRODUCTION=true por sua conta e risco.");
  }
}

module.exports = {
  getAppConfig,
  validateProductionConfig
};
