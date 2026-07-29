/**
 * uploadMiddleware.js
 * -------------------
 * Configures multer for uploading business verification documents
 * (e.g. a photo of a business license or ID card).
 *
 * Files are saved to disk under public/uploads/business-documents/,
 * which app.js already serves statically — so an uploaded file becomes
 * reachable at a URL like:
 *   http://localhost:3000/uploads/business-documents/<filename>
 *
 * Only image files and PDFs are accepted, and each file is capped at
 * 2MB, matching the security hardening planned for Step 15.
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AppError = require('../utils/appError');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'business-documents');

// Ensure the upload directory exists before multer tries to write to it
// (a fresh clone of the repo won't have this folder, since it's gitignored)
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Example result: 65f1c2.../1706531200000-license-photo.jpg
    // Prefixing with the business id + timestamp avoids filename collisions
    // between different businesses (or repeated uploads from the same one).
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPG, PNG, or PDF files are allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB per file
  },
});

module.exports = upload;
