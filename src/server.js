import 'dotenv/config';
import express from 'express';
import { getVersion } from './odooClient.js';
import { getStorableProducts, getOnHandQuants, getNegativeOnHand } from './inventory.js';
import { getRentalCounts, getActiveRentalLines, createRentalOrder, returnRentalOrder, cancelRentalOrder } from './rental.js';

const app = express();
const port = process.env.PORT || 4001;

app.use(express.json());

function parseLimit(req) {
  const limit = Number(req.query.limit);
  return Number.isFinite(limit) && limit > 0 ? limit : undefined;
}

app.get('/health', async (req, res) => {
  try {
    const version = await getVersion();
    res.json({ ok: true, odoo: version });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.get('/inventory/products', async (req, res) => {
  try {
    res.json(await getStorableProducts({ limit: parseLimit(req) }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/inventory/quants', async (req, res) => {
  try {
    res.json(await getOnHandQuants({ limit: parseLimit(req) }));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/inventory/negative', async (req, res) => {
  try {
    res.json(await getNegativeOnHand());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/rentals/summary', async (req, res) => {
  try {
    res.json(await getRentalCounts());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/rentals/active', async (req, res) => {
  try {
    res.json(await getActiveRentalLines());
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.post('/rentals', async (req, res) => {
  try {
    const { customer, sku, quantity, startDate, returnDate, price, bond } = req.body || {};
    if (!customer?.phone || !sku || !startDate || !returnDate) {
      return res.status(400).json({ error: 'customer.phone, sku, startDate, and returnDate are required' });
    }
    if (bond && !bond.sku) {
      return res.status(400).json({ error: 'bond.sku is required when bond is given' });
    }
    const result = await createRentalOrder({ customer, sku, quantity, startDate, returnDate, price, bond });
    res.status(201).json(result);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.post('/rentals/return', async (req, res) => {
  try {
    const { phone, sku } = req.body || {};
    if (!phone || !sku) {
      return res.status(400).json({ error: 'phone and sku are required' });
    }
    const result = await returnRentalOrder({ phone, sku });
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.post('/rentals/cancel', async (req, res) => {
  try {
    const { phone, sku } = req.body || {};
    if (!phone || !sku) {
      return res.status(400).json({ error: 'phone and sku are required' });
    }
    const result = await cancelRentalOrder({ phone, sku });
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Luxtronic Odoo API listening on http://localhost:${port}`);
});
