import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { authenticateToken } from "../middleware/auth.js";
import { ensureObjectStorageBucket, uploadObject } from "../services/object-storage.js";

const router = Router();
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxFileSize = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSize, files: 3 },
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new Error("Chỉ chấp nhận ảnh JPG, PNG hoặc WEBP"));
      return;
    }
    callback(null, true);
  },
});

router.post(
  "/images",
  authenticateToken,
  async (req, res) => {
    upload.array("images", 3)(req, res, async (uploadError) => {
      if (uploadError) {
        const message = uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_SIZE"
          ? "Mỗi ảnh không được vượt quá 5 MB"
          : uploadError instanceof multer.MulterError && uploadError.code === "LIMIT_FILE_COUNT"
            ? "Chỉ được tải tối đa 3 ảnh"
            : uploadError instanceof Error
              ? uploadError.message
              : "Dữ liệu ảnh không hợp lệ";
        res.status(400).json({ success: false, message });
        return;
      }

      try {
        const files = req.files;
      if (!Array.isArray(files) || files.length === 0) {
        res.status(400).json({ success: false, message: "Vui lòng chọn ít nhất một ảnh" });
        return;
      }

      await ensureObjectStorageBucket();
      const uploaded = [];
      for (const file of files) {
        const extension = file.mimetype === "image/jpeg"
          ? "jpg"
          : file.mimetype.split("/")[1];
        const objectKey = `images/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
        await uploadObject(objectKey, file.buffer, file.mimetype);
        uploaded.push({
          object_key: objectKey,
          content_type: file.mimetype,
          size: file.size,
        });
      }

      res.status(201).json({ success: true, data: uploaded });
      } catch (error) {
        console.error("Upload images failed:", error);
        res.status(500).json({ success: false, message: "Không thể tải ảnh lên hệ thống lưu trữ" });
      }
    });
  },
);

export default router;
