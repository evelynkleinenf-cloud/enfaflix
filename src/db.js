const { getAppConfig } = require("./config");

const appConfig = getAppConfig();

const database = appConfig.dbClient === "postgres"
  ? require("./db-postgres")
  : require("./db-sqlite");

module.exports = database;
