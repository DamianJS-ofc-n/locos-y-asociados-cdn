const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/db', express.static(path.join(__dirname, 'db')));

// ============================
// CONTRASENA DE OWNER
// ============================
const OWNER_PASSWORD = "𐚁ᴅᴀᴍɪᴀɴᴊs-ᴏғᴄ";
const LIMITE_DEFAULT = 20;

fs.mkdirSync('db/imagenes', { recursive: true });
fs.mkdirSync('db/videos', { recursive: true });
if (!fs.existsSync('db/tokens.json')) fs.writeFileSync('db/tokens.json', '[]');
if (!fs.existsSync('db/uso.json')) fs.writeFileSync('db/uso.json', '{}');

function hoy() { return new Date().toISOString().slice(0, 10); }
function cargarTokens() { return JSON.parse(fs.readFileSync('db/tokens.json', 'utf8')); }
function guardarTokens(t) { fs.writeFileSync('db/tokens.json', JSON.stringify(t, null, 2)); }
function cargarUso() { return JSON.parse(fs.readFileSync('db/uso.json', 'utf8')); }
function guardarUso(u) { fs.writeFileSync('db/uso.json', JSON.stringify(u, null, 2)); }

function verificarReseteo(token) {
  let uso = cargarUso();
  if (uso[token.key] && uso[token.key].fecha !== hoy()) {
    uso[token.key] = { fecha: hoy(), usados: 0 };
    guardarUso(uso);
  }
  if (!uso[token.key]) {
    uso[token.key] = { fecha: hoy(), usados: 0 };
    guardarUso(uso);
  }
  return uso[token.key];
}

function esOwner(req) {
  return req.headers['x-owner-pass'] === OWNER_PASSWORD;
}

app.post('/api/owner/crear-token', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  const { nombre, limite } = req.body;
  if (!nombre) return res.json({ error: 'Falta nombre' });
  const tokens = cargarTokens();
  const nuevo = {
    key: 'locos_' + crypto.randomBytes(8).toString('hex'),
    nombre,
    limite: parseInt(limite) || LIMITE_DEFAULT,
    creado: Date.now(),
    activo: true
  };
  tokens.push(nuevo);
  guardarTokens(tokens);
  res.json({ ok: true, token: nuevo });
});

app.get('/api/owner/tokens', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  const tokens = cargarTokens();
  const uso = cargarUso();
  const lista = tokens.map(t => {
    const u = uso[t.key];
    const usados = (u && u.fecha === hoy()) ? u.usados : 0;
    return { ...t, usados, restantes: t.limite - usados };
  });
  res.json(lista);
});

app.post('/api/owner/eliminar-token', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  let tokens = cargarTokens();
  tokens = tokens.filter(t => t.key !== req.body.key);
  guardarTokens(tokens);
  res.json({ ok: true });
});

app.post('/api/verificar-token', (req, res) => {
  const { key } = req.body;
  const tokens = cargarTokens();
  const token = tokens.find(t => t.key === key && t.activo);
  if (!token) return res.json({ valido: false });
  const u = verificarReseteo(token);
  res.json({ valido: true, nombre: token.nombre, limite: token.limite, usados: u.usados, restantes: token.limite - u.usados });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, 'db/videos');
    else cb(null, 'db/imagenes');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_'));
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/subir', upload.single('archivo'), (req, res) => {
  const key = req.headers['x-token'] || req.body.token;
  const tokens = cargarTokens();
  const token = tokens.find(t => t.key === key && t.activo);
  if (!token) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.json({ error: 'Token invalido o inactivo' });
  }
  const uso = verificarReseteo(token);
  if (uso.usados >= token.limite) {
    if (req.file) fs.unlinkSync(req.file.path);
    return res.json({ error: 'Limite diario alcanzado. Se recarga a las 00:00. Te quedan 0 de ' + token.limite });
  }
  if (!req.file) return res.json({ error: 'No hay archivo' });

  let todosUso = cargarUso();
  todosUso[token.key].usados += 1;
  guardarUso(todosUso);

  const esVideo = req.file.mimetype.startsWith('video/');
  const carpeta = esVideo ? 'videos' : 'imagenes';
  const link = `${req.protocol}://${req.get('host')}/db/${carpeta}/${req.file.filename}`;
  res.json({ link, tipo: esVideo ? 'video' : 'imagen', restantes: token.limite - todosUso[token.key].usados, limite: token.limite });
});

app.get('/lista', (req, res) => {
  const imgs = fs.readdirSync('db/imagenes').filter(f => f !== '.gitkeep').map(f => `/db/imagenes/${f}`);
  const vids = fs.readdirSync('db/videos').filter(f => f !== '.gitkeep').map(f => `/db/videos/${f}`);
  res.json({ imagenes: imgs, videos: vids });
});

app.listen(process.env.PORT || 10000, () => console.log('LOCOS CDN ON'));
