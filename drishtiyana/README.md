# DRISHTIYANA - Feature 1: Mobile Camera Live WebRTC Streaming

Live peer-to-peer mobile camera streaming system for the **DRISHTIYANA** project (SIH 2026).
A smartphone acts as a **Bus Sensing Unit** and streams its live camera directly to a laptop acting as an **Edge Monitor** via WebRTC.

---

## Project Structure

```
drishtiyana/
│
├── server/
│   ├── package.json      # Express, Socket.IO, selfsigned SSL generator
│   └── server.js         # HTTP/HTTPS signaling server & IP detection
│
├── public/
│   ├── mobile.html       # Phone interface (/mobile)
│   ├── mobile.js         # Camera permission & WebRTC sender logic
│   ├── viewer.html       # Laptop interface (/viewer)
│   ├── viewer.js         # WebRTC receiver & video display logic
│   └── style.css         # Modern dark-mode dashboard styling
│
└── README.md             # This guide
```

---

## 1. How to Install Dependencies

Open **PowerShell** or **Command Prompt** on your laptop and run:

```powershell
cd drishtiyana/server
npm install
```

---

## 2. How to Start the Server

From the `drishtiyana/server` folder, run:

```powershell
npm start
```

When started, the terminal will display the exact URLs to open on both devices, for example:
```text
============================================================
       DRISHTIYANA - Bus Sensing & Edge Monitoring
       Feature 1: Peer-to-Peer Live Camera Streaming
============================================================

[1] LAPTOP EDGE MONITOR (Open on this laptop):
    👉 http://localhost:3000/viewer
    👉 https://localhost:3001/viewer

[2] PHONE BUS SENSOR (Open on your mobile phone on the same Wi-Fi):
    👉 https://192.168.1.15:3001/mobile  [RECOMMENDED - Allows Camera]
    👉 http://192.168.1.15:3000/mobile
============================================================
```

---

## 3. How to Find Your Laptop's Local IP Address on Windows

The server **automatically detects and displays** your local IP when you run `npm start`.

If you ever want to check it manually:
1. Press `Win + R`, type `cmd`, and press **Enter**.
2. Run:
   ```cmd
   ipconfig
   ```
3. Look for your active connection (**Wireless LAN adapter Wi-Fi** or **Ethernet adapter**).
4. Find the **IPv4 Address** (e.g., `192.168.1.15`).

---

## 4. Exactly What URL to Open on the Phone

Make sure your phone is connected to the **same Wi-Fi** as your laptop.

Open Chrome or Safari on your phone and go to:
```
https://<YOUR_LAPTOP_IP>:3001/mobile
```
*(Example: `https://192.168.1.15:3001/mobile`)*

> [!IMPORTANT]
> **Why HTTPS on port 3001?**
> Modern mobile browsers (Chrome on Android, Safari on iOS) strictly block camera access (`getUserMedia`) on plain HTTP connections across Wi-Fi.
> When you open the HTTPS link on your phone, you will see a warning: *"Your connection is not private"* (because of the local self-signed certificate).
> **Simply tap "Advanced" -> "Proceed to site (unsafe)"**.
> This allows the browser to grant full camera permissions safely over your local Wi-Fi.

---

## 5. Exactly What URL to Open on the Laptop

Open Chrome, Edge, or Firefox on your laptop and go to:
```
http://localhost:3000/viewer
```

---

## 6. How to Test the Complete Phone → Laptop Live Video Connection

1. **Start the server** in your laptop terminal:
   ```powershell
   cd drishtiyana/server
   npm start
   ```
2. **Open Laptop Monitor**:
   - Go to `http://localhost:3000/viewer` on your laptop.
   - You will see:
     - `DRISHTIYANA EDGE MONITOR`
     - `BUS ID: BUS-101`
     - `SYSTEM CONNECTION: CONNECTED`
     - `CAMERA STATUS: OFFLINE`
3. **Open Phone Sensing Page**:
   - Open `https://<YOUR_LAPTOP_IP>:3001/mobile` in your phone browser.
   - Tap "Advanced" -> "Proceed".
   - You will see:
     - `DRISHTIYANA BUS SENSOR UNIT`
     - `BUS ID: BUS-101`
     - `SERVER CONNECTION: CONNECTED`
4. **Start Camera on Phone**:
   - Tap the **"START CAMERA"** button on the phone.
   - When the browser asks *"Allow camera access?"*, tap **Allow**.
   - Your phone will display its live camera preview.
   - Phone status will change to `CAMERA: LIVE` and the button will turn into `STOP CAMERA`.
5. **Watch Live Stream on Laptop**:
   - Within 1–2 seconds, the laptop monitor switches from the standby placeholder to the **full live camera stream** from your phone!
   - The laptop display will show:
     - `SYSTEM CONNECTION: CONNECTED`
     - `CAMERA STATUS: LIVE`
     - `WEBRTC P2P DATA: STREAMING (P2P)`
   - Move your phone around: notice the real-time, low-latency live video streaming directly to your laptop over WebRTC.
