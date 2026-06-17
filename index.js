const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const fetch = global.fetch || require("node-fetch"); // safe fallback

const app = express();

// ================= ENV =================
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

// ================= POSTGRES =================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create tables safely
pool.query(`
CREATE TABLE IF NOT EXISTS blacklist (
  id SERIAL PRIMARY KEY,
  name TEXT,
  steam_id TEXT,
  reason TEXT,
  discord_id TEXT
)
`).catch(console.error);

pool.query(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action TEXT,
  actor TEXT,
  target TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
)
`).catch(console.error);

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "dev_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= ROLE CHECK =================
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      }
    );

    if (!res.ok) return false;

    const data = await res.json();

    return (
      data.roles?.includes(MANAGEMENT_ROLE_ID) ||
      data.roles?.includes(MANAGEMENT_ROLE_ID_2)
    );
  } catch (err) {
    console.error("Role check error:", err);
    return false;
  }
}

// ================= LOG ACTION =================
async function logAction(action, actor, target) {
  try {
    await pool.query(
      "INSERT INTO audit_logs (action, actor, target) VALUES ($1,$2,$3)",
      [action, actor, target]
    );
  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// ================= LOGIN =================
app.get("/login", (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: CALLBACK_URL,
    scope: "identify guilds.members.read",
  });

  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// ================= CALLBACK =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code");

  try {
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK_URL,
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const token = await tokenRes.json();
    if (!token.access_token) return res.status(401).send("OAuth failed");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
      },
    });

    const user = await userRes.json();

    req.session.user = {
      id: user.id,
      username: user.username,
    };

    res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err);
    res.status(500).send("OAuth error");
  }
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE =================
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
      data: result.rows || [],
      canEdit,
      search
    });

  } catch (err) {
    console.error("Main page error:", err);
    res.status(500).send("Server error");
  }
});

// ================= ADD =================
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

    await logAction("ADD", req.session.user.username, name);

    res.redirect("/");
  } catch (err) {
    console.error("Add error:", err);
    res.status(500).send("DB error");
  }
});

// ================= DELETE =================
app.post("/delete", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");
    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const row = await pool.query(
      "SELECT * FROM blacklist WHERE id=$1",
      [req.body.id]
    );

    const target = row.rows[0];

    await pool.query("DELETE FROM blacklist WHERE id=$1", [req.body.id]);

    await logAction("DELETE", req.session.user.username, target?.name);

    res.redirect("/");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("DB error");
  }
});

// ================= EDIT =================
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

    await logAction("EDIT", req.session.user.username, name);

    res.redirect("/");
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).send("DB error");
  }
});

// ================= API (LIVE UPDATES) =================
app.get("/api/blacklist", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM blacklist ORDER BY id DESC");
    res.json(result.rows || []);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

// ================= START =================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("🚀 Greggs Blacklist running on port", PORT);
});
