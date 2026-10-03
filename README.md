# Collaborative Workspace

Collaborative Workspace is a MERN stack-based platform that helps a development company manage workspaces, projects, tasks, developer roles, code submissions, and team communication in a single place.

## Functional flow implemented

The project follows the workflow you described:

1. Admin creates a workspace.
2. Admin adds projects and assigns a project manager.
3. Project manager adds developers to the project.
4. Project manager assigns developer roles and creates tasks.
5. Developers work on tasks, upload code submissions, and update progress.
6. Project manager reviews the code and approves or requests changes.
7. Meetings, notifications, and chat support collaboration among project members.

## MongoDB schema design

The database is built with Mongoose and includes these collections:

- User
  - fullName
  - email
  - password
  - role
  - skills
  - workspaceIds
  - projectIds
- Workspace
  - name
  - description
  - owner
  - members
  - projects
  - status
  - settings
- Project
  - name
  - description
  - workspace
  - projectManager
  - developers
  - status
  - progress
  - repositoryUrl
  - defaultBranch
- ProjectMember
  - project
  - user
  - role
  - accessLevel
  - isActive
- Task
  - title
  - description
  - project
  - workspace
  - assignee
  - reporter
  - priority
  - status
  - dueDate
  - branchName
- Submission
  - project
  - task
  - developer
  - title
  - branchName
  - files
  - reviewStatus
  - reviewNotes
- Meeting
  - title
  - project
  - workspace
  - host
  - attendees
  - scheduledAt
  - meetingType
  - agenda
- ChatMessage
  - workspace
  - project
  - sender
  - receiver
  - content
  - messageType
- Notification
  - user
  - title
  - message
  - type
  - relatedId
- ActivityLog
  - workspace
  - project
  - user
  - action
  - details

## Project structure

- `server.js` - main Express server
- `config/db.js` - MongoDB connection configuration
- `models/` - Mongoose schemas
- `routes/` - maps browser and API URLs to controller methods
- `controllers/apiController.js` - API request handlers and application logic
- `controllers/pageController.js` - serves the corresponding HTML view for each browser page
- `views/` - EJS templates for login, registration, role-specific dashboards, and feature pages
- `routes/api.js` - API endpoint definitions
- `routes/pageRoutes.js` - browser page routes
- `middleware/auth.js` - JWT verification middleware for protected API routes
- `middleware/roles.js` - role-based authorization middleware
- `middleware/projectAccess.js` - project membership and project-manager access checks
- `middleware/upload.js` - source-code and ZIP upload validation/storage
- `public/` - browser-side JavaScript and static assets
- `scripts/seed.js` - seed demo data for admin, manager, developers and sample workspace/project/task records

The application uses MVC separation: Mongoose models represent data, route modules map URLs and middleware to controller methods, controllers handle requests, and EJS templates render role-aware pages. The `/api/*` endpoints continue to return JSON.

## Setup instructions

1. Install dependencies:
   npm install
2. Create your environment file:
   cp .env.example .env
3. Update MongoDB connection details in `.env` if needed.
4. Start the application:
   npm run dev
5. Seed demo data:
   npm run seed
6. Update an existing database after schema/workflow changes:
   npm run migrate

The app will be available at http://localhost:5000

## Browser page flow

The first browser page is the server-rendered login page:

```text
GET /
GET /login
```

Registration is available at:

```text
GET /register
```

After successful login, the browser stores the JWT and opens:

```text
GET /dashboard
```

The dashboard is selected by authenticated role (`admin`, `project_manager`, `developer`, or `viewer`). Browser routes are handled by `routes/pageRoutes.js`; `middleware/pageAuth.js` verifies the HttpOnly login cookie and `controllers/pageController.js` renders EJS templates from `views/`. Page behavior is in `public/js/page-app.js`. Navigation and forms are rendered only for relevant roles; API authorization remains authoritative. Dashboard and feature data comes from the signed-in user's accessible records, not hard-coded demonstration rows.

Additional EJS pages are available after login:

```text
/users
/workspaces
/projects
/tasks
/submissions
/meetings
/messages
/notifications
/monitoring
/reports
/profile
```

Pages use the HttpOnly cookie for API requests. Workspace, project, task, and member selectors display names rather than asking users to copy database IDs.

The module pages provide role-aware forms and interactive lists for the implemented operations:

- Team directory: view accounts within your accessible team scope
- Workspaces: create a workspace, select members from the account directory, and manage team roles
- Projects: create projects by selecting a workspace, manager, and developers from that workspace; update project details and project membership
- Tasks: create and assign tasks by selecting projects and developers, then update task status and progress
- Submissions: upload source files or ZIP files, track branch names, and review code submissions with approve/request-changes actions
- Meetings: schedule, start, join, and end live project video meetings
- Messages: persistent real-time group chat for project teams
- Notifications: create, view, mark read, receive real-time notifications, and generate deadline alerts
- Monitoring: view task, submission, and activity summaries
- Reports: generate project performance totals and progress data

