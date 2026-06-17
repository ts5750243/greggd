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

// ================= BASIC CHECKS =================
console.log("Starting bot...");
if (!DATABASE_URL) console.log("❌ DATABASE_URL missing");
if (!CALLBACK_URL) console.log("❌ CALLBACK_URL missing");

// ================= POSTGRES =================
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create table safely
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blacklist (
        id SERIAL PRIMARY KEY,
        name TEXT,
        steam_id TEXT,
        reason TEXT,
        discord_id TEXT
      )
    `);

    console.log("✅ DB table ready");
    await pool.query("SELECT NOW()");
    console.log("✅ Postgres connected");
  } catch (err) {
    console.error("❌ DB INIT ERROR:", err);
  }
})();

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET || "fallback_secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");

// ================= ROLE CHECK =================
async function isManager(userId) {
  try {
    if (!GUILD_ID || !DISCORD_BOT_TOKEN) return false;

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
    const roles = data.roles || [];

    return (
      roles.includes(MANAGEMENT_ROLE_ID) ||
      roles.includes(MANAGEMENT_ROLE_ID_2)
    );
  } catch (err) {
    console.error("isManager error:", err);
    return false;
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

// ================= CALLBACK (FIXED + DEBUG) =================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code provided");

  try {
    const body = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: CALLBACK_URL,
    });

    const tokenRes = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );

    const token = await tokenRes.json();

    // 🔥 IMPORTANT DEBUG (THIS WILL SHOW REAL ERROR)
    console.log("OAuth RESPONSE:", token);

    if (!token.access_token) {
      return res.status(400).send(
        "OAuth failed - check Railway logs for details"
      );
    }

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
    console.error("CALLBACK ERROR:", err);
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
      data: result.rows,
      canEdit,
      search
    });

  } catch (err) {
    console.error("MAIN PAGE ERROR:", err);
    res.status(500).send("Internal Server Error");
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

    if (discord_id && GUILD_ID) {
      await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${discord_id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reason: reason || "Blacklisted" }),
        }
      );
    }

    res.redirect("/");
  } catch (err) {
    console.error("ADD ERROR:", err);
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
      "SELECT discord_id FROM blacklist WHERE id=$1",
      [req.body.id]
    );

    if (row.rows[0]?.discord_id) {
      await fetch(
        `https://discord.com/api/guilds/${GUILD_ID}/bans/${row.rows[0].discord_id}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          },
        }
      );
    }

    await pool.query("DELETE FROM blacklist WHERE id=$1", [req.body.id]);

    res.redirect("/");
  } catch (err) {
    console.error("DELETE ERROR:", err);
    res.status(500).send("DB error");
  }
});

// ================= START =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
