const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      device_id TEXT UNIQUE NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      plan TEXT,
      status TEXT NOT NULL DEFAULT 'inactive',
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
  `);
}

async function findOrCreateUser(deviceId) {
  const existing = await pool.query('SELECT * FROM users WHERE device_id = $1', [deviceId]);
  if (existing.rows.length) return existing.rows[0];
  const inserted = await pool.query(
    'INSERT INTO users (device_id) VALUES ($1) RETURNING *',
    [deviceId]
  );
  return inserted.rows[0];
}

async function upsertSubscription({ userId, stripeCustomerId, stripeSubscriptionId, plan, status, currentPeriodEnd }) {
  const existing = await pool.query(
    'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY id DESC LIMIT 1',
    [userId]
  );
  if (existing.rows.length) {
    await pool.query(
      `UPDATE subscriptions
       SET stripe_customer_id = $1, stripe_subscription_id = $2, plan = $3, status = $4, current_period_end = $5, updated_at = now()
       WHERE id = $6`,
      [stripeCustomerId, stripeSubscriptionId, plan, status, currentPeriodEnd, existing.rows[0].id]
    );
  } else {
    await pool.query(
      `INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, stripeCustomerId, stripeSubscriptionId, plan, status, currentPeriodEnd]
    );
  }
}

async function getSubscriptionByDeviceId(deviceId) {
  const result = await pool.query(
    `SELECT s.* FROM subscriptions s
     JOIN users u ON u.id = s.user_id
     WHERE u.device_id = $1
     ORDER BY s.id DESC LIMIT 1`,
    [deviceId]
  );
  return result.rows[0] || null;
}

async function getSubscriptionByStripeCustomerId(stripeCustomerId) {
  const result = await pool.query(
    'SELECT * FROM subscriptions WHERE stripe_customer_id = $1 ORDER BY id DESC LIMIT 1',
    [stripeCustomerId]
  );
  return result.rows[0] || null;
}

module.exports = {
  pool,
  initSchema,
  findOrCreateUser,
  upsertSubscription,
  getSubscriptionByDeviceId,
  getSubscriptionByStripeCustomerId
};
