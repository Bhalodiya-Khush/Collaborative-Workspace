const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadDirectory = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, callback) => callback(null, uploadDirectory),
  filename: (req, file, callback) => {
    const safeName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const allowedExtensions = new Set([
  '.zip', '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json',
  '.java', '.py', '.c', '.cpp', '.h', '.md', '.txt',
]);

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    return callback(new Error('Only source-code files and ZIP files are allowed.'));
  }

  callback(null, true);
};

const uploadSubmissionFiles = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
});

module.exports = {
  uploadDirectory,
  uploadSubmissionFiles,
};
