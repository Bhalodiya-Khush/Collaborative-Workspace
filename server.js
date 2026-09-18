require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

connectDB();

app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, 'public')));
app.get(/^(?!\/api).*/, (req, res) => {
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Collaborative workspace server running on http://localhost:${PORT}`);
});
