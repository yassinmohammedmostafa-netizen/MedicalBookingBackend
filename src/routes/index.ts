// @ts-nocheck
import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import doctorsRouter from "./doctors.js";
import slotsRouter from "./slots.js";
import appointmentsRouter from "./appointments.js";
import adminRouter from "./admin.js";
import doctorDashboardRouter from "./doctor-dashboard.js";
import uploadsRouter from "./uploads.js";

const router: any = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(doctorsRouter);
router.use(slotsRouter);
router.use(appointmentsRouter);
router.use(adminRouter);
router.use(doctorDashboardRouter);
router.use("/uploads", uploadsRouter);

export default router;
