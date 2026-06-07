// =========================
// IMPORTS
// =========================
const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

// =========================
// APP INIT (THIS FIXES YOUR ERROR)
// =========================
const app = express();
const db = new sqlite3.Database("./database.sqlite");

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// =========================
// DATABASE
// =========================
db.run(`
CREATE TABLE IF NOT EXISTS blacklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  steam_id TEXT,
  reason TEXT
)
`);

// =========================
// HOME TEST ROUTE (CHECK SERVER WORKS)
// =========================
app.get("/", (req, res) => {
  res.send("Server is running ✔");
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
