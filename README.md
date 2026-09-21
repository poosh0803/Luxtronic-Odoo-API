# Luxtronic Odoo API

Internal LAN service (Node.js/Express, no auth — trusted-LAN only) reading and writing
Odoo Online data via its External API, focused on **inventory** first, with rental as a
secondary concern. No frontend lives here; this only serves data to other LAN services
(e.g. **Luxtronic-Rental-Neo**, which posts new rentals here to be created in Odoo).

## Requirements

- Your Odoo Online plan must be **Custom** — the External API is not available on One App Free or Standard plans.
- An API key for the user the scripts will act as: Settings > Users & Companies > Users > (your user) > Account Security tab > New API Key.

## Setup

1. `npm install`
2. Fill in `.env` with your `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, and `ODOO_API_KEY`.
3. `npm test` (runs `test-connection.js`)

This authenticates, prints the server version, then reports:
- inventory: sample storable products with on-hand/forecast quantities, and raw `stock.quant` records
- rental: order/line counts and everything currently out (not yet returned)

## Project layout

- `src/odooClient.js` — thin JSON-RPC client (auth + `execute_kw` wrapper) talking to Odoo's `/jsonrpc` endpoint
- `src/inventory.js` — inventory queries (primary focus)
- `src/rental.js` — rental queries + rental order creation (secondary)
- `src/server.js` — Express REST API (`npm start`, port from `PORT` in `.env`, default 4001)
- `test-connection.js` — smoke test / example usage of both

## API endpoints

- `GET /health` — connectivity + Odoo version check
- `GET /inventory/products?limit=` — storable products with on-hand/forecast qty
- `GET /inventory/quants?limit=` — raw `stock.quant` on-hand records
- `GET /inventory/negative` — products with negative on-hand quantity
- `GET /rentals/summary` — rental order/line counts
- `GET /rentals/active` — rental lines not yet returned
- `POST /rentals` — create, confirm, and mark picked-up a rental order in Odoo. Body:
  ```json
  {
    "customer": { "phone": "0400000000", "email": "jane@example.com" },
    "sku": "PRODUCT-DEFAULT-CODE-OR-BARCODE",
    "quantity": 1,
    "startDate": "2026-09-20 00:00:00",
    "returnDate": "2026-09-27 00:00:00",
    "price": 150,
    "bond": { "sku": "RENTAL-BOND", "amount": 500 }
  }
  ```
  `email` is optional; `customer.phone` is required. `quantity` defaults to 1. `price` is optional and overrides the
  rental line's unit price (otherwise Odoo computes it from the product's own pricelist). `bond` is optional; when
  given, it adds a second, non-rental order line for a refundable security bond — `bond.sku` is looked up the same
  way as `sku` (`default_code` or `barcode`) but does **not** need `rent_ok = true`, and `bond.amount` is required.

  Response: `201` with `{ "orderId": 285, "partnerId": 470, "productId": 537, "bondProductId": 541 }` (`bondProductId`
  is `null` when no `bond` was given), or `422` with `{ "error": "..." }`.

  - Customer is matched by phone or email against an existing `res.partner`; if none matches, a new one is created with the **phone number as the partner name** (matches the existing convention in this Odoo's rental data — customers are named by phone number, not a real name).
  - Product is looked up by `default_code` or `barcode` and must have `rent_ok = true` in Odoo, or the call fails.
  - The order is created, confirmed via `action_confirm` (reserves stock), and immediately marked **picked-up** (`qty_delivered` set to the full quantity) — so a rental posted here is treated as already handed to the customer, not just booked.

- `POST /rentals/return` — mark a picked-up rental as returned. Body: `{ "phone": "0400000000", "sku": "PRODUCT-CODE" }`.
  Looks up the customer (by phone only) and product (by `default_code`/`barcode`), then finds their most recent rental line that is picked-up but not yet returned (`rental_status = "return"`) and sets `qty_returned` to the full quantity, flipping it to **Returned** and restoring stock. `422` if no matching picked-up rental is found (e.g. already returned, or never existed).

- `POST /rentals/update` — edit an existing rental order. Body: `{ "phone", "sku", "startDate"?, "returnDate"?, "price"?, "bond"?: { "sku", "amount" } }`.
  Finds the customer's most recent **confirmed** order containing that rental product (same lookup as cancel) and updates only the fields
  given: rental dates (order + line), the rental line's `price_unit`, and the bond line's price (the bond line is created if the order
  doesn't have one yet; it is never removed, since Odoo won't delete lines from a confirmed order). Returns `{ orderId, rentalLineId, bondLineId }`,
  or `422` if no matching active order exists.

- `POST /rentals/cancel` — cancel an active rental order. Body: `{ "phone": "0400000000", "sku": "PRODUCT-CODE" }`.
  Looks up the customer and product the same way, finds their most recent **confirmed** order (`state = "sale"`) containing that rental product, and calls `action_cancel` on it (order becomes `state = "cancel"`, stays in Odoo for audit — not deleted). `422` if no matching active order is found.

All three write endpoints identify the order/line by **phone + SKU** rather than an Odoo order ID, so Rental-Neo never needs to persist any Odoo-side IDs — resolving whatever "current" rental matches those two values is left to this service.

## Key models for inventory

- `product.product` / `product.template` — `qty_available`, `virtual_available` fields for quick per-product stock lookups. Storable products are flagged with `is_storable = true` (Odoo 17+; older versions used `type = 'product'`).
- `stock.quant` — on-hand quantity per location (`product_id`, `location_id`, `quantity`, `reserved_quantity`).
- `stock.move` / `stock.move.line` — stock movement history.
- `stock.picking` — transfers, receipts, deliveries.
- `stock.location` — warehouses and internal locations.

## Key models for rental

- `sale.order` — rental orders are regular sale orders with `is_rental_order = true`, `rental_start_date`, `rental_return_date`. Cancelling uses `action_cancel` (confirmed orders can't be `unlink`ed directly — Odoo requires cancel first).
- `sale.order.line` — rental lines have `is_rental = true`, `start_date`/`return_date`, and a computed `rental_status`:
  - `pickup` ("Booked") — confirmed, not yet handed to the customer
  - `return` ("Picked-Up") — out with the customer, awaiting return
  - `returned` ("Returned") — back
  The transitions aren't separate action calls — they're driven by two plain stored fields on the line: setting `qty_delivered = product_uom_qty` flips `pickup → return`; setting `qty_returned = product_uom_qty` flips `return → returned`. Both also update the product's live `qty_available`/`qty_in_rent`.
- `product.product` / `product.template` — `rent_ok = true` flags a product as rentable (this is the correct field; `is_product_rentable` only exists, read-only, on `sale.order.line` — don't use it for filtering products).

## Notes

- Odoo Online users have no local password by default; an API key (used as the password in calls) is the recommended credential.
- Odoo is planning to deprecate XML-RPC/JSON-RPC around Odoo 20 (targeted fall 2026) in favor of a new External RPC API — not an issue for Odoo Online today, but worth revisiting later.
- A Python version of the connection test (`test_connection.py`, `requirements.txt`) is still in the repo from initial exploration; the Node.js version above is now the primary implementation.
