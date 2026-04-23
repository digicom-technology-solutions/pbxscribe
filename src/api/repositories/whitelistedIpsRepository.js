// User repository - database operations for users table

/**
 * Create a new whitelisted IP
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, ip_address: string }} fields
 * @returns {Promise<Object>} Created whitelisted IP row
 */
async function createWhitelistedIps(pool, {client_id, ip_address}) {
  const result = await pool.query(
    `INSERT INTO whitelisted_ips (client_id, ip_address)
     VALUES ($1, $2)
     RETURNING id, client_id, ip_address, created_at, updated_at`,
    [client_id, ip_address],
  );
  return result.rows[0];
}

/**
 * Find a whitelisted IP by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findWhitelistedIpById(pool, id) {
  const result = await pool.query(
    `SELECT id, client_id, ip_address, created_at, updated_at
     FROM whitelisted_ips
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Update a whitelisted IP (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ ip_address?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated whitelisted IP row, or null if not found
 */
async function updateWhitelistedIp(pool, id, fields) {
  const allowed = ["ip_address"];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findWhitelistedIpById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE whitelisted_ips
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, ip_address, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List whitelisted IPs with pagination
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ whitelistedIps: Object[], total: number }>}
 */
async function listWhitelistedIps(
  pool,
  client_id,
  {limit = 20, offset = 0} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, ip_address, created_at, updated_at
       FROM whitelisted_ips
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM whitelisted_ips ${where}`,
      values,
    ),
  ]);

  return {
    whitelistedIps: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a whitelisted IP by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteWhitelistedIp(pool, id) {
  const result = await pool.query("DELETE FROM whitelisted_ips WHERE id = $1", [
    id,
  ]);
  return result.rowCount > 0;
}

module.exports = {
  createWhitelistedIps,
  findWhitelistedIpById,
  updateWhitelistedIp,
  listWhitelistedIps,
  deleteWhitelistedIp,
};
