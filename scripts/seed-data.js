/**
 * Seed Script for OpenCommerce
 * Creates sample data for testing and demo purposes
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://opencommerce:opencommerce_dev_password@localhost:5432/opencommerce'
});

async function seedData() {
  console.log('🌱 Starting seed data creation...\n');

  try {
    // 1. Create Users
    console.log('👤 Creating users...');
    await createUsers();
    console.log('✅ Users created\n');

    // 2. Create Products
    console.log('📦 Creating products...');
    await createProducts();
    console.log('✅ Products created\n');

    // 3. Create Promotions
    console.log('🎉 Creating promotions...');
    await createPromotions();
    console.log('✅ Promotions created\n');

    // 4. Create Inventory
    console.log('📊 Creating inventory...');
    await createInventory();
    console.log('✅ Inventory created\n');

    // 5. Create Sample Orders
    console.log('🛒 Creating sample orders...');
    await createSampleOrders();
    console.log('✅ Sample orders created\n');

    console.log('🎊 Seed data creation completed successfully!\n');
    console.log('📝 Login credentials:');
    console.log('   Cashier - PIN: 1234');
    console.log('   Manager - PIN: 5678');
    console.log('   Admin   - PIN: 9999\n');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function createUsers() {
  const users = [
    {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'cashier1',
      pin: '1234',
      role: 'CASHIER',
      storeId: 'STORE_001',
      active: true
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      username: 'manager1',
      pin: '5678',
      role: 'MANAGER',
      storeId: 'STORE_001',
      active: true
    },
    {
      id: '00000000-0000-0000-0000-000000000003',
      username: 'admin1',
      pin: '9999',
      role: 'ADMIN',
      storeId: 'STORE_001',
      active: true
    }
  ];

  for (const user of users) {
    const pinHash = await bcrypt.hash(user.pin, 12);

    await pool.query(`
      INSERT INTO auth_service.users (id, username, pin_hash, role, store_id, active, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (username) DO NOTHING
    `, [user.id, user.username, pinHash, user.role, user.storeId, user.active]);

    console.log(`  ✓ Created ${user.role}: ${user.username} (PIN: ${user.pin})`);
  }
}

async function createProducts() {
  const products = [
    // Beer
    { barcode: '012345678901', name: 'Corona Extra 6-Pack', price: 12.99, category: 'BEER', age: 21, taxable: true },
    { barcode: '012345678902', name: 'Budweiser 12-Pack', price: 18.99, category: 'BEER', age: 21, taxable: true },
    { barcode: '012345678903', name: 'Heineken 6-Pack', price: 13.99, category: 'BEER', age: 21, taxable: true },
    { barcode: '012345678904', name: 'Blue Moon 6-Pack', price: 12.49, category: 'BEER', age: 21, taxable: true },

    // Wine
    { barcode: '012345678905', name: 'Red Wine Bottle', price: 19.99, category: 'WINE', age: 21, taxable: true },
    { barcode: '012345678906', name: 'White Wine Bottle', price: 17.99, category: 'WINE', age: 21, taxable: true },
    { barcode: '012345678907', name: 'Champagne', price: 34.99, category: 'WINE', age: 21, taxable: true },

    // Spirits
    { barcode: '012345678908', name: 'Vodka 750ml', price: 24.99, category: 'SPIRITS', age: 21, taxable: true },
    { barcode: '012345678909', name: 'Whiskey 750ml', price: 39.99, category: 'SPIRITS', age: 21, taxable: true },
    { barcode: '012345678910', name: 'Tequila 750ml', price: 29.99, category: 'SPIRITS', age: 21, taxable: true },
    { barcode: '012345678911', name: 'Rum 750ml', price: 22.99, category: 'SPIRITS', age: 21, taxable: true },

    // Snacks
    { barcode: '012345678912', name: 'Potato Chips', price: 3.99, category: 'SNACKS', age: 0, taxable: true },
    { barcode: '012345678913', name: 'Pretzels', price: 2.99, category: 'SNACKS', age: 0, taxable: true },
    { barcode: '012345678914', name: 'Mixed Nuts', price: 5.99, category: 'SNACKS', age: 0, taxable: true },

    // Beverages
    { barcode: '012345678915', name: 'Soda 2L', price: 2.49, category: 'BEVERAGES', age: 0, taxable: true },
    { barcode: '012345678916', name: 'Energy Drink', price: 3.49, category: 'BEVERAGES', age: 0, taxable: true },
    { barcode: '012345678917', name: 'Water 24-Pack', price: 5.99, category: 'BEVERAGES', age: 0, taxable: false },

    // Misc
    { barcode: '012345678918', name: 'Ice Bag 10lb', price: 3.99, category: 'MISC', age: 0, taxable: false },
    { barcode: '012345678919', name: 'Candy Bar', price: 1.99, category: 'MISC', age: 0, taxable: true },
    { barcode: '012345678920', name: 'Gum Pack', price: 1.49, category: 'MISC', age: 0, taxable: true },
  ];

  for (const product of products) {
    const productId = `${product.barcode.slice(-8)}-0000-0000-0000-000000000000`;

    await pool.query(`
      INSERT INTO product_service.products (
        id, barcode, name, description, base_price,
        channel_pricing, merchandise_code,
        age_verification_required, minimum_age,
        taxable, active, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        '{"IN_STORE": 0.00, "DOORDASH": 0.30, "UBER_EATS": 0.25, "WEBSITE": 0.10}'::jsonb,
        $6, $7, $8, $9, true, NOW()
      )
      ON CONFLICT (barcode) DO NOTHING
    `, [
      productId,
      product.barcode,
      product.name,
      `Quality ${product.category.toLowerCase()} product`,
      product.price,
      product.category,
      product.age > 0,
      product.age,
      product.taxable
    ]);

    console.log(`  ✓ ${product.name} - $${product.price}`);
  }
}

async function createPromotions() {
  const promotions = [
    {
      id: '10000000-0000-0000-0000-000000000001',
      name: 'Beer Sale - 3 for $36',
      description: 'Buy any 3 six-packs for $36',
      type: 'MIX_AND_MATCH',
      discountType: 'PRICE_EACH',
      discountValue: 12.00,
      minQuantity: 3,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
      active: true
    },
    {
      id: '10000000-0000-0000-0000-000000000002',
      name: 'Wine Wednesday',
      description: '20% off all wine on Wednesdays',
      type: 'PERCENT_OFF',
      discountType: 'PERCENT',
      discountValue: 20,
      minQuantity: 1,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      daysOfWeek: [3], // Wednesday only
      active: true
    },
    {
      id: '10000000-0000-0000-0000-000000000003',
      name: 'BOGO Snacks',
      description: 'Buy one snack, get one 50% off',
      type: 'BOGO',
      discountType: 'PERCENT',
      discountValue: 50,
      minQuantity: 2,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      active: true
    },
    {
      id: '10000000-0000-0000-0000-000000000004',
      name: 'Happy Hour',
      description: '$5 off orders over $50',
      type: 'DOLLAR_OFF',
      discountType: 'DOLLAR',
      discountValue: 5.00,
      minPurchaseAmount: 50.00,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      daysOfWeek: [5, 6], // Friday and Saturday
      startTime: '17:00',
      endTime: '19:00',
      active: true
    },
    {
      id: '10000000-0000-0000-0000-000000000005',
      name: 'Combo Deal - Vodka + Mixer',
      description: 'Vodka 750ml + 2L Soda for $25',
      type: 'COMBO',
      discountType: 'FIXED_PRICE',
      discountValue: 25.00,
      startDate: new Date('2024-01-01'),
      endDate: new Date('2025-12-31'),
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      active: true
    }
  ];

  for (const promo of promotions) {
    await pool.query(`
      INSERT INTO product_service.promotions (
        id, name, description, promotion_type, discount_type, discount_value,
        min_quantity, min_purchase_amount, start_date, end_date,
        days_of_week, start_time, end_time, active, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      promo.id,
      promo.name,
      promo.description,
      promo.type,
      promo.discountType,
      promo.discountValue,
      promo.minQuantity || null,
      promo.minPurchaseAmount || null,
      promo.startDate,
      promo.endDate,
      promo.daysOfWeek,
      promo.startTime || null,
      promo.endTime || null,
      promo.active
    ]);

    console.log(`  ✓ ${promo.name}`);
  }
}

async function createInventory() {
  // Get all products
  const products = await pool.query('SELECT id, barcode FROM product_service.products');

  for (const product of products.rows) {
    await pool.query(`
      INSERT INTO inventory_service.inventory (
        product_id, store_id, on_hand_quantity, available_quantity,
        reserved_quantity, reorder_point, reorder_quantity, created_at
      )
      VALUES ($1, 'STORE_001', 50, 50, 0, 10, 24, NOW())
      ON CONFLICT (product_id, store_id) DO NOTHING
    `, [product.id]);
  }

  console.log(`  ✓ Created inventory for ${products.rows.length} products (50 units each)`);
}

async function createSampleOrders() {
  const orders = [
    {
      id: '20000000-0000-0000-0000-000000000001',
      orderNumber: 'TXN-00001',
      channel: 'IN_STORE',
      status: 'COMPLETED',
      subtotal: 38.97,
      tax: 2.73,
      total: 41.70,
      items: [
        { barcode: '012345678901', quantity: 3, unitPrice: 12.99 }
      ]
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      orderNumber: 'DD-00001',
      channel: 'DOORDASH',
      status: 'NEW',
      customerName: 'John Doe',
      customerPhone: '+1-555-0123',
      deliveryAddress: { street: '123 Main St', city: 'Ocala', state: 'FL', zip: '34470' },
      subtotal: 33.78,
      tax: 2.36,
      deliveryFee: 4.99,
      tip: 5.00,
      total: 46.13,
      items: [
        { barcode: '012345678901', quantity: 2, unitPrice: 16.89 }
      ]
    },
    {
      id: '20000000-0000-0000-0000-000000000003',
      orderNumber: 'UE-00001',
      channel: 'UBER_EATS',
      status: 'PREPARING',
      customerName: 'Jane Smith',
      customerPhone: '+1-555-0456',
      deliveryAddress: { street: '456 Oak Ave', city: 'Ocala', state: 'FL', zip: '34471' },
      subtotal: 32.48,
      tax: 2.27,
      deliveryFee: 3.99,
      tip: 4.00,
      total: 42.74,
      items: [
        { barcode: '012345678905', quantity: 2, unitPrice: 16.24 }
      ]
    }
  ];

  for (const order of orders) {
    // Insert order
    await pool.query(`
      INSERT INTO order_service.retail_transactions (
        transaction_id, order_number, channel, status,
        customer_name, customer_phone, delivery_address,
        subtotal, tax, delivery_fee, tip, total,
        business_date, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_DATE, NOW())
      ON CONFLICT (transaction_id) DO NOTHING
    `, [
      order.id,
      order.orderNumber,
      order.channel,
      order.status,
      order.customerName || null,
      order.customerPhone || null,
      order.deliveryAddress ? JSON.stringify(order.deliveryAddress) : null,
      order.subtotal,
      order.tax,
      order.deliveryFee || 0,
      order.tip || 0,
      order.total
    ]);

    // Insert line items
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const product = await pool.query(
        'SELECT id, name FROM product_service.products WHERE barcode = $1',
        [item.barcode]
      );

      if (product.rows.length > 0) {
        await pool.query(`
          INSERT INTO order_service.transaction_line_items (
            transaction_id, product_id, barcode, description,
            quantity, unit_price, line_total, sequence_number
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT DO NOTHING
        `, [
          order.id,
          product.rows[0].id,
          item.barcode,
          product.rows[0].name,
          item.quantity,
          item.unitPrice,
          item.quantity * item.unitPrice,
          i + 1
        ]);
      }
    }

    console.log(`  ✓ ${order.channel} order: ${order.orderNumber} (${order.status})`);
  }
}

// Run the seed script
seedData()
  .then(() => {
    console.log('✨ All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Failed to seed data:', error);
    process.exit(1);
  });
