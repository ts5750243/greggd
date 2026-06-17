const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

// Railway-safe fetch
const fetch = global.fetch || require("node-fetch");

const app = express();

/* ================= CORE FIX (EJS) ================= */
app.set("view engine", "ejs");
app.set("views", "./views");

/* ================= MIDDLEWARE ================= */
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "greggs_secret",
    resave: false,
    saveUninitialized: false,
  })
);

/* ================= DATABASE ================= */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
});

/* ================= CREATE TABLE ================= */
pool.query(`
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  name TEXT,
  steam_id TEXT,
  reason TEXT,
  discord_id TEXT
)
`).catch(console.error);

/* ================= ROLE CHECK ================= */
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${process.env.GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!res.ok) return false;

    const data = await res.json();

    return (
      data.roles?.includes(process.env.MANAGEMENT_ROLE_ID) ||
      data.roles?.includes(process.env.MANAGEMENT_ROLE_ID_2)
    );
  } catch (err) {
    console.error("Role check error:", err);
    return false;
  }
}

/* ================= MAIN PAGE ================= */
app.get("/", async (req, res) => {
  try {
    const search = req.query.search || "";

    let query = "SELECT * FROM blacklist";
    let params = [];

    if (search) {
      query += `
        WHERE name ILIKE $1
        OR steam_id ILIKE $1
        OR reason ILIKE $1
        OR discord_id ILIKE $1
      `;
      params = [`%${search}%`];
    }

    query += " ORDER BY id DESC";

    const result = await pool.query(query, params);

    let canEdit = false;

    if (req.session?.user?.id) {
      canEdit = await isManager(req.session.user.id);
    }

    res.render("blacklist", {
      user: req.session.user || null,
      data: result.rows,
      canEdit,
      search,
    });
  } catch (err) {
    console.error("MAIN ERROR:", err);
    res.status(500).send("Server error");
  }
});

/* ================= ADD ================= */
app.post("/add", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");

    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const { name, steam_id, reason, discord_id } = req.body;

    await pool.query(
      "INSERT INTO blacklist (name, steam_id, reason, discord_id) VALUES ($1,$2,$3,$4)",
      [name, steam_id, reason, discord_id]
    );

    res.redirect("/");
  } catch (err) {
    console.error("ADD ERROR:", err);
    res.status(500).send("DB error");
  }
});

/* ================= DELETE ================= */
app.post("/delete", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");

    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    await pool.query("DELETE FROM blacklist WHERE id=$1", [req.body.id]);

    res.redirect("/");
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).send("DB error");
  }
});

/* ================= EDIT ================= */
app.post("/edit", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");

    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const { id, name, steam_id, reason, discord_id } = req.body;

    await pool.query(
      `UPDATE blacklist
       SET name=$1, steam_id=$2, reason=$3, discord_id=$4
       WHERE id=$5`,
      [name, steam_id, reason, discord_id, id]
    );

    res.redirect("/");
  } catch (err) {
    console.error("EDIT ERROR:", err);
    res.status(500).send("DB error");
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("Greggs Blacklist running on port", PORT);
});
