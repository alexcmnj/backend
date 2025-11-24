// backend/server.js
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");

const app = express();
app.use(cors({
    origin: ["http://127.0.0.1:5500",
    "https://candid-cupcake-80473b.netlify.app"], // tu frontend
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sesiones
app.use(session({
    secret: "supersecretkey", // cambia por algo seguro
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hora
}));

// Carpeta uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

// Multer para imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({ storage });

// Servir archivos estáticos (pages, assets, uploads)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, ".."))); 

// Conexión a SQLite
const dbPath = path.join(__dirname, "db", "database.db");
if (!fs.existsSync(path.join(__dirname, "db"))) fs.mkdirSync(path.join(__dirname, "db"));
const db = new sqlite3.Database(dbPath, err => {
    if (err) { console.error(err.message); process.exit(1); }
    console.log("Base de datos conectada:", dbPath);
});

// Crear tablas si no existen
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        descripcion TEXT,
        precio INTEGER,
        imagen TEXT,
        stock INTEGER,
        categoria TEXT,
        tipo TEXT DEFAULT 'general'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ordenes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre_cliente TEXT,
        email_cliente TEXT,
        direccion TEXT,
        total REAL,
        created_at TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS detalle_orden (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orden_id INTEGER,
        producto_id INTEGER,
        cantidad INTEGER,
        precio_unitario REAL
    )`);
});

// -------------------- LOGIN ADMIN --------------------
const admins = [
    { usuario: "admin", password: "1234" } // Cambia a algo seguro
];

app.post("/api/admin/login", (req, res) => {
    const { usuario, password } = req.body;
    const admin = admins.find(a => a.usuario === usuario && a.password === password);
    if (admin) {
        req.session.admin = { usuario };
        res.json({ mensaje: "Login exitoso" });
    } else {
        res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    }
});

app.get("/api/admin/check", (req, res) => {
    if (req.session.admin) {
        res.json({ loggedIn: true, usuario: req.session.admin.usuario });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post("/api/admin/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Error cerrando sesión" });
        res.json({ mensaje: "Sesión cerrada" });
    });
});

// -------------------- PRODUCTOS --------------------

// GET productos generales
app.get("/api/productos", (req, res) => {
    db.all("SELECT * FROM productos WHERE tipo='general' ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// GET productos de colección
app.get("/api/productos/coleccion", (req, res) => {
    db.all("SELECT * FROM productos WHERE tipo='coleccion' ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// POST crear producto general
app.post("/api/productos", upload.single("imagen"), (req, res) => {
    const { nombre, descripcion, precio, stock, categoria } = req.body;
    const imagen = req.file ? "/uploads/" + req.file.filename : null;
    db.run(
        `INSERT INTO productos (nombre, descripcion, precio, imagen, stock, categoria, tipo) VALUES (?, ?, ?, ?, ?, ?, 'general')`,
        [nombre, descripcion, precio || 0, imagen, stock || 0, categoria || ""],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, mensaje: "Producto general creado" });
        }
    );
});

// POST crear producto de colección
app.post("/api/productos/coleccion", upload.single("imagen"), (req, res) => {
    const { nombre, descripcion, precio, stock, categoria } = req.body;
    const imagen = req.file ? "/uploads/" + req.file.filename : null;
    db.run(
        `INSERT INTO productos (nombre, descripcion, precio, imagen, stock, categoria, tipo) VALUES (?, ?, ?, ?, ?, ?, 'coleccion')`,
        [nombre, descripcion, precio || 0, imagen, stock || 0, categoria || ""],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, mensaje: "Producto de colección creado" });
        }
    );
});

// DELETE producto por id
app.delete("/api/productos/:id", (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM productos WHERE id = ?", [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "No encontrado" });
        res.json({ mensaje: "Producto eliminado" });
    });
});

// DELETE producto de colección por id
app.delete("/api/productos/coleccion/:id", (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM productos WHERE id = ? AND tipo = 'coleccion'", [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Producto no encontrado" });
        res.json({ mensaje: "Producto de colección eliminado" });
    });
});


// -------------------- ORDENES --------------------
app.post("/api/ordenes", (req, res) => {
    const { nombre_cliente, email_cliente, direccion, total, items } = req.body;
    const created_at = new Date().toISOString();
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Orden sin items" });

    db.run(
        `INSERT INTO ordenes (nombre_cliente, email_cliente, direccion, total, created_at) VALUES (?, ?, ?, ?, ?)`,
        [nombre_cliente, email_cliente, direccion, total, created_at],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            const orderId = this.lastID;
            const stmt = db.prepare(
                "INSERT INTO detalle_orden (orden_id, producto_id, cantidad, precio_unitario) VALUES (?, ?, ?, ?)"
            );
            items.forEach(it => stmt.run(orderId, it.id, it.cantidad, it.precio));
            stmt.finalize();
            res.json({ mensaje: "Orden creada", orderId });
        }
    );
});

app.get("/api/ordenes", (req, res) => {
    db.all("SELECT * FROM ordenes ORDER BY id DESC", (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// -------------------- START SERVER --------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto`+ PORT));