All forms send requests to the existing JWT-protected `/api/*` routes. Server-side role and project-access checks remain in force, so unauthorized actions return an error instead of changing data.

## Workspace core APIs

```text
PATCH  /api/users/me
PATCH  /api/users/me/password
PATCH  /api/workspaces/:workspaceId
PATCH  /api/projects/:projectId/manager
GET    /api/workspaces/:workspaceId/members
POST   /api/workspaces/:workspaceId/members
PATCH  /api/workspaces/:workspaceId/role
DELETE /api/workspaces/:workspaceId/members/:userId
GET    /api/workspaces/:workspaceId/activity
PATCH  /api/tasks/:taskId
GET    /api/projects/:projectId/monitoring
GET    /api/projects/:projectId/report
PATCH  /api/notifications/:notificationId/read
PATCH  /api/notifications/read-all
```

Profile edits are restricted to the signed-in user's name, email, profile image URL/path, and skills. Password changes require the current password and invalidate previously issued JWT sessions. Project managers can update task details only within projects they manage; project progress is recalculated from task completion whenever tasks are created or changed. Notification read-state operations are scoped to the signed-in user.

Projects can only be created with a project manager and developers who are already members of the selected active workspace. Admins can reassign a project to another active project manager in its workspace. Removing a workspace developer also removes their project memberships, while removing a project manager is blocked until their managed projects are reassigned. Viewer accounts can read projects in their workspaces but cannot perform write operations. Workspace activity records workspace membership, role, task, submission, and project changes.

## Real-time notifications, project chat, and video meetings

The server exposes authenticated Socket.IO connections for notifications, project group chat, and WebRTC meeting signaling. Project meetings notify the team; an empty attendee list means all project members. Connect to the same server with the bearer JWT in the Socket.IO `auth` payload:

```js
const socket = io(serverUrl, { auth: { token: bearerJwt } });
socket.on('notification:new', (notification) => {
  // Show or refresh the signed-in user's notifications.
});

socket.emit('project:chat:join', { projectId }, (result) => {
  if (result.ok) socket.emit('project:chat:send', { projectId, content: 'Hello team' });
});
socket.on('project:chat:message', (message) => {
  // Append the persisted project message to the chat.
});

socket.emit('meeting:join', { meetingId }, (result) => {
  // Request camera and microphone access, then establish WebRTC peer connections.
});
```

Active project members with write access can send project chat messages. Meeting entry additionally requires an invitation, except for the host, assigned project manager, or admin. Messages are stored in MongoDB before delivery. Meetings use peer-to-peer WebRTC with Socket.IO for authenticated room membership and offer/answer/ICE signaling; a scheduled meeting can be started within 15 minutes of its scheduled time. The mesh is limited to 8 participants per meeting. Browsers require camera/microphone permission and HTTPS (localhost is allowed). `ICE_SERVERS` accepts a JSON array of WebRTC ICE server definitions; the default STUN server can be replaced or supplemented with your organization's STUN/TURN service for reliable connections across restrictive networks.

Sockets validate the user's active status and token version on connection, re-check project membership for chat sends and meeting signaling, and disconnect when the JWT expires, the password changes, or a member loses project access. Project chat and meeting signaling use separate rooms; the new real-time client is for team group chat and does not store meeting recordings.

The migration command is non-destructive. It backfills existing workspace members, user workspace/project references, project member records, and a database migration activity entry without deleting users, workspaces, projects, tasks, or submissions.

## EJS views

The page router renders EJS views for the following browser routes:

```text
GET /
GET /login
GET /register
GET /dashboard
GET /users
GET /workspaces
GET /projects
GET /monitoring
GET /reports
GET /tasks
GET /submissions
GET /meetings
GET /messages
GET /notifications
GET /pages
```

The `/pages` route links to the browser views. API routes remain separate under `/api` and return JSON. A successful login sets an HttpOnly session cookie for protected page rendering while retaining the bearer token used by the browser API client.

## API endpoints

