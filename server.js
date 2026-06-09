const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DATA_FILE = path.join(__dirname, 'data', 'tournaments.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());
// Serve repository static files (index.html, js, css, data)
app.use(express.static(path.join(__dirname)));
// Expose uploaded logos
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/ping', (req, res) => res.json({ ok: true }));

app.get('/api/tournaments', (req, res) => {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    res.json(JSON.parse(raw));
  } catch (e) {
    res.json({ tournaments: [] });
  }
});

app.post('/api/tournaments', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2), 'utf8');
    // broadcast to connected clients
    io.emit('tournaments:update', req.body);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logo upload endpoint (multipart form-data; field name: "logo")
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const name = `${Date.now()}-${file.originalname.replace(/\s+/g,'_')}`;
    cb(null, name);
  }
});
const upload = multer({ storage });

app.post('/api/upload-logo', upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ url });
});

io.on('connection', (socket) => {
  // optional: send current data on connect
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    socket.emit('tournaments:update', JSON.parse(raw));
  } catch (e) {
    socket.emit('tournaments:update', { tournaments: [] });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
