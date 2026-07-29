import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSeedData, makeAudit } from "../domain/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const defaultDataFile = path.join(projectRoot, "data", "db.json");

export function getDataFile() {
  const configured = process.env.P2P_USDT_DATA_FILE;
  if (!configured) return defaultDataFile;
  return path.isAbsolute(configured) ? configured : path.resolve(projectRoot, configured);
}

export function ensureDatabase() {
  const file = getDataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    const seed = createSeedData();
    seed.auditLog.push(makeAudit({
      action: "database.seeded",
      entityType: "database",
      entityId: "db",
      after: { schemaVersion: seed.meta.schemaVersion }
    }));
    fs.writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  }
  return file;
}

export function resetDatabase() {
  const file = getDataFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const seed = createSeedData();
  seed.auditLog.push(makeAudit({
    action: "database.reset",
    entityType: "database",
    entityId: "db",
    after: { schemaVersion: seed.meta.schemaVersion }
  }));
  fs.writeFileSync(file, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  return seed;
}

export function readDb() {
  const file = ensureDatabase();
  return normalizeDb(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function writeDb(db) {
  const file = ensureDatabase();
  fs.writeFileSync(file, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  return db;
}

export function mutateDb(mutator) {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result ?? db;
}

export function findById(collection, id, label = "record") {
  const item = collection.find((entry) => entry.id === id);
  if (!item) throw new Error(`${label} not found: ${id}`);
  return item;
}

export function addAudit(db, event) {
  const audit = makeAudit(event);
  db.auditLog.push(audit);
  return audit;
}

function normalizeDb(db) {
  const defaults = createSeedData();
  for (const key of Object.keys(defaults)) {
    if (Array.isArray(defaults[key]) && !Array.isArray(db[key])) db[key] = [];
  }
  if (!db.meta) db.meta = defaults.meta;
  return db;
}
