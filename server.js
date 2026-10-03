require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createServer } = require('http');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');
const pageRoutes = require('./routes/pageRoutes');
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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', apiRoutes);

app.use('/', pageRoutes);
app.use(express.static(path.join(__dirname, 'public')));
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

app.get(/^(?!\/api).*/, (req, res) => {
  return res.status(404).send('Page not found.');
});

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Collaborative workspace server running on http://localhost:${PORT}`);
  });
});
