<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blacklist Panel</title>

<style>
body { margin:0; font-family:Arial; background:#0b0f19; color:white; }

.header {
  padding:15px;
  background:#111827;
  display:flex;
  justify-content:space-between;
}

.container { padding:15px; }

input, select {
  padding:10px;
  margin:5px;
  border:none;
  border-radius:6px;
  background:#1f2937;
  color:white;
}

button {
  padding:10px;
  border:none;
  border-radius:6px;
  cursor:pointer;
  background:#3b82f6;
  color:white;
}

.table {
  width:100%;
  border-collapse:collapse;
  margin-top:15px;
}

.table th, .table td {
  padding:10px;
  border-bottom:1px solid #1f2937;
}

.row:hover { background:#111827; }

.badge {
  background:red;
  padding:4px 8px;
  border-radius:6px;
}

.flex { display:flex; flex-wrap:wrap; }

@media(max-width:600px){
  .table { font-size:12px; }
}
</style>
</head>

<body>

<div class="header">
  <div><b>BLACKLIST PANEL</b></div>

  <div>
    <% if (user) { %>
      <%= user.username %> | <a href="/logout">Logout</a>
    <% } else { %>
      <a href="/login">Login</a>
    <% } %>
  </div>
</div>

<div class="container">

<form method="GET" class="flex">
  <input name="search" placeholder="Search..." value="<%= search %>">

  <select name="filter">
    <option value="all">All</option>
    <option value="active">Active</option>
  </select>

  <button>Search</button>
</form>

<% if (canEdit) { %>
<button onclick="document.getElementById('add').style.display='block'">
  + Add Entry
</button>
<% } %>

<table class="table">
<tr>
  <th>Name</th>
  <th>Steam</th>
  <th>Reason</th>
  <th>Status</th>
  <% if (canEdit) { %><th>Action</th><% } %>
</tr>

<% active.forEach(e => { %>
<tr class="row">
  <td><%= e.name %></td>
  <td><%= e.steam_id %></td>
  <td><%= e.reason %></td>
  <td><span class="badge">BANNED</span></td>

  <% if (canEdit) { %>
  <td>
    <form method="POST" action="/api/blacklist/delete">
      <input type="hidden" name="id" value="<%= e.id %>">
      <button>Delete</button>
    </form>
  </td>
  <% } %>
</tr>
<% }) %>

</table>

</div>

<!-- ADD MODAL -->
<div id="add" style="display:none; position:fixed; top:20%; left:35%; background:#111827; padding:20px;">
<form method="POST" action="/api/blacklist/add">
  <input name="name" placeholder="Name">
  <input name="steam_id" placeholder="Steam ID">
  <input name="reason" placeholder="Reason">
  <button>Add</button>
</form>
</div>

</body>
</html>
