const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("./database.sqlite");

// =========================
// ENV
// =========================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const CALLBACK_URL = process.env.CALLBACK_URL;

// =========================
// MIDDLEWARE
// =========================
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "supersecret",
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
// HEALTH CHECK (IMPORTANT)
// =========================
app.get("/health", (req, res) => {
  res.send("OK");
});

// =========================
// LOGIN
// =========================
app.get("/login", (req, res) => {
  const url =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(CALLBACK_URL)}` +
    `&scope=identify`;

  res.redirect(url);
});

// =========================
// CALLBACK (DISCORD LOGIN)
// =========================
app.get("/auth/discord/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: CALLBACK_URL,
      }),
    });

    const token = await tokenRes.json();

    if (!token.access_token) {
      console.log(token);
      return res.send("OAuth failed");
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
    console.error(err);
    res.send("Login error");
  }
});

// =========================
// LOGOUT
// =========================
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

// =========================
// HOME (PROTECTED)
// =========================
app.get("/", (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    db.all("SELECT * FROM blacklist", (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).send("DB error");
      }

      res.render("blacklist", {
        user: req.session.user,
        active: rows || [],
        isManager: false,
      });
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server crashed");
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
