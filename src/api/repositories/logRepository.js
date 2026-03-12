// User repository - database operations for users table

/**
 * Create a new user
 * @param {Pool} pool - pg.Pool instance
 * @param {{ email: string, name: string }} fields
 * @returns {Promise<Object>} Created log row
 */
async function createLog(
  pool,
  {
    client_id,
    caller_id,
    username,
    deliver_to,
    email_status,
    delivery_status,
    delivery_timestamp,
  },
) {
  const result = await pool.query(
    `INSERT INTO logs (client_id, caller_id, username, deliver_to, email_status, delivery_status, delivery_timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, client_id, caller_id, username, deliver_to, email_status, delivery_status, delivery_timestamp, created_at, updated_at`,
    [
      client_id,
      caller_id,
      username,
      deliver_to,
      email_status,
      delivery_status,
      delivery_timestamp,
    ],
  );
  return result.rows[0];
}

/**
 * Update a log (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ client_id?: number, caller_id?: string, username?: string, deliver_to?: string, email_status?: string, delivery_status?: string, delivery_timestamp?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated log row, or null if not found
 */
async function updateLog(pool, id, fields) {
  const allowed = ["delivery_status"];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findLogById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE logs
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, caller_id, username, deliver_to, email_status, delivery_status, delivery_timestamp, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List logs with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ logs: Object[], total: number }>}
 */
async function listLogs(
  pool,
  client_id,
  {limit = 20, offset = 0, delivery_status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (delivery_status) {
    values.push(delivery_status);
    conditions.push(`delivery_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, caller_id, username, deliver_to, email_status, delivery_status, delivery_timestamp, created_at, updated_at
       FROM logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM logs ${where}`, values),
  ]);

  return {
    logs: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

module.exports = {
  createLog,
  updateLog,
  listLogs,
};
