// User repository - database operations for users table

/**
 * Create a new user
 * @param {Pool} pool - pg.Pool instance
 * @param {{ email: string, name: string }} fields
 * @returns {Promise<Object>} Created user row
 */
async function createUser(
  pool,
  {
    client_id,
    email,
    pbx_email,
    firstname,
    lastname,
    phone,
    sms_notification,
    timezone,
    user_type,
    user_role,
    user_status,
    two_fa_enabled,
  },
) {
  const result = await pool.query(
    `INSERT INTO users (client_id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id, client_id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, created_at, updated_at`,
    [
      client_id,
      email,
      pbx_email,
      firstname,
      lastname,
      phone,
      sms_notification,
      timezone,
      user_type,
      user_role,
      user_status,
      two_fa_enabled,
    ],
  );
  return result.rows[0];
}

/**
 * Find a user by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findUserById(pool, id) {
  const result = await pool.query(
    `SELECT id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, created_at, updated_at
     FROM users
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Find a user by email
 * @param {Pool} pool
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function findUserByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, created_at, updated_at
     FROM users
     WHERE email = $1`,
    [email],
  );
  return result.rows[0] || null;
}

/**
 * Update a user (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ firstname?: string, lastname?: string, phone?: string, sms_notification?: boolean, timezone?: string, user_status?: string, user_role?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated user row, or null if not found
 */
async function updateUser(pool, id, fields) {
  const allowed = [
    "firstname",
    "lastname",
    "phone",
    "sms_notification",
    "timezone",
    "user_status",
    "user_role",
    "two_fa_enabled",
  ];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findUserById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE users
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List users with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ users: Object[], total: number }>}
 */
async function listUsers(
  pool,
  client_id,
  {limit = 20, offset = 0, status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (status) {
    values.push(status);
    conditions.push(`user_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, created_at, updated_at
       FROM users
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM users ${where}`, values),
  ]);

  return {
    users: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a user by ID
 * @param {Pool} pool
 * @param {number} client_id
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteUser(pool, client_id, id) {
  const result = await pool.query(
    "DELETE FROM users WHERE id = $1 AND client_id = $2",
    [id, client_id],
  );
  return result.rowCount > 0;
}

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  updateUser,
  listUsers,
  deleteUser,
};
