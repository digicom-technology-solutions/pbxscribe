-- Payment methods are now managed entirely by Stripe.
-- No local storage needed as invoices have no FK dependency on this table.
DROP TABLE IF EXISTS payment_methods;
