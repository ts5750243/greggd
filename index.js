require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || 'greggs-blacklist-secret-change-this',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database
const db = new sqlite3.Database('blacklist.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      steam_id TEXT,
      steam_id64 TEXT,
      reason TEXT,
      evidence TEXT,
      added_by TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

// ENV CONFIG
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const GUILD_ID = process.env.GUILD_ID;
const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID;

// AUTH CHECK
function isAuthenticated(req, res, next) {
  if (req.session?.discordUser) return next();
  return res.redirect('/login');
}

// ROLE CHECK
async function isManager(req) {
  if (!req.session?.discordUser) return false;

  try {
    const response = await axios.get(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${req.session.discordUser.id}`,
      {
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
        }
      }
    );

    return response.data.roles.includes(MANAGEMENT_ROLE_ID);
  } catch (err) {
    console.error('Role check failed:', err.response?.data || err.message);
    return false;
  }
}

// ROUTES
app.get('/', (req, res) => res.redirect('/blacklist'));

// LOGIN
app.get('/login', (req, res) => {
  const authUrl =
    `https://discord.com/oauth2/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_type=code` +
    `&scope=identify%20guilds`;

  return res.redirect(authUrl);
});

// CALLBACK
app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.redirect('/login');

  try {
    const tokenRes = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const userRes = await axios.get(
      'https://discord.com/api/users/@me',
      {
        headers: {
          Authorization: `Bearer ${tokenRes.data.access_token}`
        }
      }
    );

    req.session.discordUser = userRes.data;
    return res.redirect('/blacklist');

  } catch (err) {
    console.error('OAuth error:', err.response?.data || err.message);
    return res.status(500).send('Login failed');
  }
});

// BLACKLIST PAGE
app.get('/blacklist', isAuthenticated, async (req, res) => {
  const isMgr = await isManager(req);

  db.all("SELECT * FROM blacklist WHERE status='active' ORDER BY created_at DESC", (err, active) => {
    db.all("SELECT * FROM blacklist WHERE status='expired' ORDER BY created_at DESC", (err2, expired) => {
      res.render('blacklist', {
        active: active || [],
        expired: expired || [],
        user: req.session.discordUser,
        isManager: isMgr
      });
    });
  });
});

// ADD
app.post('/blacklist/add', isAuthenticated, async (req, res) => {
  const isMgr = await isManager(req);
  if (!isMgr) return res.status(403).send('Unauthorized');

  const { name, steam_id, steam_id64, reason, evidence } = req.body;

  db.run(
    `INSERT INTO blacklist (name, steam_id, steam_id64, reason, evidence, added_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, steam_id, steam_id64, reason, evidence, req.session.discordUser.username],
    (err) => {
      if (err) return res.status(500).send('Error');
      res.redirect('/blacklist');
    }
  );
});

// REMOVE / EXPIRE
app.post('/blacklist/remove/:id', isAuthenticated, async (req, res) => {
  const isMgr = await isManager(req);
  if (!isMgr) return res.status(403).send('Unauthorized');

  db.run(
    "UPDATE blacklist SET status='expired' WHERE id=?",
    [req.params.id],
    () => res.redirect('/blacklist')
  );
});

// LOGOUT
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// START SERVER (RAILWAY SAFE)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Greggs Blacklist running on port ${PORT}`);
});
