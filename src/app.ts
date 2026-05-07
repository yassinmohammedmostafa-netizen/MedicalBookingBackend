// @ts-nocheck
import pinoHttp from "pino-http";
import path from "path";
import cors from "cors";
import express, { Request, Response } from "express";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

const app: any = express();

app.use(
  (pinoHttp as any)({
    logger,
    serializers: {
      req(req: any) {
        return {
          id: (req as any).id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res: any) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Manual CORS & OPTIONS handling for Vercel stability
app.use((req: any, res: any, next: any) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.header("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static("uploads"));

// Handle both /api and direct routes to be safe on Vercel
app.use("/", router);
app.use("/api", router);

// Global Error Handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error("[GLOBAL_ERROR]", err);
  
  // Handle Multer specific errors
  if (err.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({
      error: "File too large",
      message: "The uploaded file exceeds the allowed size limit (10MB)."
    });
    return;
  }

  res.status(500).json({ 
    error: "Internal Server Error",
    message: err.message
  });
});

export default app;
