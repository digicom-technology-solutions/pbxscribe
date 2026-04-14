import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import pkg from "pg";
const {Pool} = pkg;

const region = process.env.REGION;
const secretsClient = new SecretsManagerClient({region});

// Global cache variables
let cachedCredentials = null;
let cachedPool = null;

async function getDbCredentials() {
  if (cachedCredentials) return cachedCredentials;

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn)
    throw new Error("DB_SECRET_ARN environment variable is not set");

  try {
    console.log("Retrieving database credentials from Secrets Manager");
    const command = new GetSecretValueCommand({SecretId: secretArn});
    const response = await secretsClient.send(command);

    if (!response.SecretString) throw new Error("Secret string is empty");

    cachedCredentials = JSON.parse(response.SecretString);
    return cachedCredentials;
  } catch (error) {
    console.error("Failed to retrieve database credentials:", error.message);
    throw error;
  }
}

async function getPool() {
  // If pool already exists, return it
  if (cachedPool) return cachedPool;

  const credentials = await getDbCredentials();

  const config = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database: process.env.DB_NAME,
    user: credentials.username,
    password: credentials.password,
    ssl: {rejectUnauthorized: true},
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

  if (!config.host || !config.database) {
    throw new Error("Missing DB_HOST or DB_NAME environment variables");
  }

  // Create and cache the pool
  cachedPool = new Pool(config);
  return cachedPool;
}

export const handler = async (event) => {
  console.log("Event Received: ", JSON.stringify(event, null, 2));

  const pool = await getPool();

  try {
    const {mail, eventType} = JSON.parse(event.Records[0].Sns.Message);
    const messageId = mail.messageId;

    const trackedEvents = ["Delivery", "Bounce", "Reject", "DeliveryDelay"];
    if (!trackedEvents.includes(eventType)) {
      return {message: "Event ignored", result: true};
    }

    const query = `SELECT * FROM logs WHERE message_id = $1`;
    const dbData = await pool.query(query, [messageId]);

    if (!dbData.rows?.length) {
      console.warn(`No record found for messageId: ${messageId}`);
      return {message: "Record not found", result: false};
    }

    const job_name = dbData.rows[0].job_name;
    const isDelivered = eventType === "Delivery";

    const updateQuery = `UPDATE logs SET delivery_status = $1, delivery_timestamp = NOW() WHERE job_name = $2`;
    await pool.query(updateQuery, [
      isDelivered ? "DELIVERED" : "FAILED",
      job_name,
    ]);

    console.log("Notification processed");

    return {message: "Notification processed", result: true};
  } catch (error) {
    console.error("Error processing SNS message:", error);
    return {message: "Processing failed", result: false};
  }
};
