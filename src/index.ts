import express from "express";
import cors from "cors";
import "dotenv/config";
import { connectDB, disconnectDB } from "./config/db";
import authRoutes from "./routes/authRoutes";
import itemRoutes from "./routes/itemRoutes";
import inventoryRoutes from "./routes/inventoryRoutes";
import prRoutes from "./routes/prRoutes";
import vendorRoutes from "./routes/vendorRoutes";
import poRoutes from "./routes/poRoutes";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/items", itemRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/procurement/pr", prRoutes);
app.use("/api/procurement/vendors", vendorRoutes);
app.use("/api/procurement/po", poRoutes);

app.get("/", (req, res) => {
  res.send("Manufacturing ERP API is running...");
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error(err.stack);
  res.status(500).json({ message: "Something went wrong!" });
});

// Error handling
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  disconnectDB();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  disconnectDB();
  process.exit(1);
});

process.on("SIGINT", () => {
  console.log("Application is shutting down...");
  disconnectDB();
  process.exit(0);
});

app.listen(PORT, () => {
  connectDB();
  console.log(`Server is running on http://localhost:${PORT}`);
});
