// Payment method repository - database operations for payment_methods table

/**
 * Create a new payment method
 * @param {Pool} pool - pg.Pool instance
 * @param {{ card_number: string, cardholder_name: string, security_code: string, client_id: number }} fields
 * @returns {Promise<Object>} Created payment method row
 */
async function createPaymentMethod(
  pool,
  {
    card_number,
    cardholder_name,
    security_code,
    expiry_date,
    is_default,
    card_status,
    client_id,
  },
) {
  const result = await pool.query(
    `INSERT INTO payment_methods (card_number, cardholder_name, security_code, expiry_date, is_default, card_status, client_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, card_number, cardholder_name, security_code, expiry_date, is_default, card_status, client_id, created_at, updated_at`,
    [
      card_number,
      cardholder_name,
      security_code,
      expiry_date,
      is_default,
      card_status,
      client_id,
    ],
  );
  return result.rows[0];
}

/**
 * Find a payment method by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findPaymentMethodById(pool, id) {
  const result = await pool.query(
    `SELECT id, card_number, cardholder_name, security_code, expiry_date, is_default, card_status, client_id, created_at, updated_at
     FROM payment_methods
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Update a payment method (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ card_number?: string, cardholder_name?: string, security_code?: string, expiry_date?: string, is_default?: boolean, card_status?: string, client_id?: number }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated payment method row, or null if not found
 */
async function updatePaymentMethod(pool, id, fields) {
  const allowed = [
    "card_number",
    "cardholder_name",
    "security_code",
    "expiry_date",
    "is_default",
    "card_status",
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
    return findPaymentMethodById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE payment_methods
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, card_number, cardholder_name, security_code, expiry_date, is_default, card_status, client_id, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List payment methods with pagination and optional status filter
 * @param {Pool} pool
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ paymentMethods: Object[], total: number }>}
 */
async function listPaymentMethods(pool, {limit = 20, offset = 0, status} = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`card_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, card_number, cardholder_name, security_code, expiry_date, is_default, card_status, client_id, created_at, updated_at
       FROM payment_methods
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM payment_methods ${where}`,
      values,
    ),
  ]);

  return {
    paymentMethods: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a payment method by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deletePaymentMethod(pool, id) {
  const result = await pool.query("DELETE FROM payment_methods WHERE id = $1", [
    id,
  ]);
  return result.rowCount > 0;
}

module.exports = {
  createPaymentMethod,
  findPaymentMethodById,
  updatePaymentMethod,
  listPaymentMethods,
  deletePaymentMethod,
};
