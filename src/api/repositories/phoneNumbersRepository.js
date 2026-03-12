// Client repository - database operations for clients table
const twilio = require("twilio");

let twilioClient;

function getTwilioClient() {
  if (!twilioClient) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;

    if (!sid || !token) {
      throw new Error("Twilio Credentials missing from environment variables");
    }
    twilioClient = twilio(sid, token);
  }
  return twilioClient;
}

/**
 * Fetches available Twilio numbers based on country and search criteria.
 * Optimized for readability, API accuracy, and error handling.
 */
async function showPhoneNumbers(
  countryCode,
  searchString,
  searchType = "number",
  searchPattern = "contains",
) {
  const client = getTwilioClient();

  const searchOptions = {limit: 10};

  if (searchType === "number" && searchString) {
    if (searchPattern === "starts_with")
      searchOptions.areaCode = searchString.slice(0, 3);
    else if (searchPattern === "ends_with")
      searchOptions.contains = `${searchString}$`;
    else if (searchPattern === "contains")
      searchOptions.contains = `%${searchString}%`;
  } else if (searchType === "locality" && searchString) {
    searchOptions.inLocality = searchString;
  }

  console.log("Searching Twilio for available numbers with options:", {
    searchOptions,
  });

  try {
    const numbers = await client
      .availablePhoneNumbers(countryCode)
      .local.list(searchOptions);

    console.log(`Twilio search returned ${JSON.stringify(numbers)}`);

    // 2. Map directly to the return object to save memory/cycles
    return numbers.map(({capabilities, friendlyName, phoneNumber, type}) => ({
      capabilities,
      friendly_name: friendlyName,
      phone_number: phoneNumber,
      type,
    }));
  } catch (error) {
    // 3. Structured error logging
    console.error(`[Twilio Error] Country: ${countryCode}:`, error.message);

    // Re-throw the original error or a custom one without double-nesting strings
    throw new Error(`Failed to fetch numbers: ${error.message}`);
  }
}

/**
 * Buys and assigns a Twilio phone number.
 * Optimized for readability, API accuracy, and error handling.
 */
async function buyAndAssignPhoneNumber(
  pool,
  {
    client_id,
    phone_number,
    phone_type,
    friendly_name,
    voice_capabilities,
    sms_capabilities,
    mms_capabilities,
  },
) {
  const client = getTwilioClient();

  try {
    const incomingPhoneNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: phone_number,
    });

    console.log("Twilio purchase successful, assigning to client:", {
      client_id,
      phone_number: incomingPhoneNumber.phoneNumber,
      phone_number_sid: incomingPhoneNumber.sid,
    });

    const result = await pool.query(
      `INSERT INTO phone_numbers (client_id, phone_number, phone_number_sid, phone_type, friendly_name, voice_capabilities, sms_capabilities, mms_capabilities, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, client_id, phone_number, phone_number_sid, phone_type, friendly_name, voice_capabilities, sms_capabilities, mms_capabilities, created_at, updated_at`,
      [
        client_id,
        phone_number,
        incomingPhoneNumber.sid,
        phone_type,
        friendly_name,
        voice_capabilities,
        sms_capabilities,
        mms_capabilities,
        new Date(),
        new Date(),
      ],
    );
    return result.rows[0];
  } catch (error) {
    console.error(`[Twilio Error] Client ID: ${client_id}:`, error.message);

    throw new Error(
      `Failed to buy and assign phone number for client ID ${client_id}: ${error.message}`,
    );
  }
}

/**
 * List users with pagination and optional status filter
 * @param {Pool} pool
 * @param {number} client_id
 * @param {{ limit?: number, offset?: number, status?: string }} options
 * @returns {Promise<{ users: Object[], total: number }>}
 */
async function listPhoneNumbers(
  pool,
  client_id,
  {limit = 20, offset = 0} = {},
) {
  const conditions = [`client_id = $1`];
  const values = [client_id];

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Run data query and count query in parallel
  const [dataResult, countResult] = await Promise.all([
    pool.query(
      `SELECT id, phone_number, phone_number_sid, phone_type, friendly_name, voice_capabilities, sms_capabilities, mms_capabilities, created_at, updated_at
       FROM phone_numbers
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM phone_numbers ${where}`,
      values,
    ),
  ]);

  return {
    phone_numbers: dataResult.rows,
    total: countResult.rows[0].total,
  };
}

/**
 * Delete a phone number by number
 * @param {Pool} pool
 * @param {string} number - Phone number
 * @returns {Promise<boolean>} true if deleted, false if not found
 */
async function deletePhoneNumber(pool, number) {
  const query_result = await pool.query(
    `SELECT id, phone_number, phone_number_sid, phone_type, friendly_name, voice_capabilities, sms_capabilities, mms_capabilities, created_at, updated_at
       FROM phone_numbers
       WHERE phone_number = $1
       ORDER BY created_at DESC
       LIMIT 1`,
    [number],
  );

  if (query_result.rows.length === 0) {
    return false;
  }

  const phoneRecord = query_result.rows[0];

  const client = getTwilioClient();
  await client.incomingPhoneNumbers(phoneRecord.phone_number_sid).remove();

  const result = await pool.query("DELETE FROM phone_numbers WHERE id = $1", [
    phoneRecord.id,
  ]);
  return result.rowCount > 0;
}

module.exports = {
  showPhoneNumbers,
  buyAndAssignPhoneNumber,
  listPhoneNumbers,
  deletePhoneNumber,
};
