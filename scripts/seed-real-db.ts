import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create test tables using raw SQL
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255),
      tier VARCHAR(50) DEFAULT 'standard',
      status VARCHAR(50) DEFAULT 'active',
      total_spent DECIMAL(10,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      subject VARCHAR(500),
      description TEXT,
      priority VARCHAR(50) DEFAULT 'medium',
      status VARCHAR(50) DEFAULT 'open',
      assigned_to VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      amount DECIMAL(10,2),
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Seed customers
  await prisma.$executeRawUnsafe("DELETE FROM customers");
  await prisma.$executeRawUnsafe(`
    INSERT INTO customers (name, email, tier, status, total_spent) VALUES
    ('Alice Johnson', 'alice@vip.com', 'vip', 'active', 15000.00),
    ('Bob Smith', 'bob@standard.com', 'standard', 'active', 2500.00),
    ('Carol White', 'carol@vip.com', 'vip', 'active', 22000.00),
    ('David Brown', 'david@standard.com', 'standard', 'inactive', 800.00),
    ('Eve Davis', 'eve@vip.com', 'vip', 'active', 31000.00)
  `);

  // Seed tickets
  await prisma.$executeRawUnsafe("DELETE FROM tickets");
  await prisma.$executeRawUnsafe(`
    INSERT INTO tickets (customer_id, subject, description, priority, status) VALUES
    (1, 'Login issue', 'Cannot login to my account', 'high', 'open'),
    (2, 'Billing question', 'Wrong charge on invoice', 'medium', 'open'),
    (3, 'Feature request', 'Need API access', 'low', 'open'),
    (4, 'Bug report', 'App crashes on mobile', 'high', 'open'),
    (5, 'Urgent: Data loss', 'Critical - losing data', 'critical', 'open')
  `);

  // Seed orders
  await prisma.$executeRawUnsafe("DELETE FROM orders");
  await prisma.$executeRawUnsafe(`
    INSERT INTO orders (customer_id, amount, status) VALUES
    (1, 299.99, 'completed'),
    (2, 49.99, 'pending'),
    (3, 599.99, 'completed'),
    (4, 19.99, 'refunded'),
    (5, 1299.99, 'completed')
  `);

  // Verify
  const customers = await prisma.$queryRaw`SELECT * FROM customers`;
  console.log("\n✅ Customers:", JSON.stringify(customers, null, 2));

  const tickets = await prisma.$queryRaw`SELECT * FROM tickets`;
  console.log("\n✅ Tickets:", JSON.stringify(tickets, null, 2));

  const orders = await prisma.$queryRaw`SELECT * FROM orders`;
  console.log("\n✅ Orders:", JSON.stringify(orders, null, 2));

  console.log("\n🎉 Database seeded with real data!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
