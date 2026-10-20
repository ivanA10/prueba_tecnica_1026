// Creates audit_user with readWrite on audit_db only (runs on first start, empty volume).
// Password comes from the mongo container environment.
const password = process.env.AUDIT_DB_PASSWORD;
if (!password) {
  throw new Error("AUDIT_DB_PASSWORD is required");
}

const auditDb = db.getSiblingDB("audit_db");
auditDb.createUser({
  user: "audit_user",
  pwd: password,
  roles: [{ role: "readWrite", db: "audit_db" }],
});
