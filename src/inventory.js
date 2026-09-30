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
