// Support repository - database operations for support_tickets table

/**
 * Create a new support ticket
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, case_title: string, case_description: string, case_status: string }} fields
 * @returns {Promise<Object>} Created support ticket row
 */
async function createSupportTicket(
  pool,
  {client_id, case_title, case_description, case_status},
) {
  const result = await pool.query(
    `INSERT INTO support_tickets (client_id, case_title, case_description, case_status)
     VALUES ($1, $2, $3, $4)
     RETURNING id, client_id, case_title, case_description, case_status, created_at, updated_at`,
    [client_id, case_title, case_description, case_status],
  );
  return result.rows[0];
}

/**
 * Find a support ticket by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findSupportTicketById(pool, id) {
  const result = await pool.query(
    `SELECT id, client_id, case_title, case_description, case_status, created_at, updated_at
     FROM support_tickets
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Update a support ticket (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ case_title?: string, case_description?: string, case_status?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated support ticket row, or null if not found
 */
async function updateSupportTicket(pool, id, fields) {
  const allowed = ["case_title", "case_description", "case_status"];
  const updates = [];
  const values = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      values.push(fields[key]);
      updates.push(`${key} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    return findSupportTicketById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE support_tickets
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, case_title, case_description, case_status, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List support tickets with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ tickets: Object[], total: number }>}
 */
async function listSupportTickets(
  pool,
  client_id,
  {limit = 20, offset = 0, status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (status) {
    values.push(status);
    conditions.push(`case_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, case_title, case_description, case_status, created_at, updated_at
       FROM support_tickets
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM support_tickets ${where}`,
      values,
    ),
  ]);

  return {
    supportTickets: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a support ticket by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteSupportTicket(pool, id) {
  const result = await pool.query("DELETE FROM support_tickets WHERE id = $1", [
    id,
  ]);
  return result.rowCount > 0;
}

module.exports = {
  createSupportTicket,
  findSupportTicketById,
  updateSupportTicket,
  listSupportTickets,
  deleteSupportTicket,
};
