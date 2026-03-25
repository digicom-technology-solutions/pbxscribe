// Credential repository - database operations for user_credentials table

/**
 * Create a new credential
 * @param {Pool} pool
 * @param {{ userId: string, credentialType: string, credentialHash: string, label?: string, expiresAt?: Date }} fields
 * @returns {Promise<Object>} Created credential row
 */
async function requestPasswordReset(
  pool,
  {email, user_id, client_id, token, expires_at, created_at},
) {
  const result = await pool.query(
    `INSERT INTO reset_password
       (client_id, user_id, email, token, expires_at, created_at, used_at)
     VALUES ($1, $2, $3, $4, $5, $6, NULL)
     RETURNING id, client_id, user_id, email, token, expires_at, created_at, used_at`,
    [
      client_id,
      user_id,
      email,
      token,
      expires_at || null,
      created_at || new Date(),
    ],
  );
  return result.rows[0];
}

/**
 * Find all credentials for a user, optionally filtered by type
 * @param {Pool} pool
 * @param {string} userId
 * @param {string} [credentialType] - 'password' | 'api_key'
 * @returns {Promise<Object[]>}
 */
async function findTokenByEmail(pool, email) {
  const conditions = ["email = $1"];
  const values = [email];

  const result = await pool.query(
    `SELECT id, client_id, user_id, email, token, expires_at, created_at, used_at
     FROM reset_password
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * Find an active credential by its hash — used during authentication.
 * Joins with users table to return the associated user in one query.
 * @param {Pool} pool
 * @param {string} hash - Hashed credential value
 * @param {string} credentialType - 'password' | 'api_key'
 * @returns {Promise<{ credential: Object, user: Object } | null>}
 */
async function deleteToken(pool, {token}) {
  const result = await pool.query(
    "DELETE FROM reset_password WHERE token = $1",
    [token],
  );
  return result.rowCount > 0;
}

module.exports = {
  requestPasswordReset,
  findTokenByEmail,
  deleteToken,
};
