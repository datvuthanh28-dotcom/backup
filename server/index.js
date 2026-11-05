import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB, isConnectedToSqlServer } from "./config/db.js";

// Routes
import authRoutes from "./routes/authRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import engagementRoutes from "./routes/engagementRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import promotionRoutes from "./routes/promotionRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const configuredOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const allowedOrigins = new Set([
  configuredOrigin,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^192\.168\.\d+\.\d+$/.test(hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
    ) {
      return true;
    }
  } catch {
    // invalid URL format
  }
  return false;
}

// Middleware configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error("Origin không được phép."));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  const connected = isConnectedToSqlServer();
  if (connected) {
    return res.json({
      status: "healthy",
      database: `Microsoft SQL Server (${process.env.DB_NAME || "MaisonRueDB"})`,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  } else {
    return res.status(503).json({
      status: "error",
      database: "Disconnected",
      error: "Microsoft SQL Server is unavailable.",
      timestamp: new Date().toISOString(),
    });
  }
});

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin/employees", employeeRoutes);
app.use("/api/admin/reports", reportRoutes);
app.use("/api/engagement", engagementRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/promotions", promotionRoutes);

// Phục vụ frontend static build (SPA) khi deploy production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, "..", "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

// Global Error Handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("[Server Error]", err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Lỗi máy chủ nội bộ (Internal Server Error).",
  });
});

// Initialize Database & Start Server
async function startServer() {
  console.log("==================================================");
  console.log("MAISON RUE — Luxury E-Commerce Backend Server");
  console.log("==================================================");

  // Connect to Microsoft SQL Server exclusively
  await connectDB();

  const server = app.listen(PORT, () => {
    console.log(`[Server] Express API listening on http://localhost:${PORT}`);
    console.log(`[Server] Configured client origins: ${[...allowedOrigins].join(", ")}`);
    console.log(`[Server] Three role portals ready: Customer (/login), Staff (/staff/login), Admin (/admin/login)`);
    console.log(`[Server] Database: Microsoft SQL Server (MaisonRueDB)`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `[Server] Port ${PORT} is already in use. Stop the existing backend process or set PORT to a free port in .env.`
      );
      process.exit(1);
      return;
    }
    console.error("[Server] Failed to listen:", err);
    process.exit(1);
  });
}

if (process.argv[1]?.endsWith("index.js") || !process.argv[1]?.includes("test")) {
  startServer().catch((err) => {
    console.error("[Fatal Error] Failed to start server:", err);
    process.exit(1);
  });
}

export default app;
