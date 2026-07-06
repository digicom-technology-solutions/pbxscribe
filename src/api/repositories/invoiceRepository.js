const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY, {
  maxNetworkRetries: 1,
});

/**
 * Find an invoice by ID
 * @param {string} id - UUID
 * @returns {Promise<Object|null>}
 */
async function findInvoiceById(id) {
  try {
    const invoice = await stripe.invoices.retrieve(id);
    return invoice || null;
  } catch (error) {
    if (error.code === "resource_missing") {
      return null;
    }
    console.error("Error fetching invoice:", error.message);
    throw error;
  }
}

/**
 * List invoices with pagination and optional status filter
 * @param {String} customer_id
 * @param {{ limit?: number, status?: string }} options
 * @returns {Promise<{ invoices: Object[], total: number }>}
 */
async function listInvoices(customer_id, {limit = 20, status} = {}) {
  const invoices = await stripe.invoices.list({
    customer: customer_id,
    limit,
    status,
  });

  return {
    invoices: invoices.data,
    total: invoices.data.length,
  };
}

/**
 * Apply a referral bonus credit to the referrer's Stripe account.
 * The credit appears as a negative balance transaction and is automatically
 * applied to their next invoice.
 *
 * @param {string} referrerStripeCustomerId - Stripe customer ID of the referrer
 * @param {{ creditCents?: number, currency?: string, referredClientName?: string }} options
 * @returns {Promise<Object>} Stripe balance transaction
 */
async function applyReferralCredit(
  customer_id,
  {creditCents = 1000, currency = "usd", referredClientName = ""} = {},
) {
  return stripe.customers.createBalanceTransaction(customer_id, {
    amount: -creditCents,
    currency,
    description: `Referral bonus${referredClientName ? `: referred ${referredClientName}` : ""}`,
  });
}

/**
 * Adjust a previously applied referral credit by applying a correction transaction.
 * Pass a positive adjustmentCents to reduce the credit, negative to increase it.
 *
 * @param {string} customer_id
 * @param {{ previousCreditCents: number, newCreditCents: number, currency?: string }} options
 * @returns {Promise<Object>} Stripe balance transaction for the adjustment
 */
async function updateReferralCredit(
  customer_id,
  {previousCreditCents, newCreditCents, currency = "usd"},
) {
  const adjustmentCents = previousCreditCents - newCreditCents;
  if (adjustmentCents === 0) return null;

  return stripe.customers.createBalanceTransaction(customer_id, {
    amount: adjustmentCents,
    currency,
    description: `Referral credit adjustment (${previousCreditCents < newCreditCents ? "increase" : "decrease"} from $${(previousCreditCents / 100).toFixed(2)} to $${(newCreditCents / 100).toFixed(2)})`,
  });
}

module.exports = {
  findInvoiceById,
  listInvoices,
  applyReferralCredit,
  updateReferralCredit,
};
