Live Sports Scoreboard — Demo

FotMob-style demo supporting soccer and rugby tournaments. Admins can create tournaments, add teams (logo upload), add one-off matches, log events and stats, and publish a viewer-facing scoreboard. Data is stored client-side (localStorage) and exportable as tournaments.json.

Quick start (client-only/demo):
- Open index.html in a browser
- Admin password: admin123
- Create a tournament, add teams, generate fixtures or add one-off matches

Server mode (optional, enables real-time sync and logo uploads):
1. Install dependencies and start server:
   - npm install
   - npm start
2. Open http://localhost:3000 in a browser. The app will auto-detect the server and switch to server-mode.

Server-mode features:
- Real-time updates via Socket.IO: admin updates are broadcast to connected viewers instantly.
- Persisted tournaments.json on the server (data/tournaments.json).
- Logo upload endpoint (/api/upload-logo) which stores uploads/ and returns a URL to use as team.logo.

Deployment suggestions:
- Render (https://render.com) or Fly.io are good options for hosting this small Node.js app; create a service using the GitHub repo and deploy.
- If only static hosting is needed, use GitHub Pages / Netlify for the client and skip server-mode. For full features, use Render/Heroku/Cloud Run.

Notes:
- This is a demo. Do not use ADMIN_PASSWORD in production.
- Uploaded logos are stored on the server's filesystem (uploads/) — for production, swap to S3 or another CDN and serve via authenticated uploads.

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>