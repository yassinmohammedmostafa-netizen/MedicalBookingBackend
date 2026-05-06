// @ts-nocheck
import { Router, type Request, type Response } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// Use memory storage for Vercel compatibility
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for Base64 efficiency
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images (jpeg, jpg, png) are allowed for profile pictures"));
  },
});

router.post("/", requireAuth, upload.single("file"), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    // Convert buffer to Base64 Data URL
    const base64Data = req.file.buffer.toString("base64");
    const dataUrl = `data:${req.file.mimetype};base64,${base64Data}`;

    res.status(201).json({
      url: dataUrl,
      filename: req.file.originalname,
    });
  } catch (err) {
    console.error("[UPLOAD] Base64 conversion failed:", err);
    res.status(500).json({ 
      error: "Failed to process image", 
      details: err instanceof Error ? err.message : String(err) 
    });
  }
});

export default router;
