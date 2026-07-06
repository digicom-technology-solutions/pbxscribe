async function createUnprocessedLog(
  pool,
  {
    client_id,
    caller_id,
    job_name,
    job_status,
    filename,
    email_attachment_type,
    email_subject,
    email_from_address,
    email_from_name,
    to_email_addresses,
    email_body,
    voicemail,
    delivery_status,
    delivery_timestamp,
    sms_delivery_status,
    sms_delivery_timestamp,
    duration_ms,
    message_id,
  },
) {
  const result = await pool.query(
    `INSERT INTO unprocessed_logs (client_id, caller_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, to_email_addresses, email_body, voicemail, delivery_status, delivery_timestamp, sms_delivery_status, sms_delivery_timestamp, duration_ms, message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id, client_id, caller_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, to_email_addresses, email_body, voicemail, delivery_status, delivery_timestamp, sms_delivery_status, sms_delivery_timestamp, duration_ms, message_id, created_at, updated_at`,
    [
      client_id,
      caller_id,
      job_name,
      job_status,
      filename,
      email_attachment_type,
      email_subject,
      email_from_address,
      email_from_name,
      to_email_addresses,
      email_body,
      voicemail,
      delivery_status,
      delivery_timestamp,
      sms_delivery_status,
      sms_delivery_timestamp,
      duration_ms,
      message_id,
    ],
  );
  return result.rows[0];
}

async function updateUnprocessedLog(pool, id, fields) {
  const allowed = [
    "delivery_status",
    "job_status",
    "delivery_timestamp",
    "sms_delivery_status",
    "sms_delivery_timestamp",
    "duration_ms",
    "message_id",
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
    return findLogById(pool, id);
  }

  updates.push(`updated_at = NOW()`);
  values.push(id);
  const result = await pool.query(
    `UPDATE unprocessed_logs
     SET ${updates.join(", ")}
     WHERE id = $${values.length}
     RETURNING id, client_id, caller_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, to_email_addresses, email_body, voicemail, delivery_status, delivery_timestamp, sms_delivery_status, sms_delivery_timestamp, duration_ms, message_id, created_at, updated_at`,
    values,
  );
  return result.rows[0] || null;
}

async function listUnprocessedLogs(
  pool,
  client_id,
  {limit = 20, offset = 0, delivery_status} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  if (delivery_status) {
    values.push(delivery_status);
    conditions.push(`delivery_status = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, client_id, caller_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, to_email_addresses, email_body, voicemail, delivery_status, delivery_timestamp, sms_delivery_status, sms_delivery_timestamp, duration_ms, message_id, created_at, updated_at
       FROM unprocessed_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM unprocessed_logs ${where}`,
      values,
    ),
  ]);

  return {
    logs: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

module.exports = {
  createUnprocessedLog,
  updateUnprocessedLog,
  listUnprocessedLogs,
};