- GET /api/health
- GET /api/dashboard (JWT required)
- POST /api/users/register
- POST /api/users/login
- POST /api/users/logout
- GET /api/users/me (JWT required)
- GET /api/users
- POST /api/workspaces
- GET /api/workspaces
- POST /api/projects
- GET /api/projects
- PATCH /api/projects/:projectId
- GET /api/projects/:projectId/members
- POST /api/projects/:projectId/members
- PATCH /api/projects/:projectId/members/:userId/role
- DELETE /api/projects/:projectId/members/:userId
- POST /api/tasks (project access required)
- GET /api/tasks (only tasks from accessible projects)
- PATCH /api/tasks/:taskId/assign
- PATCH /api/tasks/:taskId/status
- PATCH /api/tasks/:taskId/progress
- GET /api/tasks?status=in_progress&priority=high&due=upcoming&search=dashboard
- POST /api/tasks/deadline-alerts
- POST /api/submissions (developer must belong to the project and be assigned the task)
- GET /api/submissions (only submissions from accessible projects)
- GET /api/files/:fileName (JWT and project access required)
- PATCH /api/submissions/:submissionId/review
- POST /api/meetings
- GET /api/meetings
- PATCH /api/meetings/:meetingId/end (meeting host, assigned project manager, or admin)
- POST /api/messages
- GET /api/messages
- POST /api/notifications
- GET /api/notifications
- POST /api/seed (development only; admin JWT required)

The dashboard counts are available to signed-in users. The API seed endpoint is hidden unless `NODE_ENV=development`, requires an admin token, and never returns user password fields. Do not enable development mode in production.

## JWT authentication

Login with `POST /api/users/login` using an email and password. The response contains a JWT token:

```json
{
  "token": "your.jwt.token",
  "user": {
    "email": "admin@workspace.com",
    "role": "admin"
  }
}
```

Send that token to protected endpoints in the `Authorization` header:

```text
Authorization: Bearer your.jwt.token
```

The EJS UI uses an HttpOnly, SameSite cookie for protected page, API, and real-time requests; it does not keep the JWT in browser local storage. The JWT expires according to `JWT_EXPIRES_IN` in `.env` (one day by default). API clients may continue to use a bearer token.

Protected API and page middleware reload the active account from MongoDB and place it on `req.user`; controllers use this trusted server-side identity for owners, task reporters, submission developers, meeting hosts, message senders, and activity actors. Clients must not send or override those actor IDs. Request-supplied IDs identify target resources or recipients only, and are checked against the signed-in user's project/workspace access. Workspace creation always assigns its owner from the authenticated administrator.

## Role-based authorization

Public registration always creates a `developer` account. This prevents users from granting themselves admin or project manager privileges.

- `admin`: workspace administrator for workspaces they own; create projects, manage workspace members, and create notifications only for those workspace teams
- `project_manager`: view users, create tasks, schedule meetings, and create notifications
- `developer`: view assigned data, submit code, schedule meetings, and send messages
- `viewer`: read-only access to project data only after explicit project membership; viewers must be added as read-only guests

Workspace administrators can create multiple workspaces, but cannot access workspace or project data they do not own. Project managers can add, remove, and update project members on their assigned projects. Task assignees must be active developers in the project, developers can update only their own assigned tasks, and project managers/admins can review submissions.

## Code and ZIP uploads

Developers can upload up to 10 source-code files or ZIP files when creating a submission:

```text
POST /api/submissions
Content-Type: multipart/form-data
Field: project
Field: task
Field: title
Field: description
Field: branchName
Files field: files
```

Each file is limited to 25 MB. Uploaded files are stored in the local `uploads/` directory and their metadata is saved in `Submission.files`. Files download through the authenticated `/api/files/:fileName` route, which checks the caller's access to the submission's project.

## Task filtering and deadline alerts

Authenticated users can filter tasks using `projectId`, `status`, `priority`, `assignee`, `due`, and `search` query parameters. The `due` filter supports `upcoming`, `overdue`, and `none`.

`POST /api/tasks/deadline-alerts` creates at most one task notification per user and task within a 24-hour period. Send `{ "days": 2 }` to check overdue tasks and tasks due within the next two days. `GET /api/notifications` returns only notifications belonging to the authenticated user.

## Project-level authorization

Project access is checked against the active workspace and active `ProjectMember` record. Legacy developer entries are accepted only for projects that have no membership record for that user:

- Admins can access every project.
- Assigned project managers can read, write, review, and manage their projects.
- Developers with write access can update their assigned tasks and submit code; they cannot manage project membership or project settings.
- Reviewers can read project data and review submissions, but cannot modify tasks or send chat messages.
- Guests and explicitly added viewers are read-only. Workspace membership by itself does not grant project access.

Task, submission, file-download, meeting, and project chat operations use the same project-access resolver. Socket.IO revalidates access for room joins, chat sends, and meeting signaling. The API takes the authenticated user from the JWT as the task reporter, submission developer, meeting host, and message sender instead of trusting those identity fields from the browser.

Protected operations return `403` when the user lacks the required permission and `404` when the resource is missing or outside their accessible scope.

## Future next steps

Future work can include:

- MongoDB-backed end-to-end API and Socket.IO authorization tests
- Automated scheduled deadline alerts
- Hardened upload scanning, retention, and production object storage
- Production deployment, monitoring, backups, and recovery procedures
- Optional React or Angular frontend upgrade
