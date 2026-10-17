import { executeKw } from './odooClient.js';

// Odoo 17+ uses is_storable instead of type='product' to flag stock-tracked products
export async function getStorableProducts({ limit = 10 } = {}) {
  return executeKw(
    'product.product', 'search_read',
    [[['is_storable', '=', true]]],
    { fields: ['display_name', 'qty_available', 'virtual_available'], limit },
  );
}

// Read-only: search_read only, never write/create/unlink
export async function getAllActiveProducts() {
  return executeKw(
    'product.product', 'search_read',
    [[['active', '=', true]]],
    {
      fields: [
        'display_name', 'default_code', 'barcode', 'type', 'is_storable', 'rent_ok',
        'categ_id', 'uom_id', 'list_price', 'qty_available', 'virtual_available',
      ],
      order: 'id asc',
    },
  );
}

export async function getOnHandQuants({ limit = 10 } = {}) {
  return executeKw(
    'stock.quant', 'search_read',
    [[['location_id.usage', '=', 'internal'], ['quantity', '!=', 0]]],
    { fields: ['product_id', 'location_id', 'quantity', 'reserved_quantity'], limit },
  );
}

export async function getNegativeOnHand() {
  return executeKw(
    'stock.quant', 'search_read',
    [[['location_id.usage', '=', 'internal'], ['quantity', '<', 0]]],
    { fields: ['product_id', 'location_id', 'quantity'] },
  );
}

// The one inventory write: sets a product's sales price (list_price). Used by
// Luxtronic-Daily-Price-Approval after a human approves a price. Reads the
// product first so the caller gets old/new back and a bad id fails clearly.
export async function setProductListPrice(productId, price) {
  const id = Number(productId);
  const newPrice = Number(price);
  if (!Number.isInteger(id) || id <= 0) throw new Error('productId must be a positive integer');
  if (!Number.isFinite(newPrice) || newPrice < 0) throw new Error('price must be a non-negative number');

  const [product] = await executeKw(
    'product.product', 'read', [[id]], { fields: ['display_name', 'list_price'] },
  );
  if (!product) throw new Error(`Product ${id} not found`);

  await executeKw('product.product', 'write', [[id], { list_price: newPrice }]);
  return { productId: id, name: product.display_name, oldPrice: product.list_price, newPrice };
}

// Read-only: one product's current sales price, so callers can check nothing
// changed in Odoo before they overwrite it (used by the price-approval revert).
export async function getProductListPrice(productId) {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('productId must be a positive integer');
  const [product] = await executeKw('product.product', 'read', [[id]], { fields: ['display_name', 'list_price'] });
  if (!product) throw new Error(`Product ${id} not found`);
  return { productId: id, name: product.display_name, price: product.list_price };
}
