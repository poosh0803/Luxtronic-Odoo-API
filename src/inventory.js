import { executeKw } from './odooClient.js';

// Odoo 17+ uses is_storable instead of type='product' to flag stock-tracked products
export async function getStorableProducts({ limit = 10 } = {}) {
  return executeKw(
    'product.product', 'search_read',
    [[['is_storable', '=', true]]],
    { fields: ['display_name', 'qty_available', 'virtual_available'], limit },
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
