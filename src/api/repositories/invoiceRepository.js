// User repository - database operations for users table

/**
 * Create a new invoice
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, invoice_name: string, invoice_type: string, invoice_date: string, plan_id: number, invoice_amount: number, invoice_status: string, invoice_file_url: string }} fields
 * @returns {Promise<Object>} Created invoice row
 */
async function createInvoice(
  pool,
  {
    client_id,
    invoice_name,
    invoice_type,
    invoice_date,
    plan_id,
    invoice_amount,
    invoice_status,
    invoice_file_url,
  },
) {
  const result = await pool.query(
    `INSERT INTO invoices (client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at`,
    [
      client_id,
      invoice_name,
      invoice_type,
      invoice_date,
      plan_id,
      invoice_amount,
      invoice_status,
      invoice_file_url,
    ],
  );
  return result.rows[0];
}

/**
 * Find an invoice by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findInvoiceById(pool, id) {
  const result = await pool.query(
    `SELECT id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at
     FROM invoices
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Find an invoice by name
 * @param {Pool} pool
 * @param {string} invoice_name
 * @returns {Promise<Object|null>}
 */
async function findInvoiceByName(pool, invoice_name) {
  const result = await pool.query(
    `SELECT id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at
     FROM invoices
     WHERE invoice_name = $1`,
    [invoice_name],
  );
  return result.rows[0] || null;
}

/**
 * Find an invoice by type
 * @param {Pool} pool
 * @param {string} invoice_type
 * @returns {Promise<Object|null>}
 */
async function findInvoiceByType(pool, invoice_type) {
  const result = await pool.query(
    `SELECT id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at
     FROM invoices
     WHERE invoice_type = $1 ORDER BY created_at DESC`,
    [invoice_type],
  );
  return result.rows[0] || null;
}

/**
 * Update an invoice (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ invoice_name?: string, invoice_type?: string, invoice_date?: string, plan_id?: number, invoice_amount?: number, invoice_status?: string, invoice_file_url?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated invoice row, or null if not found
 */
async function updateInvoice(pool, id, fields) {
  const allowed = [
    "invoice_name",
    "invoice_type",
    "invoice_date",
    "invoice_amount",
    "invoice_status",
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
    return findInvoiceById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE invoices
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List invoices with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ invoices: Object[], total: number }>}
 */
async function listInvoices(
  pool,
  client_id,
  {limit = 20, offset = 0, status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (status) {
    values.push(status);
    conditions.push(`invoice_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, invoice_name, invoice_type, invoice_date, plan_id, invoice_amount, invoice_status, invoice_file_url, created_at, updated_at
       FROM invoices
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM invoices ${where}`, values),
  ]);

  return {
    invoices: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete an invoice by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteInvoice(pool, id) {
  const result = await pool.query("DELETE FROM invoices WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  createInvoice,
  findInvoiceById,
  findInvoiceByName,
  updateInvoice,
  listInvoices,
  deleteInvoice,
  findInvoiceByType,
};
