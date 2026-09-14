import { executeKw } from './odooClient.js';

export async function getRentalCounts() {
  const totalOrders = await executeKw('sale.order', 'search_count', [[['is_rental_order', '=', true]]]);
  const totalLines = await executeKw('sale.order.line', 'search_count', [[['is_rental', '=', true]]]);
  const outLines = await executeKw('sale.order.line', 'search_count', [
    [['is_rental', '=', true], ['rental_status', '=', 'return']],
  ]);
  return { totalOrders, totalLines, outLines };
}

export async function getActiveRentalLines() {
  return executeKw(
    'sale.order.line', 'search_read',
    [[['is_rental', '=', true], ['rental_status', '=', 'return']]],
    { fields: ['order_id', 'product_id', 'product_uom_qty', 'return_date'] },
  );
}

async function findPartnerByContact({ phone, email }) {
  const domain = [];
  if (phone) domain.push(['phone', '=', phone]);
  if (email) domain.push(['email', '=', email]);
  if (domain.length === 0) return null;
  if (domain.length === 2) domain.unshift('|');
  const matches = await executeKw('res.partner', 'search_read', [domain], { fields: ['id'], limit: 1 });
  return matches[0]?.id ?? null;
}

async function findOrCreatePartner({ phone, email }) {
  const existingId = await findPartnerByContact({ phone, email });
  if (existingId) return existingId;
  if (!phone) throw new Error('customer.phone is required to create a new partner');
  return executeKw('res.partner', 'create', [{ name: phone, phone, email: email || false }]);
}

// requireRentable is false for one-off products (e.g. the security bond)
// that ride along on a rental order but aren't themselves rented out.
async function findProductBySku(sku, { requireRentable = true } = {}) {
  const matches = await executeKw(
    'product.product', 'search_read',
    [['|', ['default_code', '=', sku], ['barcode', '=', sku]]],
    { fields: ['id', 'display_name', 'rent_ok'], limit: 1 },
  );
  if (!matches.length) throw new Error(`No product found for SKU/barcode "${sku}"`);
  if (requireRentable && !matches[0].rent_ok) throw new Error(`Product "${matches[0].display_name}" is not configured as rentable in Odoo`);
  return matches[0];
}

export async function createRentalOrder({ customer, sku, quantity = 1, startDate, returnDate, price, bond, confirm = true }) {
  if (!startDate || !returnDate) throw new Error('startDate and returnDate are required');

  const product = await findProductBySku(sku);
  const partnerId = await findOrCreatePartner(customer);

  const rentalLine = {
    product_id: product.id,
    product_uom_qty: quantity,
    is_rental: true,
    start_date: startDate,
    return_date: returnDate,
    // marks the line picked-up immediately (rental_status flips 'pickup' -> 'return') instead of leaving it booked
    qty_delivered: quantity,
  };
  // Callers pass the agreed price (e.g. a discounted final fee) rather than
  // letting Odoo fall back to the product's own pricelist-computed rate.
  if (price !== undefined && price !== null) rentalLine.price_unit = price;

  const orderLine = [[0, 0, rentalLine]];

  let bondProductId = null;
  if (bond?.amount) {
    const bondProduct = await findProductBySku(bond.sku, { requireRentable: false });
    bondProductId = bondProduct.id;
    // A plain (non-rental) line for the refundable security bond, priced at
    // whatever was actually collected for this booking.
    orderLine.push([0, 0, {
      product_id: bondProduct.id,
      product_uom_qty: 1,
      price_unit: bond.amount,
    }]);
  }

  const orderId = await executeKw('sale.order', 'create', [{
    partner_id: partnerId,
    is_rental_order: true,
    rental_start_date: startDate,
    rental_return_date: returnDate,
    order_line: orderLine,
  }]);

  if (confirm) {
    await executeKw('sale.order', 'action_confirm', [[orderId]]);
  }

  return { orderId, partnerId, productId: product.id, bondProductId };
}

export async function returnRentalOrder({ phone, sku }) {
  if (!phone || !sku) throw new Error('phone and sku are required');

  const partnerId = await findPartnerByContact({ phone });
  if (!partnerId) throw new Error(`No customer found for phone "${phone}"`);

  const product = await findProductBySku(sku);

  const lines = await executeKw(
    'sale.order.line', 'search_read',
    [[
      ['is_rental', '=', true],
      ['product_id', '=', product.id],
      ['order_id.partner_id', '=', partnerId],
      ['rental_status', '=', 'return'], // 'return' = picked-up, awaiting return
    ]],
    { fields: ['order_id', 'product_uom_qty'], order: 'id desc', limit: 1 },
  );
  if (!lines.length) throw new Error(`No active (picked-up) rental found for phone "${phone}" and sku "${sku}"`);

  const line = lines[0];
  await executeKw('sale.order.line', 'write', [[line.id], { qty_returned: line.product_uom_qty }]);

  return { orderId: line.order_id[0], lineId: line.id };
}

export async function cancelRentalOrder({ phone, sku }) {
  if (!phone || !sku) throw new Error('phone and sku are required');

  const partnerId = await findPartnerByContact({ phone });
  if (!partnerId) throw new Error(`No customer found for phone "${phone}"`);

  const product = await findProductBySku(sku);

  const orders = await executeKw(
    'sale.order', 'search_read',
    [[
      ['partner_id', '=', partnerId],
      ['state', '=', 'sale'],
      ['order_line.product_id', '=', product.id],
      ['order_line.is_rental', '=', true],
    ]],
    { fields: ['id'], order: 'id desc', limit: 1 },
  );
  if (!orders.length) throw new Error(`No active rental order found for phone "${phone}" and sku "${sku}"`);

  const orderId = orders[0].id;
  await executeKw('sale.order', 'action_cancel', [[orderId]]);

  return { orderId, state: 'cancel' };
}
