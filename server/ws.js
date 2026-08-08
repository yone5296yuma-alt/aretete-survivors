// Stub for a future real-time co-op layer. Not wired into index.js yet --
// multiplayer is a later phase (see the plan this was built from). Left
// here as the documented shape so the accounts/session work done for the
// REST API doesn't need to be reworked when this gets built:
//
//   1. Client opens `ws://host:8791/ws?token=<session token>` using the
//      SAME token issued by POST /api/login.
//   2. On connection, resolve the token via db.getUserBySession (same
//      function auth.js's requireAuth uses) -- reject the upgrade if it
//      doesn't resolve to a user.
//   3. `rooms` / `room_members` tables already exist in db.js. A "create
//      room" REST endpoint would insert a room + return a short join code;
//      a "join room" message over the socket adds a room_members row and
//      broadcasts presence to the room's other connections.
//   4. Per-tick state sync (player positions, enemy state, damage events)
//      would go over this socket rather than REST -- likely needs a
//      lightweight room-scoped broadcast loop keyed by room id, with one
//      client (or the server itself) as the authority for enemy spawns/HP
//      to avoid desync between players.
//
// Nothing below is implemented yet.
