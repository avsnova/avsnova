/**
 * Passenger / cPanel "Setup Node.js App" entry point.
 *
 * SpaceShip shared hosting runs Node apps under Phusion Passenger (CloudLinux). Passenger starts
 * the app itself (no `npm start` / PM2) and looks for a startup file — set the cPanel "Application
 * startup file" to `app.js`. This simply boots the real server. Passenger provides process.env.PORT
 * and terminates TLS at the web server, so the app needs no extra changes here.
 *
 * Local/VPS use can still run `node server/index.js` or `npm start` directly.
 */
import "./server/index.js";
