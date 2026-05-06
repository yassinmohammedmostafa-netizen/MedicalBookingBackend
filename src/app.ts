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
app.use(cors({
  origin: true, // Reflect the request origin, or use a specific list of domains
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static("uploads"));

app.use("/api", router);
app.use("/", router);

export default app;
