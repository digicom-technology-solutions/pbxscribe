import {
  TranscribeClient,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {S3Client, GetObjectCommand} from "@aws-sdk/client-s3";
import sesClientModule from "@aws-sdk/client-ses";
import nodemailer from "nodemailer";
import twilio from "twilio";
import pkg from "pg";
const {Pool} = pkg;

const region = process.env.REGION;
const transcribeClient = new TranscribeClient({region});
const s3Client = new S3Client({region});
const secretsClient = new SecretsManagerClient({region});
const ses = new sesClientModule.SESClient({
  region,
});
const transporter = nodemailer.createTransport({
  SES: {ses, aws: sesClientModule},
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

// Global cache variables
let cachedCredentials = null;
let cachedPool = null;

async function sendSms(
  emailFromName,
  to,
  transcription,
  caller,
  time,
  duration,
  emailLog,
) {
  try {
    const body = `Voicemail for ${emailFromName?.replace("Voicemail:", "")?.trim()} from ${caller}\n\nMESSAGE TRANSCRIPTION:\n${transcription}\n\nTIME:\n${time}\n\nDURATION:\n${duration}\n\n- DTS Transcription`;

    await twilioClient.messages.create({
      to,
      from: process.env.TWILIO_PHONENUMBER_DEFAULT,
      body,
    });
  } catch (err) {
    console.error(`SMS Failed: ${err.message}`);
  }
  return emailLog;
}

/**
 * Helper to generate the common HTML structure
 */
const getEmailTemplate = (title, bodyIntro, params) => {
  // Common CSS/Header shared by both emails
  const styles = `
    body { height: 100% !important; margin: 0 auto !important; padding: 0 !important; width: 100% !important }
    .wColor { color: #FFFFFF !important; }
    .bColor { color: #3A3C47 !important; }
    @media screen and (max-width: 600px) {
        .wMobile { width: 100% !important; }
        .wInner { width: 90% !important; }
        .H20 { height: 20px !important; line-height: 20px !important; }
    }
  `;

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style type="text/css">${styles}</style>
    </head>
    <body bgcolor="#d6d6d6" style="background-color: #d6d6d6">
        <table border="0" cellpadding="0" cellspacing="0" style="width: 100%">
            <tr>
                <td align="center">
                    <table border="0" cellpadding="0" cellspacing="0" class="wMobile" style="width: 600px; background-color: #ffffff;">
                        <tr>
                            <td align="center" style="padding: 30px 0;">
                                <img src="https://mcusercontent.com/d603034a289f62a1c39e7ae49/images/5eba9c76-ba53-96ad-15eb-73d5b91ee5c8.png" width="190" alt="Logo">
                            </td>
                        </tr>
                        <tr>
                            <td bgcolor="#0B263B" style="padding: 10px 30px;">
                                <div style="font-family: sans-serif; font-size: 18px; color: #FFFFFF; font-weight: 700;">${title}</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 20px 30px; font-family: sans-serif; font-size: 16px; color: #3A3C47; line-height: 26px;">
                                ${bodyIntro}
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 0 30px 30px 30px;">
                                <table width="100%" bgcolor="#F1FBF7" style="border-radius: 20px; padding: 20px;">
                                    ${renderRow("MESSAGE TRANSCRIPTION", params.transcription)}
                                    ${renderRow("CALLER ID", params.caller)}
                                    ${renderRow("TIME", params.time)}
                                    ${renderRow("DURATION", params.duration)}
                                </table>
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
};

const renderRow = (label, value) => `
    <tr>
        <td style="padding-top: 15px;">
            <p style="margin:0; font-family: sans-serif; font-size: 12px; color: #008AA2; letter-spacing: 1px;">${label}</p>
            <p style="margin:5px 0 0 0; font-family: sans-serif; font-size: 16px; font-weight: 600; color: #3A3C47;">${value}</p>
            <div style="border-bottom: 1px dashed #50A2B0; padding-top: 10px;"></div>
        </td>
    </tr>
`;

const extractVoicemailData = (text) => {
  const patterns = {
    caller: /Caller\s*-\s*(?<caller>.*)/i,
    time: /Time\s*-\s*(?<time>.*)/i,
    duration: /Duration\s*-\s*(?<duration>.*)/i,
  };

  const results = {};

  for (const [key, regex] of Object.entries(patterns)) {
    const match = text.match(regex);
    results[key] = match ? match.groups[key].trim() : null;
  }

  let duration_ms = 0;
  if (results.duration) {
    const durationStr = results.duration.toLowerCase();

    const minutesMatch = durationStr.match(/(\d+)m/);
    const secondsMatch = durationStr.match(/(\d+)s/);

    const minutes = minutesMatch ? parseInt(minutesMatch[1], 10) : 0;
    const seconds = secondsMatch ? parseInt(secondsMatch[1], 10) : 0;

    duration_ms = (minutes * 60 + seconds) * 1000;
  }

  const output = {
    caller: results.caller,
    time: results.time,
    duration: results.duration,
    duration_ms: duration_ms,
  };

  return output;
};

/**
 * Optimized Main Function
 */
async function sendEmail(params, isAlert = false) {
  // Pre-process cleaner name
  const cleanName = (params.email_from_name || "")
    .replace("Voicemail:", "")
    .trim();

  // Set dynamic content based on alert status
  const title = isAlert ? "Delivery Failure Message" : "New Voicemail Message";
  const bodyIntro = isAlert
    ? `The transcribed message below was undelivered.<br /><b style="color: red;">Please investigate ASAP</b>.`
    : `Hi ${cleanName},<br /><br />You have a new voicemail from <b>${params.caller}</b>.<br /><br />Please find the audio file attached.`;

  const html = getEmailTemplate(title, bodyIntro, params);
  const to = process.env.TEST_EMAIL;

  try {
    const info = await transporter.sendMail({
      from: `SaaS DTS Transcription <${process.env.FROM_EMAIL}>`,
      to,
      subject: `Voicemail for ${cleanName} from ${params.caller}`,
      html,
      attachments: [
        {
          content: Buffer.from(params.audioString, "base64"),
          contentType: "audio/wav",
          filename: params.voicemailS3Key,
        },
      ],
    });

    console.log(`Email sent: ${info.messageId}`);
    return {
      message: "Message sent successfully.",
      messageId: info.messageId,
      result: true,
    };
  } catch (error) {
    console.error(`Failed to send message: ${error.message}`);
    return {message: "Failed to send message.", result: false};
  }
}

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

// --- Main Handler ---
export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));

  const pool = await getPool();

  const jobName = event.detail.TranscriptionJobName;
  let jobStatus = "PROCESS_INITIATED";
  let finalMessageId = "";

  try {
    // 1. Fetch DB Record
    const query = `SELECT * FROM logs WHERE job_name = $1`;
    const dbData = await pool.query(query, [jobName]);

    if (!dbData.rows?.length)
      return {success: true, message: "No DB item found"};

    let {
      client_id,
      email_from_name,
      email_from_address,
      email_body,
      voicemail: voicemailUri,
    } = dbData.rows[0];

    console.log("DB Data:", JSON.stringify(dbData.rows[0]));

    // 2. Get Transcription URI
    const transcribeData = await transcribeClient.send(
      new GetTranscriptionJobCommand({
        TranscriptionJobName: jobName,
      }),
    );
    const transcriptUri =
      transcribeData.TranscriptionJob.Transcript.TranscriptFileUri;

    console.log("Transcript URI:", transcriptUri);

    let caller = "--",
      time = "--",
      duration = "--",
      duration_ms = 0;
    if (email_body) {
      const {
        caller: c,
        time: t,
        duration: d,
        duration_ms: dm,
      } = extractVoicemailData(email_body);
      caller = c || "--";
      time = t || "--";
      duration = d || "--";
      duration_ms = dm || 0;
    }

    console.log("Extracted Voicemail Data:", {
      caller,
      time,
      duration,
      duration_ms,
    });

    // 4. Parallel S3 Fetching (Transcription + Audio)
    const transcriptKey = transcriptUri.split("/").pop();
    const voicemailKey = voicemailUri.split("/").pop();

    const [transcriptionRes, voicemailRes] = await Promise.all([
      s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.TRANSCRIPTION_BUCKET,
          Key: transcriptKey,
        }),
      ),
      s3Client.send(
        new GetObjectCommand({
          Bucket: process.env.VOICEMAIL_BUCKET,
          Key: `${process.env.VOICEMAIL_PREFIX}/${voicemailKey}`,
        }),
      ),
    ]);

    const transcriptJson = JSON.parse(
      await transcriptionRes.Body.transformToString(),
    );
    const transcription = transcriptJson.results.transcripts
      .map((t) => t.transcript)
      .join(" ");
    const audioBytes = await voicemailRes.Body.transformToByteArray();

    console.log("Transcript JSON:", JSON.stringify(transcriptJson));

    const isSpam = email_from_address !== process.env.TEST_EMAIL && false; // Placeholder for your logic
    let emailParams = {
      email_from_address,
      email_from_name,
      transcription,
      caller,
      time,
      duration,
      audioString: audioBytes,
      voicemailS3Key: voicemailKey,
    };

    console.log("Email Params:", {
      email_from_address,
      email_from_name,
      transcription,
      caller,
      time,
      duration,
      voicemailKey,
    });

    let clientData = null;
    if (isSpam) {
      jobStatus = "SPAM_DETECTED";
      const res = await sendEmail(emailParams, true);
      finalMessageId = res.messageId;
    } else {
      try {
        const clientApiQuery = `SELECT * FROM users WHERE client_id = $1 AND email = $2`;
        const client = await pool.query(clientApiQuery, [
          client_id,
          email_from_address,
        ]);

        console.log("Client Data:", JSON.stringify(client.rows));

        if (client?.rows?.length) {
          clientData = client.rows[0];
          if (
            email_from_address?.toLowerCase() !==
            clientData?.email?.toLowerCase()
          ) {
            email_from_address = process.env.DEFAULT_TO_EMAIL;
          }

          console.log("Email From Address:", email_from_address);

          const res = await sendEmail({
            ...emailParams,
            email_from_address,
          });
          finalMessageId = res.messageId;
          jobStatus = "PROCESS_COMPLETED";

          if (clientData?.phone && clientData?.sms_notification === true) {
            console.log("Sending SMS to:", clientData?.phone);
            await sendSms(
              email_from_name,
              clientData?.phone,
              transcription,
              caller,
              time,
              duration,
            );
          }
        } else {
          console.log("No Company Found for:", email_from_address);
          jobStatus = "NO_COMPANY_FOUND";
          const res = await sendEmail(emailParams, true);
          finalMessageId = res.messageId;
        }
      } catch (err) {
        console.error("Client API or Email flow failed", err);
        jobStatus = "EMAIL_VALIDATION_FAILED";
        const res = await sendEmail(emailParams, true);
        finalMessageId = res.messageId;
      }
    }

    // 6. Final DB Update
    const messageIdClean = finalMessageId.replace(/[<>]/g, "").split("@")[0];

    const fields = ["job_status = $1", "message_id = $2", "duration_ms = $3"];
    const values = [jobStatus, messageIdClean, duration_ms];

    if (clientData?.phone && clientData?.sms_notification === true) {
      values.push("DELIVERED", jobName);
      fields.push("sms_delivery_status = $4", "sms_delivery_timestamp = NOW()");
      // jobName becomes $5 in this branch
    } else {
      values.push(jobName);
      // jobName becomes $4 in this branch
    }
    const updateQuery = `UPDATE logs SET ${fields.join(", ")} WHERE job_name = $${values.length}`;
    console.log("Executing DB Update:", {
      query: updateQuery,
      values,
    });
    await pool.query(updateQuery, values);

    console.log("Job status updated for:", jobName);

    return {success: true, jobName, jobStatus};
  } catch (error) {
    console.error("Critical Failure:", error);
    return {success: false, error: error.message};
  }
};
