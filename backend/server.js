require('dotenv').config();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createServer } = require('http');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const { attachRealtimeServer } = require('./services/realtime');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
attachRealtimeServer(server);
const iceServers = JSON.parse(
  process.env.ICE_SERVERS || '[{"urls":"stun:stun.l.google.com:19302"}]'
);
if (!Array.isArray(iceServers) || iceServers.length === 0) {
  throw new Error('ICE_SERVERS must be a non-empty JSON array of WebRTC ICE server definitions.');
}
app.locals.iceServers = iceServers;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Uploaded submission files access
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Core REST API
app.use('/api', apiRoutes);

// Error handler for Multer upload limits and file filters
app.use((error, req, res, next) => {
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ message: 'Each uploaded file must be 25 MB or smaller.' });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ message: 'You can upload a maximum of 10 files per submission.' });
  }

  if (error.message === 'Only source-code files and ZIP files are allowed.') {
    return res.status(400).json({ message: error.message });
  }

  return next(error);
});

// Serve compiled React frontend SPA in production if built
const clientDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// 404 for unhandled API requests
app.use('/api', (req, res) => {
  return res.status(404).json({ message: 'API endpoint not found.' });
});

// SPA fallback for HTML requests in production
if (fs.existsSync(clientDist)) {
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    return next();
  });
}

// Default 404 for unhandled requests
app.use((req, res) => {
  return res.status(404).json({ message: 'Resource not found.' });
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Collaborative workspace server running on http://localhost:${PORT}`);
  });
});
