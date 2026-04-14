import {
  StartTranscriptionJobCommand,
  TranscribeClient,
} from "@aws-sdk/client-transcribe";
import {S3Client, HeadObjectCommand} from "@aws-sdk/client-s3";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import pkg from "pg";
const {Pool} = pkg;

const region = process.env.REGION;
const s3Client = new S3Client({region});
const transcribeClient = new TranscribeClient({region});
const secretsClient = new SecretsManagerClient({region});

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
  console.log("Received event:", JSON.stringify(event));

  const pool = await getPool();

  try {
    // 1. Destructure record data safely
    const record = event.Records[0];
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));

    // 2. Fetch Metadata
    const {Metadata} = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );

    const jobName = Metadata?.job_name;
    if (!jobName) throw new Error("Metadata 'job_name' is missing.");
    console.log(`Job Name: ${jobName}`);

    const mediaUri = `s3://${bucket}/${key}`;
    const mediaFormat = key.split(".").pop()?.toLowerCase();

    console.log(`Starting transcription for: ${key}`);

    // 4. Start Transcribe Job
    const transcribeInput = {
      TranscriptionJobName: jobName,
      LanguageCode: "en-US",
      MediaFormat: mediaFormat,
      Media: {MediaFileUri: mediaUri},
      OutputBucketName: process.env.TRANSCRIPTION_BUCKET,
    };

    const {TranscriptionJob} = await transcribeClient.send(
      new StartTranscriptionJobCommand(transcribeInput),
    );

    console.log(
      `Transcription job started: ${TranscriptionJob.TranscriptionJobName}`,
    );

    // 5. Update Database with job status
    const query = `
        UPDATE logs
        SET job_status = $1
        WHERE job_name = $2
      `;
    const values = ["UPLOADED", jobName];
    await pool.query(query, values);

    console.log(`Database updated for job: ${jobName}`);

    return {success: true, job_name: jobName};
  } catch (error) {
    console.error("Handler Error:", error);
    return {success: false, error: error.message};
  }
};
