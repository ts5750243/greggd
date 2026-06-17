<!DOCTYPE html>
<html>
<head>
  <title>Greggs Blacklist</title>

  <style>
    body {
      background: #0b0b0b;
      color: white;
      font-family: Arial;
      margin: 0;
    }

    .top {
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid #222;
    }

    .logo {
      width: 80px;
      border-radius: 50%;
    }

    h1 {
      color: #00ff88;
    }

    .container {
      width: 90%;
      margin: auto;
    }

    input {
      padding: 8px;
      margin: 4px;
      width: 200px;
    }

    .btn {
      background: #00ff88;
      border: none;
      padding: 6px 10px;
      cursor: pointer;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }

    th, td {
      border-bottom: 1px solid #222;
      padding: 10px;
    }

    th {
      color: #00ff88;
    }

    #editBox {
      display: none;
      position: fixed;
      top: 30%;
      left: 50%;
      transform: translateX(-50%);
      background: #111;
      padding: 20px;
      border: 1px solid #333;
    }
  </style>
</head>

<body>

<div class="top">
  <img src="https://i.imgur.com/lhNa6cM.png" class="logo">
  <h1>Greggs Blacklist</h1>
  <p>Database System</p>
</div>

<div class="container">

  <!-- SEARCH -->
  <form method="GET" action="/">
    <input name="search" placeholder="Search..." value="<%= search || '' %>">
    <button class="btn">Search</button>
  </form>

  <!-- ADD -->
  <% if (canEdit) { %>
  <form method="POST" action="/add">
    <input name="name" placeholder="Name">
    <input name="steam_id" placeholder="Steam ID">
    <input name="reason" placeholder="Reason">
    <input name="discord_id" placeholder="Discord ID">
    <button class="btn">Add</button>
  </form>
  <% } %>

  <!-- TABLE -->
  <table>
    <tr>
      <th>Name</th>
      <th>Steam</th>
      <th>Reason</th>
      <th>Discord</th>
      <% if (canEdit) { %><th>Actions</th><% } %>
    </tr>

    <% data.forEach(item => { %>
    <tr>
      <td><%= item.name %></td>
      <td><%= item.steam_id %></td>
      <td><%= item.reason %></td>
      <td><%= item.discord_id %></td>

      <% if (canEdit) { %>
      <td>
        <button class="btn" onclick="openEdit(
          '<%= item.id %>',
          '<%= item.name %>',
          '<%= item.steam_id %>',
          '<%= item.reason %>',
          '<%= item.discord_id %>'
        )">Edit</button>

        <form method="POST" action="/delete" style="display:inline;">
          <input type="hidden" name="id" value="<%= item.id %>">
          <button class="btn">Remove</button>
        </form>
      </td>
      <% } %>
    </tr>
    <% }) %>
  </table>
</div>

<!-- EDIT -->
<div id="editBox">
  <form method="POST" action="/edit">
    <input type="hidden" id="eid" name="id">
    <input id="ename" name="name">
    <input id="esteam" name="steam_id">
    <input id="ereason" name="reason">
    <input id="ediscord" name="discord_id">
    <button class="btn">Save</button>
  </form>
</div>

<script>
function openEdit(id, name, steam, reason, discord) {
  document.getElementById("eid").value = id;
  document.getElementById("ename").value = name;
  document.getElementById("esteam").value = steam;
  document.getElementById("ereason").value = reason;
  document.getElementById("ediscord").value = discord;
  document.getElementById("editBox").style.display = "block";
}
</script>

</body>
</html>
