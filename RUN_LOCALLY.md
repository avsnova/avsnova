# 🚀 Aurevashop: Local Full-Stack Production Node Deployment Guide (A to Z)

This guide provides a comprehensive, step-by-step walkthrough to download, install, configure, and run the **Aurevashop** full-stack system locally on your own computer, complete with your live **GrizzlySMS** API integration.

---

## 📋 Prerequisites

Ensure you have the following installed on your local computer before proceeding:

1.  **Node.js (v18.0.0 or higher)**:
    *   To check if installed, open your terminal (Command Prompt, PowerShell, or macOS Terminal) and run:
        ```bash
        node -v
        ```
    *   If not installed, download the **LTS version** from the official website: [nodejs.org](https://nodejs.org/)
2.  **Git (Optional, but highly recommended)**:
    *   Allows you to manage files and run commands cleanly. Download from [git-scm.com](https://git-scm.com/) if needed.

---

## 🛠️ Step 1: Export & Prepare the Codebase

1.  **Download or Copy the Workspace Files**:
    *   Ensure all source files are extracted into a clean directory on your machine.
    *   Your local directory should mirror this folder structure:
        ```
        Aurevashop/
        ├── package.json
        ├── tsconfig.json
        ├── vite.config.ts
        ├── index.html
        ├── .env.example
        ├── .env (You will create this)
        ├── server/
        │   ├── db.js
        │   └── index.js
        └── src/
            ├── main.tsx
            ├── index.css
            ├── App.tsx
            ├── mockData.ts
            ├── utils/
            │   ├── api.ts
            │   └── cn.ts
            └── components/
                ├── Navbar.tsx
                ├── Footer.tsx
                ├── AuthModals.tsx
                ├── DashboardSimulator.tsx
                ├── ReviewsAndSecurity.tsx
                ├── ServicesAndFeatures.tsx
                ├── dashboard/ (Topbar, Sidebar, NotificationDrawer, etc.)
                └── views/ (AIStudioView, SMSPanelView, WalletView, etc.)
        ```

---

## ⚙️ Step 2: Configure Environment Variables

The backend Express server requires an environment variables file (`.env`) to load your private **GrizzlySMS API Key** and JWT signing secrets.

1.  In the root directory of your project, create a new file named exactly **`.env`**.
2.  Open the `.env` file in any text editor (VS Code, Notepad, etc.) and paste the following parameters:

    ```env
    PORT=5000
    JWT_SECRET=super_secret_aureva_key_change_me_in_production
    GRIZZLY_SMS_API_KEY=f502c10b7d5a89b00981b25d0631cc42
    ```

    *   `PORT=5000`: Denotes the port where the Node/Express backend listens.
    *   `JWT_SECRET`: Encrypts your secure login session tokens. Change this to a random secure string in production.
    *   `GRIZZLY_SMS_API_KEY`: Your live production key (`f502c10b7d5a89b00981b25d0631cc42`) that connects to Grizzly's active carrier routes.

---

## 📦 Step 3: Install Package Dependencies

1.  Open your system terminal or command prompt.
2.  Navigate into your project folder. For example:
    *   **Windows**:
        ```cmd
        cd C:\Users\YourUsername\Documents\Aurevashop
        ```
    *   **macOS / Linux**:
        ```bash
        cd ~/Documents/Aurevashop
        ```
3.  Install all required node packages by running:
    ```bash
    npm install
    ```
    *   This will scan `package.json` and download all frontend packages (React 19, Vite, Tailwind CSS 4, Lucide icons) and backend packages (Express, SQLite3, CORS, JSONWebToken, BcryptJS, Dotenv) into a local `node_modules` folder.

---

## 🚀 Step 4: Run the Application Concurrently

The project is pre-configured with a **concurrent development script** that boots up both your frontend and backend servers together with a single command!

1.  In your terminal (still navigated inside the project folder), run:
    ```bash
    npm run dev
    ```
2.  Your terminal will output the following successful status handshakes:
    *   `[0] Connected to the SQLite database.` (Verifies SQLite database is loaded and active)
    *   `[0] Seeded sandbox user: alex@enterprise.com / password123` (Initializes default profile credentials)
    *   `[0] Aurevashop API Server listening at http://localhost:5000` (Backend API online)
    *   `[1] VITE v6.4.3 ready in 350 ms`
    *   `[1] ➜  Local:   http://localhost:5173/` (Frontend Vite server online)

---

## 💻 Step 5: Log In and Test Your Live Carrier Integration

1.  Open your web browser and go to:
    ```
    http://localhost:5173/
    ```
    *   This loads your premium dark glassmorphic Aurevashop landing page running locally on your computer.
2.  Click **`Log In`** in the top-right corner.
3.  Enter your database-backed sandbox credentials:
    *   **Email:** `alex@enterprise.com`
    *   **Password:** `password123`
4.  Click **`Sign In Securely`**.
5.  **Success!** The interface connects directly to your local Express server, authorizes your JWT session, and loads your live balance (₦125,000) directly from the local SQLite database!
6.  Go to the **`SMS Panel`** view.
7.  Select a country and service, and click **`Allocate Virtual Line Now`**.
    *   *Real-world handshake launched!* The server utilizes your GrizzlySMS key, queries Grizzly's active carrier nodes, deducts the wholesale cost from your balance, and allocates a live mobile number.
    *   Input this number into the service app (e.g. Telegram). The moment Grizzly intercepts the SMS, the backend poller fetches it, and displays your real-world verification code on your screen!

---

## 🏗️ Step 6: Compilation and Production Deployment

If you are ready to compile the codebase for hosting on a web server (like Vercel, Netlify, or a VPS):

1.  To compile the frontend into a single, fully-optimized inlined HTML file, run:
    ```bash
    npm run build
    ```
2.  Vite will output:
    ```
    dist/index.html  615.75 kB
    ✓ built in 5.25s
    ```
3.  You can serve this static `dist/index.html` on any static provider, while keeping your Node server (`server/index.js`) hosted on a backend provider (like Render, Heroku, or a VPS) and updating your `.env` there!

---

## 🔒 Security Best Practices

*   **Protect Your Key**: Never commit your `.env` file to public GitHub/GitLab repositories. The project has a `.gitignore` pre-configured to ensure `.env` and `database.sqlite` are never pushed online.
*   **Database Management**: The local database file `database.sqlite` can be inspected with any database manager (like SQLite Viewer) to examine your users, orders, and transaction history.
