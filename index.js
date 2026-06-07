const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

const app = express();

// ENV
const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  CALLBACK_URL,
  GUILD_ID,
  DISCORD_BOT_TOKEN,
  MANAGEMENT_ROLE_ID,
  MANAGEMENT_ROLE_ID_2,
  DATABASE_URL,
  SESSION_SECRET
} = process.env;

// POSTGRES
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// create table
pool.query(`
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  name TEXT,
  steam_id TEXT,
  reason TEXT,
  discord_id TEXT
)
`);

// middleware
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// role check
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
    );

    if (!res.ok) return false;

    const data = await res.json();

    return (
      data.roles?.includes(MANAGEMENT_ROLE_ID) ||
      data.roles?.includes(MANAGEMENT_ROLE_ID_2)
    );
  } catch {
    return false;
  }
}

// homepage
app.get("/", async (req, res) => {
  const search = req.query.search || "";

  let query = "SELECT * FROM blacklist";
  let params = [];

  if (search) {
    query += " WHERE name ILIKE $1 OR steam_id ILIKE $1 OR reason ILIKE $1 OR discord_id ILIKE $1";
    params = [`%${search}%`];
  }

  query += " ORDER BY id DESC";

  const result = await pool.query(query, params);

  res.render("blacklist", {
    user: req.session.user || null,
    data: result.rows,
    canEdit: false,
    search
  });
});

// start
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("Server running on", PORT));
