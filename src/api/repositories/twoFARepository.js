const twilio = require("twilio");
const {SESClient, SendEmailCommand} = require("@aws-sdk/client-ses");
const {authenticator} = require("otplib");
const QRCode = require("qrcode");

let twilioClient;
let sesClient;

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

const getSESClient = () => {
  if (!sesClient) {
    sesClient = new SESClient({region: process.env.AWS_REGION || "us-east-1"});
  }
  return sesClient;
};

/**
 * Sends a 2FA code via SMS.
 */
async function sendText(two_fa, phonenumber) {
  const client = getTwilioClient();
  try {
    const message = await client.messages.create({
      body: `Your 2FA code is: ${two_fa}`,
      from: process.env.TWILIO_PHONENUMBER_DEFAULT,
      to: phonenumber,
    });
    return message.sid;
  } catch (error) {
    console.error(`[Twilio Error]:`, error.message);
    throw new Error(`SMS delivery failed.`);
  }
}

/**
 * Sends a 2FA code via email.
 */
async function sendEmail(two_fa, email) {
  const client = getSESClient();
  const params = {
    Source: process.env.SES_FROM_EMAIL,
    Destination: {ToAddresses: [email]},
    Message: {
      Subject: {Data: "Your Verification Code"},
      Body: {
        Html: {Data: `<p>Your 2FA code is: <strong>${two_fa}</strong></p>`},
        Text: {Data: `Your 2FA code is: ${two_fa}`},
      },
    },
  };

  try {
    const command = new SendEmailCommand(params);
    const result = await client.send(command);
    return result.MessageId;
  } catch (error) {
    console.error(`[AWS SES Error]:`, error.message);
    throw new Error(`Email delivery failed.`);
  }
}

/**
 * Create a new 2FA entry
 * @param {Pool} pool - pg.Pool instance
 * @param {{ client_id: number, user_id: number, phone?: string, email?: string }} fields
 * @returns {Promise<Object>} Created 2FA row
 */
async function createTwoFA(pool, {client_id, user_id, phone, email}) {
  const two_fa = Math.floor(100000 + Math.random() * 900000).toString();

  const result = await pool.query(
    `INSERT INTO two_fa (client_id, user_id, two_fa, phone, email)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, client_id, user_id, email, phone, two_fa, created_at, updated_at`,
    [client_id, user_id, two_fa, phone, email],
  );
  return result.rows[0];
}

/**
 * Set up a new 2FA secret and QR code for a user
 * @param {string} email - The email address of the user
 * @returns {Promise<Object>} The secret and QR code URL for the 2FA setup
 */
async function twoFASetup(email) {
  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(email, "pbxscribe", secret);

  const qrCodeUrl = await QRCode.toDataURL(otpauth);
  return {secret, qrCodeUrl};
}

/**
 * Verify a 2FA token
 * @param {string} token - The 2FA token to verify
 * @param {string} secret - The secret used to generate the 2FA token
 * @returns {Promise<boolean>} Whether the token is valid
 */
async function twoFAVerify(token, secret) {
  return authenticator.check(token, secret);
}

module.exports = {
  createTwoFA,
  sendText,
  sendEmail,
  twoFASetup,
  twoFAVerify,
};
