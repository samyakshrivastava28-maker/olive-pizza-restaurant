const { Client } = require('C:/Users/RYZEN/Downloads/olive-pizza-backend/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres:zdXrlesGZLtWqS7uDIrqNaKE@olivepizza-sage-smith.sage.cloud.layerbase.dev:47226/olivepizza?sslmode=require'
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT * FROM canonical_orders ORDER BY created_at DESC LIMIT 1');
  if (res.rows.length > 0) {
    console.log('Columns of canonical_orders:', Object.keys(res.rows[0]));
    console.log('Sample row:', res.rows[0]);
  } else {
    console.log('canonical_orders is empty');
  }
  await client.end();
}

main().catch(console.error);
