import {S3Client, GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {simpleParser} from "mailparser";
import {v4 as uuidv4} from "uuid";
import pkg from "pg";
const {Pool} = pkg;

// 1. Initialize Clients outside the handler
const s3Client = new S3Client({region: process.env.REGION});
const secretsClient = new SecretsManagerClient({region: process.env.REGION});

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
  console.log(`Event received: ${JSON.stringify(event)}`);
  try {
    // Initialize the pool (will use cache if warm)
    const pool = await getPool();

    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    const {Body} = await s3Client.send(
      new GetObjectCommand({Bucket: bucket, Key: key}),
    );
    const rawEmail = await Body.transformToByteArray();
    const parsedEmail = await simpleParser(Buffer.from(rawEmail));

    const attachments = parsedEmail.attachments || [];
    if (attachments.length === 0)
      return {message: "No attachments", result: true};

    const fromAddress =
      parsedEmail.replyTo?.value[0]?.address ||
      parsedEmail.from?.value[0]?.address;
    const fromName =
      parsedEmail.replyTo?.value[0]?.name || parsedEmail.from?.value[0]?.name;
    const toAddress = parsedEmail.to?.value[0]?.address;

    const processPromises = attachments.map(async (attachment) => {
      const job_name = uuidv4();
      const filename = attachment.filename || `unnamed_${job_name}`;
      const destinationKey = `${process.env.VOICEMAILS_PREFIX}/${filename}`;
      const voicemail = `https://${bucket}.s3.${process.env.REGION}.amazonaws.com/${destinationKey}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: destinationKey,
          Body: attachment.content,
          Metadata: {job_name},
        }),
      );

      console.log(`Attachment uploaded to S3: ${voicemail}`);
      const query = `
        INSERT INTO logs (
          client_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, 
		to_email_addresses, email_body, voicemail, delivery_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;

      const values = [
        1,
        job_name,
        "UPLOADED",
        filename,
        attachment.contentType,
        parsedEmail.subject,
        fromAddress,
        fromName,
        toAddress,
        parsedEmail.text,
        voicemail,
        "PROCESSING",
      ];

      console.log(`Database updated for job: ${job_name}`);
      return pool.query(query, values);
    });

    await Promise.all(processPromises);
    return {message: "Processed successfully", result: true};
  } catch (error) {
    console.error("Handler Error:", error);
    return {message: "Failed to process", result: false};
  }
};
