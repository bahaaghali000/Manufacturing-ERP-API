import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import * as bcrypt from "bcryptjs";
import "dotenv/config";

const connectionString = process.env.DATABASE_LOCAL;
const pool = new pg.Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false, // Common for many cloud DB providers
  },
  connectionTimeoutMillis: 10000, // 10 seconds
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding started...");

  // 1. Create Roles
  const roles = [
    { name: "Admin", permissions: { all: true } },
    {
      name: "Manager",
      permissions: {
        approve_pr: true,
        approve_po: true,
        view_reports: true,
        view_items: true,
        view_inventory: true,
      },
    },
    {
      name: "Procurement Officer",
      permissions: {
        create_po: true,
        manage_vendors: true,
        view_items: true,
        manage_items: true,
        view_inventory: true,
      },
    },
    {
      name: "Sales Rep",
      permissions: { create_so: true, view_items: true, view_inventory: true },
    },
    {
      name: "Warehouse Staff",
      permissions: {
        receive_goods: true,
        update_inventory: true,
        view_items: true,
        manage_items: true,
        view_inventory: true,
      },
    },
    { name: "Employee", permissions: { create_pr: true, view_items: true } },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { permissions: role.permissions },
      create: role,
    });
  }

  const adminRole = await prisma.role.findUnique({ where: { name: "Admin" } });

  // 2. Create Departments
  const departments = [
    "IT",
    "Procurement",
    "Sales",
    "Warehouse",
    "Manufacturing",
  ];
  for (const dept of departments) {
    const exists = await prisma.department.findFirst({ where: { name: dept } });
    if (!exists) {
      await prisma.department.create({ data: { name: dept } });
    }
  }

  const itDept = await prisma.department.findFirst({ where: { name: "IT" } });

  // 3. Create Default Warehouse
  const warehouses = [
    { name: "Main Warehouse", location: "Building A" },
    { name: "Secondary Warehouse", location: "Building B" },
  ];

  for (const wh of warehouses) {
    await prisma.warehouse.upsert({
      where: { id: warehouses.indexOf(wh) + 1 }, // This is a bit hacky but works for initial seed
      update: {},
      create: wh,
    });
  }

  // 4. Create Default Admin User
  const hashedPassword = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@erp.com" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@erp.com",
      passwordHash: hashedPassword,
      roleId: adminRole!.id,
      departmentId: itDept!.id,
    },
  });

  console.log("Seeding finished successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
