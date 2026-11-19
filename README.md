# 🚀 Remote File Explorer - Render WebSocket & HTTP Relay Server

A lightweight, high-performance WebSocket and HTTP relay service designed to bypass Firebase Realtime Database bandwidth limits (100 GB/month on Render free tier vs. 10 GB on Firebase) and provide instant real-time duplex communication for the Remote File Explorer ecosystem.

---

## 🌟 Features
- **100 GB Free Monthly Bandwidth** on Render's free tier.
- **Ultra-Fast WebSockets:** Sub-millisecond command and response forwarding.
- **Zero Battery Drain:** Eliminates continuous Firebase polling on Android host phones.
- **WebRTC Signaling Relay:** Easily exchanges SDP offers, answers, and ICE candidates.
- **Binary/Base64 File Chunk Relay:** Fallback file transfer when WebRTC P2P is blocked by strict symmetric NATs.
- **Health Check & Uptime Monitoring:** Built-in `/health` endpoint for Render and UptimeRobot.

---

## 🛠️ How to Deploy to Render (100% Free)

### Step 1: Push to GitHub
1. Create a new GitHub repository (e.g. `remote-file-explorer-relay`).
2. Push the files inside this `relay-server` folder to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of relay server"
   git branch -M main
   git remote add origin https://github.com/<your-username>/remote-file-explorer-relay.git
   git push -u origin main
   ```

### Step 2: Deploy on Render.com
1. Go to [https://render.com](https://render.com) and sign in (using GitHub).
2. Click **New +** ➔ **Web Service**.
3. Select your GitHub repository (`remote-file-explorer-relay`).
4. Configure settings:
   - **Name:** `remote-file-explorer-relay` (or any custom name)
   - **Region:** Any (e.g., Oregon or Frankfurt)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` ($0/month)
5. Click **Create Web Service**.
6. Render will build and deploy your service in about 1 minute.
7. Once deployed, copy your service URL (e.g., `https://remote-file-explorer-relay.onrender.com`).

---

## ⏰ How to Prevent Render 15-Minute Sleep (Cold Start Bypass)

Render's free tier spins down after 15 minutes of inactivity. To keep your server awake 24/7 for free:

1. Go to [https://uptimerobot.com](https://uptimerobot.com) and create a free account.
2. Click **Add New Monitor**:
   - **Monitor Type:** `HTTP(s)`
   - **Friendly Name:** `RFE Relay Keep-Alive`
   - **URL (or IP):** `https://<your-render-app-name>.onrender.com/health`
   - **Monitoring Interval:** `5 minutes`
3. Click **Create Monitor**.
4. UptimeRobot will ping your server every 5 minutes, keeping it **awake 24/7** with zero cold starts!

---

## 📱 Malayalam Summary (മലയാളം ഗൈഡ്)

1. **GitHub-ലേക്ക് അപ്‌ലോഡ് ചെയ്യുക:** ഈ `relay-server` ഫോൾഡർ നിങ്ങളുടെ GitHub അക്കൗണ്ടിലേക്ക് ഒരു പുതിയ റിപ്പോസിറ്ററിയായി പുഷ് ചെയ്യുക.
2. **Render-ൽ ഡിപ്ലോയ് ചെയ്യുക:** [render.com](https://render.com)-ൽ ഫ്രീ അക്കൗണ്ട് എടുത്ത് **New Web Service** ക്ലിക്ക് ചെയ്യുക. നിങ്ങളുടെ ഗിറ്റ്‌ഹബ് റിപ്പോ തിരഞ്ഞെടുത്ത് **Free Plan** നൽകി ഡിപ്ലോയ് ചെയ്യുക.
3. **UptimeRobot സെറ്റപ്പ് ചെയ്യുക:** Render ഉറങ്ങിപ്പോകാതിരിക്കാൻ [uptimerobot.com](https://uptimerobot.com)-ൽ കയറി നിങ്ങളുടെ Render URL (`https://your-app.onrender.com/health`) 5 മിനിറ്റ് ഇന്റർവെലിൽ മോണിറ്റർ ആയി ആഡ് ചെയ്യുക. ഇതോടെ സർവർ **24 മണിക്കൂറും സജീവമായിരിക്കും!**
