const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

// ================= ENV =================
const {
  DATABASE_URL,
  SESSION_SECRET,
  ADMIN_USERNAME,
  ADMIN_PASSWORD
} = process.env;

// ================= APP SETUP =================
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: SESSION_SECRET || "change_this_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= DATABASE =================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Create tables if they don't exist
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      preferred_name TEXT,
      notes TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      person_id INTEGER NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      start_time TIME,
      end_time TIME,
      lunch_start TIME,
      lunch_end TIME,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE (person_id, date)
    );
  `);
})();

// ================= AUTH HELPER =================
function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) {
    return next();
  }
  res.redirect("/login");
}

// ================= LOGIN =================
app.get("/login", (req, res) => {
  if (req.session.loggedIn) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (
    username === (ADMIN_USERNAME || "admin") &&
    password === (ADMIN_PASSWORD || "password")
  ) {
    req.session.loggedIn = true;
    return res.redirect("/");
  }

  res.render("login", { error: "Wrong username or password" });
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= HOME (redirect) =================
app.get("/", requireLogin, (req, res) => {
  res.redirect("/people");
});

// ================= PEOPLE =================
app.get("/people", requireLogin, async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM people WHERE is_active = true ORDER BY name ASC"
  );
  res.render("people", { people: result.rows });
});

app.post("/people/add", requireLogin, async (req, res) => {
  const { name, preferred_name, notes } = req.body;
  await pool.query(
    "INSERT INTO people (name, preferred_name, notes) VALUES ($1, $2, $3)",
    [name, preferred_name || null, notes || null]
  );
  res.redirect("/people");
});

app.post("/people/edit", requireLogin, async (req, res) => {
  const { id, name, preferred_name, notes } = req.body;
  await pool.query(
    `UPDATE people 
     SET name = $1, preferred_name = $2, notes = $3, updated_at = NOW() 
     WHERE id = $4`,
    [name, preferred_name || null, notes || null, id]
  );
  res.redirect("/people");
});

app.post("/people/deactivate", requireLogin, async (req, res) => {
  const { id } = req.body;
  await pool.query(
    "UPDATE people SET is_active = false, updated_at = NOW() WHERE id = $1",
    [id]
  );
  res.redirect("/people");
});

// ================= SCHEDULE =================
app.get("/schedule", requireLogin, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split("T")[0];

  const people = await pool.query(
    "SELECT * FROM people WHERE is_active = true ORDER BY name ASC"
  );

  const schedules = await pool.query(
    "SELECT * FROM schedules WHERE date = $1",
    [date]
  );

  // Make a quick lookup map
  const scheduleMap = {};
  schedules.rows.forEach((s) => {
    scheduleMap[s.person_id] = s;
  });

  res.render("schedule", {
    date,
    people: people.rows,
    scheduleMap,
  });
});

app.post("/schedule/save", requireLogin, async (req, res) => {
  const { person_id, date, start_time, end_time, lunch_start, lunch_end, notes } = req.body;

  await pool.query(
    `
    INSERT INTO schedules (person_id, date, start_time, end_time, lunch_start, lunch_end, notes)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (person_id, date)
    DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      lunch_start = EXCLUDED.lunch_start,
      lunch_end = EXCLUDED.lunch_end,
      notes = EXCLUDED.notes,
      updated_at = NOW()
    `,
    [
      person_id,
      date,
      start_time || null,
      end_time || null,
      lunch_start || null,
      lunch_end || null,
      notes || null,
    ]
  );

  res.redirect(`/schedule?date=${date}`);
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("People & Schedule running on port", PORT);
});
