const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");

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

// ================= FETCH =================
const fetch = globalThis.fetch;

// ================= APP SETUP =================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "greggs_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= DB =================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create table
(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id SERIAL PRIMARY KEY,
      name TEXT,
      steam_id TEXT,
      reason TEXT,
      discord_id TEXT
    )
  `);
})();

// ================= ROLE CHECK =================
async function isManager(userId) {
  try {
    const res = await fetch(
      `https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`,
      {
        headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` }
      }
    );

    if (!res.ok) return false;

    const data = await res.json();
    const roles = data.roles || [];

    return (
      roles.includes(MANAGEMENT_ROLE_ID) ||
      roles.includes(MANAGEMENT_ROLE_ID_2)
    );
  } catch {
    return false;
  }
}

// ================= DISCORD LOGIN =================
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
  if (!code) return res.send("No code");

  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: CALLBACK_URL,
  });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const token = await tokenRes.json();

  if (!token.access_token) return res.send("OAuth failed");

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
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ================= MAIN PAGE =================
app.get("/", async (req, res) => {
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

  const data = await pool.query(query, params);

  let canEdit = false;
  if (req.session?.user?.id) {
    canEdit = await isManager(req.session.user.id);
  }

  res.render("blacklist", {
    user: req.session.user || null,
    data: data.rows,
    canEdit,
    search
  });
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

    // AUTO BAN
    if (discord_id) {
      await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${discord_id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: reason || "Blacklisted"
          }),
        }
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Add failed");
  }
});

// ================= DELETE =================
app.post("/delete", async (req, res) => {
  try {
    if (!req.session?.user) return res.redirect("/login");
    if (!(await isManager(req.session.user.id)))
      return res.status(403).send("No permission");

    const { id } = req.body;

    const row = await pool.query(
      "SELECT discord_id FROM blacklist WHERE id=$1",
      [id]
    );

    const discord_id = row.rows[0]?.discord_id;

    // UNBAN ON DELETE
    if (discord_id) {
      await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${discord_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          },
        }
      );
    }

    await pool.query("DELETE FROM blacklist WHERE id=$1", [id]);

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Delete failed");
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
      `UPDATE blacklist SET name=$1, steam_id=$2, reason=$3, discord_id=$4 WHERE id=$5`,
      [name, steam_id, reason, discord_id, id]
    );

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.status(500).send("Edit failed");
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Greggs Blacklist running on port", PORT);
});
