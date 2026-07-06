import {S3Client, GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {SESv2Client, SendEmailCommand} from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import {simpleParser} from "mailparser";
import {v4 as uuidv4} from "uuid";
import pkg from "pg";
const {Pool} = pkg;

// 1. Initialize Clients outside the handler
const s3Client = new S3Client({region: process.env.REGION});
const secretsClient = new SecretsManagerClient({region: process.env.REGION});
const ses = new SESv2Client({region: process.env.REGION});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: {SendEmailCommand}},
});

const generateVoicemailLimitAlertHtml = (voicemailCount, voicemailsLimit) => `
  <!DOCTYPE html>
  <html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style type="text/css">
      body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important; }
      @media screen and (max-width: 600px) { .wMobile { width: 100% !important; } }
    </style>
  </head>
  <body bgcolor="#d6d6d6" style="background-color: #d6d6d6;">
    <table border="0" cellpadding="0" cellspacing="0" style="width: 100%;">
      <tr>
        <td align="center">
          <table border="0" cellpadding="0" cellspacing="0" class="wMobile" style="width: 600px; background-color: #ffffff;">
            <tr>
              <td align="center" style="padding: 30px 0;">
                <img src="https://mcusercontent.com/d603034a289f62a1c39e7ae49/images/5eba9c76-ba53-96ad-15eb-73d5b91ee5c8.png" width="190" alt="PBXScribe">
              </td>
            </tr>
            <tr>
              <td bgcolor="#0B263B" style="padding: 10px 30px;">
                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">Voicemail Limit Alert</div>
              </td>
            </tr>
            <tr>
              <td style="padding: 30px 30px 10px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                Your account has used <strong>${voicemailCount} of ${voicemailsLimit}</strong> voicemails this month
                (${Math.round((voicemailCount / voicemailsLimit) * 100)}% of your plan limit).<br><br>
                Once you reach your limit, additional voicemails will be held for review. Consider upgrading your plan if you need more capacity.
              </td>
            </tr>
            <tr>
              <td bgcolor="#f7f7f7" align="center" style="padding: 10px 0;">
                <a href="http://www.dtsit.com/" style="font-family: sans-serif; font-size: 14px; color: #3A3C47; text-decoration: none;">Digicom Technology Solutions | Your Success. Our Passion.</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
`;

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

      const result = await pool.query(
        `SELECT id, client_id, email, pbx_email, firstname, lastname, phone, sms_notification, timezone, user_type, user_role, user_status, two_fa_enabled, two_fa_secret, created_at, updated_at
     FROM users
     WHERE email = $1`,
        [fromAddress],
      );
      console.log(
        `User lookup for ${fromAddress}: ${result.rows.length} found`,
      );

      const client_id = result.rows[0]?.client_id || process.env.DEFAULT_CLIENT; // Default to client_id 6 if not found

      // Client lookup and monthly voicemail count only need client_id — run in parallel
      const [result_client, result_logs] = await Promise.all([
        pool.query(
          `SELECT id, client_name, plan_id, client_category, client_email, client_address, client_phone, timezone, client_status, client_referral_link, pbx_tag_format, tls_encryption_enabled, delivery_failure_notification, usage_alert_notification, system_alert_notification, stripe_customer_id, stripe_subscription_id, created_at, updated_at
       FROM clients
       WHERE id = $1`,
          [client_id],
        ),
        pool.query(
          `SELECT COUNT(*) AS voicemail_count
         FROM logs
         WHERE client_id = $1
         AND voicemail IS NOT NULL
         AND created_at >= DATE_TRUNC('month', NOW())`,
          [client_id],
        ),
      ]);

      console.log(
        `Client lookup for client_id ${client_id}: ${result_client.rows.length} found`,
      );
      const plan_id = result_client.rows[0]?.plan_id;
      const usageAlertEnabled = result_client.rows[0]?.usage_alert_notification;

      const result_plan = await pool.query(
        `SELECT id, plan_name, plan_type, plan_monthly_amount, plan_yearly_amount, plan_voicemails, plan_email_delivery, plan_sms_delivery, plan_voicebox, plan_support, created_at, updated_at
     FROM subscription_plans
     WHERE id = $1`,
        [plan_id],
      );

      const voicemailCount = parseInt(
        result_logs.rows[0]?.voicemail_count || 0,
        10,
      );
      console.log(
        `Voicemail count for client_id ${client_id} this month: ${voicemailCount}`,
      );

      const voicemailsLimit = result_plan.rows[0]?.plan_voicemails || 0;
      console.log(`Voicemail limit for plan_id ${plan_id}: ${voicemailsLimit}`);

      if (
        usageAlertEnabled &&
        voicemailsLimit > 0 &&
        voicemailCount >= voicemailsLimit * 0.8
      ) {
        const clientEmail = result_client.rows[0]?.client_email;
        if (clientEmail) {
          transporter
            .sendMail({
              from: `PBXScribe Support <${process.env.DEFAULT_SUPPORT_TO_EMAIL}>`,
              to: clientEmail,
              subject: "Action required: approaching voicemail limit",
              html: generateVoicemailLimitAlertHtml(
                voicemailCount,
                voicemailsLimit,
              ),
            })
            .then((info) =>
              console.log(
                `Voicemail limit alert sent to ${clientEmail}: ${info.messageId}`,
              ),
            )
            .catch((err) =>
              console.error(
                `Failed to send voicemail limit alert to ${clientEmail}: ${err.message}`,
              ),
            );
        }
      }

      let table = "logs";
      if (voicemailCount >= voicemailsLimit) {
        table = "unprocessed_logs";
      }
      const query = `
        INSERT INTO ${table} (
          client_id, job_name, job_status, filename, email_attachment_type, email_subject, email_from_address, email_from_name, 
		to_email_addresses, email_body, voicemail, delivery_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `;
      const values = [
        client_id,
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
