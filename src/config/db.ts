import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log:
    process.env.NODE_ENV === "development"
      ? ["query", "info", "warn", "error"]
      : ["error"],
});

const connectDB = async () => {
  try {
    // With driver adapters, we don't strictly need $connect() but it's good for validation
    await prisma.$connect();
    console.log("Database connected via Prisma with PG Adapter");
  } catch (error) {
    console.error("Database connection error:", error);
    process.exit(1);
  }
};

const disconnectDB = async () => {
  try {
    await prisma.$disconnect();
    await pool.end();
    console.log("Database disconnected via Prisma");
  } catch (error) {
    console.error("Database disconnection error:", error);
    process.exit(1);
  }
};

export { connectDB, disconnectDB, prisma };
