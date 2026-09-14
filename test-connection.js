import { getVersion, authenticate } from './src/odooClient.js';
import { getStorableProducts, getOnHandQuants } from './src/inventory.js';
import { getRentalCounts, getActiveRentalLines } from './src/rental.js';

async function main() {
  const version = await getVersion();
  console.log('Server version:', version);

  const uid = await authenticate();
  console.log(`Authenticated as uid=${uid}`);

  console.log('\n=== Inventory ===');

  const products = await getStorableProducts({ limit: 10 });
  console.log(`\nSample products (${products.length}):`);
  for (const p of products) {
    console.log(`  '${p.display_name}': on hand=${p.qty_available}, forecast=${p.virtual_available}`);
  }

  const quants = await getOnHandQuants({ limit: 10 });
  console.log(`\nSample stock.quant records (${quants.length}):`);
  for (const q of quants) {
    console.log(`  '${q.product_id[1]}' @ '${q.location_id[1]}': qty=${q.quantity}, reserved=${q.reserved_quantity}`);
  }

  console.log('\n=== Rental ===');

  const counts = await getRentalCounts();
  console.log(`Rental orders: ${counts.totalOrders}, rental lines: ${counts.totalLines}, currently out: ${counts.outLines}`);

  const active = await getActiveRentalLines();
  console.log(`\nCurrently out (${active.length} lines):`);
  for (const l of active) {
    console.log(`  ${l.order_id[1]} - ${l.product_id[1]} - qty ${l.product_uom_qty} - due ${l.return_date}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
