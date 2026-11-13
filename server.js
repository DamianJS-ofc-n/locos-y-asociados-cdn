const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.static('public'));

// Que se puedan ver las fotos con el link propio
app.use('/db', express.static(path.join(__dirname, 'db')));

// Crear carpetas si no existen
fs.mkdirSync('db/imagenes', { recursive: true });
fs.mkdirSync('db/videos', { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Si es video -> db/videos, si es foto -> db/imagenes
    if (file.mimetype.startsWith('video/')) {
      cb(null, 'db/videos');
    } else {
      cb(null, 'db/imagenes');
    }
  },
  filename: (req, file, cb) => {
    const nombre = Date.now() + '-' + file.originalname.replace(/\s/g, '_');
    cb(null, nombre);
  }
});

const upload = multer({ storage });

// Subir
app.post('/subir', upload.single('archivo'), (req, res) => {
  if (!req.file) return res.json({ error: 'No hay archivo' });

  const esVideo = req.file.mimetype.startsWith('video/');
  const carpeta = esVideo ? 'imagenes' : 'imagenes';
  const carpetaReal = esVideo ? 'videos' : 'imagenes';

  // Link PROPIO de tu CDN, no de GitHub
  const link = `${req.protocol}://${req.get('host')}/db/${carpetaReal}/${req.file.filename}`;

  res.json({ link, tipo: esVideo ? 'video' : 'imagen', nombre: req.file.filename });
});

// Ver todos los archivos
app.get('/lista', (req, res) => {
  const imgs = fs.readdirSync('db/imagenes').map(f => `/db/imagenes/${f}`);
  const vids = fs.readdirSync('db/videos').map(f => `/db/videos/${f}`);
  res.json({ imagenes: imgs, videos: vids });
});

app.listen(process.env.PORT || 10000, () => console.log('LOCOS CDN ON'));
