// Client repository - database operations for clients table

/**
 * Create a new client
 * @param {Pool} pool - pg.Pool instance
 * @param {{ email: string, name: string }} fields
 * @returns {Promise<Object>} Created client row
 */
async function createClient(
  pool,
  {
    client_name,
    plan_id,
    client_category,
    client_email,
    client_address,
    client_phone,
    timezone,
    client_status,
    client_referral_link,
  },
) {
  const result = await pool.query(
    `INSERT INTO clients (client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, created_at, updated_at`,
    [
      client_name,
      plan_id,
      client_category,
      client_email,
      client_address,
      client_phone,
      timezone,
      client_status,
      client_referral_link,
    ],
  );
  return result.rows[0];
}

/**
 * Find a client by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findClientById(pool, id) {
  const result = await pool.query(
    `SELECT id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at
     FROM clients
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Find a client by email
 * @param {Pool} pool
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
async function findClientByEmail(pool, email) {
  const result = await pool.query(
    `SELECT id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at
     FROM clients
     WHERE client_email = $1`,
    [email],
  );
  return result.rows[0] || null;
}

/**
 * Find a client by referral link
 * @param {Pool} pool
 * @param {string} referralLink
 * @returns {Promise<Object|null>}
 */
async function findClientByReferralLink(pool, referralLink) {
  const result = await pool.query(
    `SELECT id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at
     FROM clients
     WHERE client_referral_link = $1`,
    [referralLink],
  );
  return result.rows[0] || null;
}

/**
 * Update a client (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ client_name?: string, plan_id?: string, client_category?: string, client_email?: string, client_address?: string, client_phone?: string, timezone?: string, client_status?: string, client_referral_link?: string, delivery_failure_notification?: boolean, usage_alert_notification?: boolean, system_alert_notification?: boolean, stripe_customer_id?: string, stripe_subscription_id?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated client row, or null if not found
 */
async function updateClient(pool, id, fields) {
  const allowed = [
    "client_name",
    "plan_id",
    "client_category",
    "client_email",
    "client_address",
    "client_phone",
    "timezone",
    "client_status",
    "client_referral_link",
    "delivery_failure_notification",
    "usage_alert_notification",
    "system_alert_notification",
    "stripe_customer_id",
    "stripe_subscription_id",
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
    return findClientById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await pool.query(
    `UPDATE clients
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List clients with pagination and optional status filter
 * @param {Pool} pool
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ clients: Object[], total: number }>}
 */
async function listClients(pool, {limit = 20, offset = 0, status} = {}) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`client_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at
       FROM clients
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM clients ${where}`, values),
  ]);

  return {
    clients: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a client by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteClient(pool, id) {
  const result = await pool.query("DELETE FROM clients WHERE id = $1", [id]);
  return result.rowCount > 0;
}

module.exports = {
  createClient,
  findClientById,
  findClientByEmail,
  updateClient,
  listClients,
  deleteClient,
  findClientByReferralLink,
};
