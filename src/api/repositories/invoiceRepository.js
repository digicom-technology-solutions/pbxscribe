const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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
    console.error("Error fetching invoice:", error.message);
    return null;
  }
}

/**
 * List invoices with pagination and optional status filter
 * @param {String} customer_id
 * @param {{ limit?: number, status?: string }} options
 * @returns {Promise<{ invoices: Object[], total: number }>}
 */
async function listInvoices(customer_id, {limit = 20, status} = {}) {
  console.log("Listing invoices for customer:", customer_id, "with options:", {
    limit,
    status,
  });
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

module.exports = {
  findInvoiceById,
  listInvoices,
};
