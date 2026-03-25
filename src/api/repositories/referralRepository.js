// User repository - database operations for users table

/**
 * Create a new referral
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, invoice_id: number, referral_bonus: number }} fields
 * @returns {Promise<Object>} Created referral row
 */
async function createReferral(
  pool,
  {client_id, referral_client_id, invoice_id, referral_bonus},
) {
  const result = await pool.query(
    `INSERT INTO referrals (client_id, referral_client_id, invoice_id, referral_bonus)
     VALUES ($1, $2, $3, $4)
     RETURNING id, client_id, referral_client_id, invoice_id, referral_bonus, created_at, updated_at`,
    [client_id, referral_client_id, invoice_id, referral_bonus],
  );
  return result.rows[0];
}

/**
 * Find a referral by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findReferralById(pool, id) {
  const result = await pool.query(
    `SELECT id, client_id, referral_client_id, invoice_id, referral_bonus, created_at, updated_at
     FROM referrals
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Update a referral (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ client_id?: number, referral_client_id?: number, invoice_id?: number, referral_bonus?: number }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated referral row, or null if not found
 */
async function updateReferral(pool, id, fields) {
  const allowed = ["referral_client_id", "invoice_id", "referral_bonus"];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findReferralById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE referrals
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, referral_client_id, invoice_id, referral_bonus, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List referrals with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ referrals: Object[], total: number }>}
 */
async function listReferrals(
  pool,
  client_id,
  {limit = 20, offset = 0, status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (status) {
    values.push(status);
    conditions.push(`referral_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, referral_client_id, invoice_id, referral_bonus, created_at, updated_at
       FROM referrals
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM referrals ${where}`, values),
  ]);

  return {
    referrals: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a referral by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteReferral(pool, id) {
  const result = await pool.query("DELETE FROM referrals WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  createReferral,
  findReferralById,
  updateReferral,
  listReferrals,
  deleteReferral,
};
