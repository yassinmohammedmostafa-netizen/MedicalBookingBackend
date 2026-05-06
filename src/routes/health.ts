// @ts-nocheck
import { Router } from "express";
// HealthCheckResponse removed for simplicity替换为// HealthCheckResponse removed for simplicity

const router: any = Router();

router.get("/healthz", (_req: any, res: any) => {
  res.json({ status: "ok" });
});

export default router;
