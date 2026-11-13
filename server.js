const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/db', express.static(path.join(__dirname, 'db')));

// CLAVE OWNER SIMPLE, SIN SIMBOLOS RAROS - ESTA ES LA QUE VAS A USAR
const OWNER_PASSWORD = "damianjs-ofc-2026";

fs.mkdirSync('db/imagenes', { recursive: true });
fs.mkdirSync('db/videos', { recursive: true });
if (!fs.existsSync('db/tokens.json')) fs.writeFileSync('db/tokens.json', '[]');
if (!fs.existsSync('db/codigos.json')) fs.writeFileSync('db/codigos.json', '[]');
if (!fs.existsSync('db/uso.json')) fs.writeFileSync('db/uso.json', '{}');

function hoy() { return new Date().toISOString().slice(0, 10); }
function cargarTokens() { return JSON.parse(fs.readFileSync('db/tokens.json', 'utf8')); }
function guardarTokens(t) { fs.writeFileSync('db/tokens.json', JSON.stringify(t, null, 2)); }
function cargarCodigos() { return JSON.parse(fs.readFileSync('db/codigos.json', 'utf8')); }
function guardarCodigos(c) { fs.writeFileSync('db/codigos.json', JSON.stringify(c, null, 2)); }
function cargarUso() { return JSON.parse(fs.readFileSync('db/uso.json', 'utf8')); }
function guardarUso(u) { fs.writeFileSync('db/uso.json', JSON.stringify(u, null, 2)); }

function verificarReseteo(token) {
  let uso = cargarUso();
  if (!uso[token.key] || uso[token.key].fecha !== hoy()) { uso[token.key] = { fecha: hoy(), usados: 0 }; guardarUso(uso); }
  return uso[token.key];
}
function esOwner(req) {
  // Ahora viene por BODY, no por header, para que no falle con simbolos raros
  return req.body && req.body.ownerPass === OWNER_PASSWORD;
}

// 1. AUTO REGISTRO - EL USUARIO ENTRA Y YA TIENE SU TOKEN
app.post('/api/auto-registro', (req, res) => {
  const nombre = req.body.nombre || 'Usuario';
  const tokens = cargarTokens();
  const nuevo = { key: 'locos_' + crypto.randomBytes(8).toString('hex'), nombre, limite: 20, extra: 0, creado: Date.now(), activo: true };
  tokens.push(nuevo); guardarTokens(tokens);
  res.json({ ok: true, token: nuevo });
});

// 2. VERIFICAR MI TOKEN
app.post('/api/verificar-token', (req, res) => {
  const { key } = req.body;
  const tokens = cargarTokens();
  const token = tokens.find(t => t.key === key && t.activo);
  if (!token) return res.json({ valido: false });
  const u = verificarReseteo(token);
  const limiteTotal = token.limite + (token.extra || 0);
  res.json({ valido: true, nombre: token.nombre, limite: limiteTotal, usados: u.usados, restantes: limiteTotal - u.usados, key: token.key });
});

// 3. CANJEAR CODIGO PARA AUMENTAR LIMITE
app.post('/api/canjear-codigo', (req, res) => {
  const { key, codigo } = req.body;
  if (codigo === OWNER_PASSWORD) return res.json({ esOwner: true });
  const tokens = cargarTokens();
  const token = tokens.find(t => t.key === key);
  if (!token) return res.json({ error: 'Token invalido' });
  const codigos = cargarCodigos();
  const c = codigos.find(x => x.codigo === codigo && !x.usado);
  if (!c) return res.json({ error: 'Codigo invalido o ya usado' });
  c.usado = true; c.usadoPor = key; guardarCodigos(codigos);
  token.extra = (token.extra || 0) + c.extra;
  guardarTokens(tokens);
  const limiteTotal = token.limite + token.extra;
  res.json({ ok: true, extra: c.extra, limite: limiteTotal });
});

// 4. OWNER - CREAR CODIGO DE AUMENTO
app.post('/api/owner/crear-codigo', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  const codigos = cargarCodigos();
  const nuevo = { codigo: 'LOCOS-' + crypto.randomBytes(3).toString('hex').toUpperCase(), extra: parseInt(req.body.extra) || 50, nombre: req.body.nombre || 'Codigo', usado: false, creado: Date.now() };
  codigos.push(nuevo); guardarCodigos(codigos);
  res.json({ ok: true, codigo: nuevo });
});

app.post('/api/owner/codigos', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  res.json(cargarCodigos());
});

app.post('/api/owner/tokens', (req, res) => {
  if (!esOwner(req)) return res.status(403).json({ error: 'No autorizado' });
  const tokens = cargarTokens(); const uso = cargarUso();
  const lista = tokens.map(t => { const u = uso[t.key]; const usados = (u && u.fecha === hoy()) ? u.usados : 0; const limiteTotal = t.limite + (t.extra || 0); return { ...t, limiteTotal, usados, restantes: limiteTotal - usados }; });
  res.json(lista);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => { if (file.mimetype.startsWith('video/')) cb(null, 'db/videos'); else cb(null, 'db/imagenes'); },
  filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname.replace(/\s/g, '_')); }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/subir', upload.single('archivo'), (req, res) => {
  const key = req.headers['x-token'] || req.body.token;
  const tokens = cargarTokens();
  const token = tokens.find(t => t.key === key && t.activo);
  if (!token) { if (req.file) fs.unlinkSync(req.file.path); return res.json({ error: 'Token invalido. Recarga la pagina.' }); }
  const uso = verificarReseteo(token);
  const limiteTotal = token.limite + (token.extra || 0);
  if (uso.usados >= limiteTotal) { if (req.file) fs.unlinkSync(req.file.path); return res.json({ error: 'Limite diario alcanzado. Canjea un codigo para mas. Te quedan 0 de ' + limiteTotal }); }
  if (!req.file) return res.json({ error: 'No hay archivo' });
  let todosUso = cargarUso(); todosUso[token.key].usados += 1; guardarUso(todosUso);
  const esVideo = req.file.mimetype.startsWith('video/');
  const carpeta = esVideo ? 'videos' : 'imagenes';
  const link = `${req.protocol}://${req.get('host')}/db/${carpeta}/${req.file.filename}`;
  res.json({ link, tipo: esVideo ? 'video' : 'imagen', restantes: limiteTotal - todosUso[token.key].usados, limite: limiteTotal });
});

app.get('/lista', (req, res) => {
  const imgs = fs.readdirSync('db/imagenes').filter(f => f !== '.gitkeep').map(f => `/db/imagenes/${f}`);
  const vids = fs.readdirSync('db/videos').filter(f => f !== '.gitkeep').map(f => `/db/videos/${f}`);
  res.json({ imagenes: imgs, videos: vids });
});
app.listen(process.env.PORT || 10000, () => console.log('LOCOS CDN ON'));
