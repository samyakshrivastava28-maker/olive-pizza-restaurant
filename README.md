# 🍕 Olive Pizza Restaurant Operations & Kitchen Display System (KDS)

[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.1-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Electron](https://img.shields.io/badge/Electron-33.4-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Capacitor](https://img.shields.io/badge/Capacitor-7.6-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)]()

> **Olive Pizza Restaurant Manager** is the dedicated operational command center and Kitchen Display System (KDS) for store branch managers, kitchen chefs, and counter expeditors. Runs on Web (Port 5176), Desktop (Electron), and Mobile/Tablet (Capacitor).

---

## 🌟 Core Features & Operational Capabilities

### 🚨 1. Critical Full-Information Order Alert System
* **Un-Truncated Order Details**:
  - Full item list with exact quantities, sizes (8", 10", 12"), crusts (Hand-Tossed, Thin & Crispy, Cheese Burst), paid add-ons, and pricing.
  - Zero truncation—kitchen staff see the entire ticket at a glance without having to drill into sub-menus.
* **Complete Financial Breakdown**:
  - Item subtotal, packaging charges, delivery fees, GST tax calculations, discounts, and grand total.
* **High-Visibility Payment Collection Badges**:
  - `⚠️ CASH TO COLLECT FROM CUSTOMER: ₹XXX` (for Cash on Delivery orders).
  - `✅ ONLINE PAYMENT: PAID IN FULL (DO NOT COLLECT CASH)` (for prepaid orders).
* **1-Tap Customer Contact & Directions**:
  - Customer name, phone number with 1-tap phone dialer (`tel:${phone}`), and delivery address with 1-tap Google Maps directions.
  - Customer special instructions callout box.
* **Actionable Controls**:
  - `ACCEPT ORDER`: Claims order, marks status as preparing, silences audio alarm.
  - `SILENCE ALARM / ACKNOWLEDGE`: Calls `/api/orders/:id/acknowledge`, stops sound without changing order status.
  - `REJECT ORDER`: Logs refusal with reason and notifies customer.
  - `VIEW ORDER`: Navigates to full order inspection view.
* **Continuous Audio Alarms**: Looping audio alert (`new_order.mp3`) that persists until kitchen staff acknowledge or accept the ticket.

### 🔄 2. WebSocket Monotonic Ring Buffer & Gap Resynchronization
* **Real-Time Streaming**: Directly connects to backend WebSocket server (`ws://localhost:5000/ws` or production).
* **Branch-Scoped Registration**: Automatically registers branch credentials (`register_branch`) upon connection.
* **Zero-Loss Reconnection Sync**:
  - Tracks incoming events with monotonic sequence numbers (`lastSequence`).
  - If kitchen Wi-Fi drops, sends `sync_request` upon reconnection to instantly retrieve and replay all missed tickets.

### 📋 3. Live KDS Order Queue (`LiveOrdersPage.tsx`)
* **Kanban Workflow**: Organizes active tickets across 4 distinct stages:
  1. `pending` (Awaiting kitchen acceptance)
  2. `preparing` (In oven / kitchen preparation)
  3. `ready` (Packed and awaiting pickup/delivery)
  4. `out_for_delivery` (Handed over to rider)
* **1-Click Transitions**: Fast touch-optimized buttons to advance orders through each preparation stage.

### 📦 4. Kitchen Inventory & Fleet Dispatch
* **Ingredient Tracking**: Real-time stock counts for pizza dough, cheese, sauces, toppings, and packaging boxes with automated low-stock warnings.
* **Delivery Fleet Radar**: Interactive live radar map showing available delivery riders and dispatch assignment controls.

### 🏢 5. Branch Context Switching
* **Global Owner Mode**: When accessed by Global Owners (`olivepizzarjn@gmail.com`, `webhub2811@gmail.com`), renders a top-bar branch switcher allowing instant context switching between restaurant outlets.
* **Strict Staff Isolation**: Regular branch managers and kitchen staff are locked strictly to their assigned branch.

---

## 🏗️ Technical Architecture & Stack

- **Frontend Core**: React 19, TypeScript, Vite 6, Tailwind CSS v4
- **State Management**: Zustand
- **Desktop Runtime**: Electron 33, `electron-builder`
- **Mobile Container**: Capacitor 7 (Android / iOS)
- **Real-Time Data**: Firebase Firestore (`onSnapshot`), Backend WebSockets (`/ws`)
- **Icons & UI**: Lucide React, React Hot Toast

---

## ⚡ Getting Started

### 1. Prerequisites
- Node.js `v20+` or `v22+`
- Central Backend running on `http://localhost:5000` (or configured production backend)

### 2. Installation
```bash
cd "Olive Pizza restaurant manager"
npm install
```

### 3. Environment Configuration
Create a `.env` file in the project root:
```env
VITE_API_URL=http://localhost:5000
VITE_WS_URL=ws://localhost:5000/ws
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=olive-pizza-08.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=olive-pizza-08
VITE_FIREBASE_STORAGE_BUCKET=olive-pizza-08.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Running Locally
```bash
# Start Vite web dev server on port 5176
npm run dev

# Or start Electron desktop application in development
npm run desktop
```

### 5. Building for Production

```bash
# Web application build
npm run build

# Windows desktop installer (.exe)
npm run build:win

# macOS desktop installer (.dmg)
npm run build:mac

# Android / iOS Capacitor sync
npx cap sync
```

---

## 📄 License

Proprietary Software — All rights reserved by **Olive Pizza**, Rajnandgaon, Chhattisgarh, India.
