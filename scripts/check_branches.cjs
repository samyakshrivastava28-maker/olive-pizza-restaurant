const { Client } = require('C:/Users/RYZEN/Downloads/olive-pizza-backend/node_modules/pg');

const client = new Client({
  connectionString: 'postgresql://postgres:zdXrlesGZLtWqS7uDIrqNaKE@olivepizza-sage-smith.sage.cloud.layerbase.dev:47226/olivepizza?sslmode=require'
});

async function main() {
  await client.connect();
  const res = await client.query('SELECT id, name, franchise_id FROM restaurant_branches');
  console.log('Branches:', res.rows);

  const hasBilaspurMain = res.rows.some(b => b.id === 'branch_bilaspur_main');
  if (!hasBilaspurMain) {
    console.log('Inserting branch_bilaspur_main alias for fra_bilaspur...');
    await client.query(`
      INSERT INTO restaurant_branches (
        id, franchise_id, name, address, phone, is_open, accepting_orders,
        current_prep_time, operating_hours, delivery_settings, tax_settings,
        payment_settings, metadata, created_at, updated_at, latitude, longitude
      ) VALUES (
        'branch_bilaspur_main', 'fra_bilaspur', 'Olive Pizza — Bilaspur Main',
        'Vyapar Vihar, Bilaspur, Chhattisgarh 495001', '9179944447', true, true,
        25, '{}', '{"radiusKm": 25}', '{"gstPercentage": 5, "packagingCharge": 20}',
        '{"upi": true, "cards": true, "onlineGateway": true, "cashOnDelivery": true}',
        '{}', NOW(), NOW(), '22.0797000', '82.1409000'
      ) ON CONFLICT (id) DO NOTHING
    `);
    console.log('Inserted branch_bilaspur_main successfully!');
  } else {
    console.log('branch_bilaspur_main already exists.');
  }

  const updated = await client.query('SELECT id, name, franchise_id FROM restaurant_branches');
  console.log('Updated Branches:', updated.rows);
  await client.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
