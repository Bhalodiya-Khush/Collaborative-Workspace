# Collaborative Workspace - Fullstack Monorepo

Collaborative Workspace is an enterprise-grade MERN developer platform enabling teams to manage organizations, workspaces, projects, tasks, developer code submissions, real-time communication, and progress monitoring in one place.

---

## Monorepo Architecture

```text
Collaborative-Workspace/
├── package.json          # Root npm workspaces configuration
├── package-lock.json     # Monorepo lockfile
├── README.md             # Project documentation
│
├── backend/              # Node.js + Express + MongoDB REST API & Socket.IO Server
│   ├── config/           # Database connection (MongoDB / Mongoose)
│   ├── controllers/      # API controller business logic
│   ├── middleware/       # Auth, RBAC, access control, upload handling
│   ├── models/           # Mongoose schemas (User, Workspace, Project, Task, Submission, etc.)
│   ├── routes/           # REST endpoints (/api/*)
│   ├── scripts/          # Database seed and migration scripts
│   ├── services/         # Realtime WebRTC and Socket.IO services
│   ├── tests/            # Automated test suite (Node test runner)
│   ├── uploads/          # Code submission attachments
│   ├── package.json      # Backend dependencies & test scripts
│   └── server.js         # Express HTTP + WebSocket server entry point
│
└── frontend/             # Modern React 19 + Vite SPA Client
    ├── src/
    │   ├── components/   # Navbar, Sidebar, UI components
    │   ├── context/      # AuthContext, useAuth hook
    │   ├── layouts/      # MainLayout wrapper
    │   ├── pages/        # Dashboard, Workspaces, Projects, Tasks, Submissions,
    │   │                 # Meetings, Messages, Notifications, Monitoring, Reports,
    │   │                 # Users, Profile/Settings, Login, Register
    │   ├── routes/       # AppRoutes and ProtectedRoute (RBAC)
    │   ├── services/     # Axios client with JWT interceptor
    │   ├── App.jsx       # Root router and provider setup
    │   └── main.jsx      # React DOM entry
    ├── package.json      # Frontend dependencies & scripts
    └── vite.config.js    # Vite configuration with /api proxy
```

---

## Technology Stack

- **Frontend**: React 19, React Router v7, Axios, Lucide React, Vite 8, Vanilla CSS
- **Backend**: Node.js, Express 5, MongoDB, Mongoose 9, JWT, Bcrypt, Socket.IO 4, Multer 2
- **Monorepo**: NPM Workspaces, Concurrently

---

## Quick Start & Setup

### 1. Prerequisites
- Node.js (v18+ recommended)
- MongoDB running locally or MongoDB Atlas URI

### 2. Install Dependencies
From the repository root:
```bash
npm install
```

### 3. Configure Environment
Create `.env` in `backend/` (based on `backend/.env.example`):
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/collaborative-workspace
JWT_SECRET=your-secure-jwt-secret-key
JWT_EXPIRES_IN=1d
NODE_ENV=development
```

### 4. Seed Initial Data (Optional)
To populate demo users, workspaces, projects, tasks, and meetings:
```bash
npm run seed
```

Default credentials created:
- **Admin**: `admin@workspace.com` / `admin123`
- **Project Manager**: `manager@workspace.com` / `manager123`
- **Developer 1**: `dev1@workspace.com` / `dev123`
- **Developer 2**: `dev2@workspace.com` / `dev123`

### 5. Run the Application in Development Mode
Start both Backend and Frontend concurrently from root:
```bash
npm run dev
```

- **Frontend UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000](http://localhost:5000)

---

## Available Monorepo Scripts

| Command | Action |
|---|---|
| `npm run dev` | Runs both backend and frontend development servers concurrently |
| `npm run dev:backend` | Runs backend dev server with nodemon |
| `npm run dev:frontend` | Runs frontend Vite dev server |
| `npm run build` | Compiles the production React bundle into `frontend/dist` |
| `npm run lint` | Runs ESLint over frontend code |
| `npm test` | Runs the backend test suite and checks code syntax |
| `npm run seed` | Seeds database with demo team and project structure |
| `npm run migrate` | Synchronizes memberships and workspace/project references |

---

## Key Features

1. **Role-Based Access Control (RBAC)**:
   - Roles are stored on workspace and project memberships, not on the User account.
   - **Workspace Admin**: Manages the workspace and its members.
   - **Project Manager**: Plans and manages the projects where they hold that membership.
   - **Developer**: Handles assigned work and submits code in projects where they hold that membership.

2. **Code Submissions & File Management**:
   - Multi-file uploads (`.zip`, `.js`, `.py`, `.java`, `.cpp`, `.cs`, `.html`, `.css`, etc.).
   - Secure authenticated downloads via `/api/files/:fileName`.

3. **Real-time Communication & Meetings**:
   - WebRTC meeting signaling and Socket.IO project team chat.
   - Instant notifications for assignments, reviews, and status updates.

4. **Monitoring & Reports**:
   - Sprint progress metrics, completion rates, and exportable JSON reports.
