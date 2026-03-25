// Subscription repository - database operations for subscription_plans table

/**
 * Create a new subscription plan
 * @param {Pool} pool - pg.Pool instance
 * @param {{ plan_name: string, plan_type: string, plan_monthly_amount: number, plan_yearly_amount: number, plan_voicemails: number, plan_email_delivery: boolean, plan_sms_delivery: boolean, plan_voicebox: boolean, plan_support: boolean }} fields
 * @returns {Promise<Object>} Created subscription plan row
 */
async function createSubscriptionPlan(
  pool,
  {
    plan_name,
    plan_type,
    plan_monthly_amount,
    plan_yearly_amount,
    plan_voicemails,
    plan_email_delivery,
    plan_sms_delivery,
    plan_voicebox,
    plan_support,
  },
) {
  const result = await pool.query(
    `INSERT INTO subscription_plans (plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at`,
    [
      plan_name,
      plan_type,
      plan_monthly_amount,
      plan_yearly_amount,
      plan_voicemails,
      plan_email_delivery,
      plan_sms_delivery,
      plan_voicebox,
      plan_support,
    ],
  );
  return result.rows[0];
}

/**
 * Find a subscription plan by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findPlanById(pool, id) {
  const result = await pool.query(
    `SELECT id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at
     FROM subscription_plans
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Find a subscription plan by name
 * @param {Pool} pool
 * @param {string} plan_name
 * @returns {Promise<Object|null>}
 */
async function findPlanByName(pool, plan_name) {
  const result = await pool.query(
    `SELECT id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at
     FROM subscription_plans
     WHERE plan_name = $1`,
    [plan_name],
  );
  return result.rows[0] || null;
}

/**
 * Update a subscription plan (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ plan_name?: string, plan_type?: string, plan_monthly_amount?: number, plan_yearly_amount?: number, plan_voicemails?: number, plan_email_delivery?: boolean, plan_sms_delivery?: boolean, plan_voicebox?: boolean, plan_support?: boolean }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated subscription plan row, or null if not found
 */
async function updatePlan(pool, id, fields) {
  const allowed = [
    "plan_name",
    "plan_type",
    "plan_monthly_amount",
    "plan_yearly_amount",
    "plan_voicemails",
    "plan_email_delivery",
    "plan_sms_delivery",
    "plan_voicebox",
    "plan_support",
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
    return findPlanById(pool, id);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE subscription_plans
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List subscription plans with pagination
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number }} options
 * @returns {Promise<{ plans: Object[], total: number }>}
 */
async function listSubscriptionPlans(pool, {limit = 20, offset = 0} = {}) {
  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at
       FROM subscription_plans
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query(`SELECT COUNT(*)::int AS total FROM subscription_plans`),
  ]);

  return {
    plans: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a subscription plan by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteSubscriptionPlan(pool, id) {
  const result = await pool.query(
    "DELETE FROM subscription_plans WHERE id = $1",
    [id],
  );
  return result.rowCount > 0;
}

module.exports = {
  createSubscriptionPlan,
  findPlanById,
  findPlanByName,
  updatePlan,
  listSubscriptionPlans,
  deleteSubscriptionPlan,
};
