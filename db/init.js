// backend/db/init.js
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sqlite = sqlite3.verbose();
const dbPath = path.join(__dirname, "database.db");

console.log("Iniciando creación de base de datos...");
const db = new sqlite.Database(dbPath);

db.serialize(() => {
  
  // === TABLAS EXISTENTES ===
  db.run(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      precio REAL NOT NULL,
      imagen TEXT,
      stock INTEGER DEFAULT 0,
      categoria TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ordenes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre_cliente TEXT,
      email_cliente TEXT,
      direccion TEXT,
      total REAL,
      created_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS detalle_orden (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      orden_id INTEGER,
      producto_id INTEGER,
      cantidad INTEGER,
      precio_unitario REAL
    )
  `);

  // === TABLA ADMIN ===
  db.run(`
    CREATE TABLE IF NOT EXISTS admin (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `);

  // Agregar admin por defecto
  db.get(`SELECT COUNT(*) AS cnt FROM admin`, (err, row) => {
    if (row.cnt === 0) {
      db.run(
        `INSERT INTO admin (email, password) VALUES (?, ?)`,
        ["admin@tienda.com", "admin123"],
        () => console.log("Administrador creado por defecto.")
      );
    }
  });

  console.log("DB creada correctamente.");
});

db.close();
