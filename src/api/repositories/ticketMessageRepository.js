// Ticket message repository - database operations for ticket_messages table

/**
 * Create a new ticket message
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, ticket_id: string, message_content: string, message_timestamp: string, attachment_filename?: string, attachment_contenttype?: string }} fields
 * @returns {Promise<Object>} Created ticket message row
 */
async function createTicketMessage(
  pool,
  {
    ticket_id,
    message_content,
    message_timestamp,
    attachment_filename,
    attachment_contenttype,
    attachment_upload_url,
  },
) {
  const result = await pool.query(
    `INSERT INTO ticket_messages (ticket_id, message_content, message_timestamp, attachment_filename, attachment_contenttype, attachment_upload_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, ticket_id, message_content, message_timestamp, attachment_filename, attachment_contenttype, attachment_upload_url, created_at, updated_at`,
    [
      ticket_id,
      message_content,
      message_timestamp,
      attachment_filename,
      attachment_contenttype,
      attachment_upload_url,
    ],
  );
  return result.rows[0];
}

/**
 * Find a ticket message by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findTicketMessageById(pool, id) {
  const result = await pool.query(
    `SELECT id, ticket_id, message_content, message_timestamp, attachment_filename, attachment_contenttype, attachment_upload_url, created_at, updated_at
     FROM ticket_messages
     WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

/**
 * Update a ticket message (partial updates supported)
 * @param {Pool} pool
 * @param {string} id - UUID
 * @param {{ message_content?: string, message_timestamp?: string, attachment_filename?: string, attachment_contenttype?: string, attachment_upload_url?: string }} fields - Fields to update
 * @returns {Promise<Object|null>} Updated ticket message row, or null if not found
 */
async function updateTicketMessage(pool, id, fields) {
  const allowed = [
    "message_content",
    "message_timestamp",
    "attachment_filename",
    "attachment_contenttype",
    "attachment_upload_url",
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
    return findTicketMessageById(pool, id);
  }

  // Always update updated_at
  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE ticket_messages
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, ticket_id, message_content, message_timestamp, attachment_filename, attachment_contenttype, attachment_upload_url, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

/**
 * List ticket messages with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} ticket_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ ticketMessages: Object[], total: number }>}
 */
async function listTicketMessages(
  pool,
  ticket_id,
  {limit = 20, offset = 0, status} = {},
) {
  const conditions = [`ticket_id = $1`];
  const values = [ticket_id];

  if (status) {
    values.push(status);
    conditions.push(`case_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, ticket_id, message_content, message_timestamp, attachment_filename, attachment_contenttype, attachment_upload_url, created_at, updated_at
       FROM ticket_messages
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM ticket_messages ${where}`,
      values,
    ),
  ]);

  return {
    ticketMessages: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a ticket message by ID
 * @param {Pool} pool
 * @param {string} id - UUID
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deleteTicketMessage(pool, id) {
  const result = await pool.query("DELETE FROM ticket_messages WHERE id = $1", [
    id,
  ]);
  return result.rowCount > 0;
}

module.exports = {
  createTicketMessage,
  findTicketMessageById,
  updateTicketMessage,
  listTicketMessages,
  deleteTicketMessage,
};
