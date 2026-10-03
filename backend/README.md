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
- `views/` - standalone `.html` pages for login, registration, dashboard, and each feature page
- `routes/api.js` - API endpoint definitions
- `routes/pageRoutes.js` - browser page routes
- `middleware/auth.js` - JWT verification middleware for protected API routes
- `middleware/roles.js` - role-based authorization middleware
- `middleware/projectAccess.js` - project membership and project-manager access checks
- `middleware/upload.js` - source-code and ZIP upload validation/storage
- `public/` - browser-side JavaScript and static assets
- `scripts/seed.js` - seed demo data for admin, manager, developers and sample workspace/project/task records

The application uses MVC separation: Mongoose models represent data, route modules map URLs and middleware to controller methods, controllers handle requests, and standalone HTML files provide the views. The `/api/*` endpoints continue to return JSON.

## Setup instructions

1. Install dependencies:
   npm install
2. Configure `backend/.env` with `MONGODB_URI` and a strong `JWT_SECRET`.
3. Start the API server from `backend/`:
   npm run dev
4. Seed demo data when starting with an empty database:
   npm run seed
5. Update an existing database after schema/workflow changes:
   npm run migrate

Start the React application separately from `frontend/` with `npm install` and `npm run dev`. Vite proxies `/api` requests to `http://localhost:5000`; set `VITE_API_BASE_URL` when the API is hosted elsewhere. MongoDB creates collections on first model write.

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

The dashboard loads the authenticated user, system counts, accessible projects, tasks, and notifications. Browser routes are handled by `routes/pageRoutes.js`; `controllers/pageController.js` serves their standalone HTML files from `views/`. Page behavior is in `public/js/page-app.js`. The pages use plain HTML without CSS. The existing `/api/*` JSON endpoints remain available for all data operations.

Additional plain HTML data pages are available after login:

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
```

Each page calls its corresponding JWT-protected API endpoint and displays the returned data as plain JSON inside the HTML page.

The module pages now also contain plain HTML forms for the implemented operations:

- Users: update a user role
- Workspaces: create a workspace
- Projects: create and update project details/progress
- Tasks: create, assign, update status, and update progress
- Submissions: upload source files or ZIP files, track branch names, and review code submissions with approve/request-changes actions
- Meetings: schedule meetings
- Messages: send project/workspace messages
- Notifications: create and view notifications
- Monitoring: view task, submission, and activity summaries
- Reports: generate project performance totals and progress data

All forms send requests to the existing JWT-protected `/api/*` routes. Server-side role and project-access checks remain in force, so unauthorized actions return an error instead of changing data.

## Workspace core APIs

```text
GET    /api/workspaces/:workspaceId/members
POST   /api/workspaces/:workspaceId/members
PATCH  /api/workspaces/:workspaceId/role
DELETE /api/workspaces/:workspaceId/members/:userId
GET    /api/workspaces/:workspaceId/activity
GET    /api/projects/:projectId/monitoring
GET    /api/projects/:projectId/report
```

Projects can only be created with a project manager and developers who are already members of the selected workspace. Workspace activity is recorded for workspace membership, role, and project changes.

The migration command is non-destructive. It backfills existing workspace members, user workspace/project references, project member records, and a database migration activity entry without deleting users, workspaces, projects, tasks, or submissions.

## HTML views

The page router serves static HTML views for the following browser routes:

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

The `/pages` route links to the browser views. API routes remain separate under `/api` and return JSON.

## API endpoints

- GET /api/health
- GET /api/dashboard
- POST /api/users/register
- POST /api/users/login
- GET /api/users/me (JWT required)
- PATCH /api/users/:userId/role (admin JWT required)
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
- POST /api/submissions (developer must belong to the project)
- GET /api/submissions (only submissions from accessible projects)
- PATCH /api/submissions/:submissionId/review
- POST /api/meetings
- GET /api/meetings
- POST /api/messages
- GET /api/messages
- POST /api/notifications
- GET /api/notifications
- POST /api/seed

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

The simple HTML UI stores the token in browser local storage after login, sends it automatically with protected requests, and provides a logout button. The JWT expires according to `JWT_EXPIRES_IN` in `.env` (one day by default).

## Role-based authorization

Public registration always creates a `developer` account. This prevents users from granting themselves admin or project manager privileges.

- `admin`: create workspaces and projects, manage users, and create notifications
- `project_manager`: create and manage assigned projects, create tasks, review submissions, schedule meetings, and view members in accessible workspaces
- `developer`: view assigned projects and tasks, update assigned task status, submit work for assigned tasks, and send messages

Public registration always creates a `developer` account. Only an administrator can assign the `admin` or `project_manager` role. Existing `viewer` accounts are migrated to `developer` by `npm run migrate`.

Project managers can add, remove, and update project members on their assigned projects. Task assignees must be active developers in the project, developers can update only their own assigned tasks, and project managers/admins can review submissions.

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

Each file is limited to 25 MB. Uploaded files are stored in the local `uploads/` directory and their metadata is saved in `Submission.files`. Downloads use `GET /api/submissions/:submissionId/files/:fileIndex` and require an authenticated user with access to that project; developers can download only their own submission files.

## Task filtering and deadline alerts

Authenticated users can filter tasks using `projectId`, `status`, `priority`, `assignee`, `due`, and `search` query parameters. The `due` filter supports `upcoming`, `overdue`, and `none`.

`POST /api/tasks/deadline-alerts` creates at most one task notification per user and task within a 24-hour period. Send `{ "days": 2 }` to check overdue tasks and tasks due within the next two days. `GET /api/notifications` returns only notifications belonging to the authenticated user.

## Project-level authorization

Project reads and writes are filtered by membership:

- Admins can access every project.
- Project managers can access projects where they are the `projectManager`.
- Developers can access projects where their user ID is in `developers`.

Task, submission, meeting, and project chat operations use the project ID to enforce this check. Workspace messages and meetings are restricted to workspace members. The API takes the authenticated user from the JWT as the task reporter, submission developer, meeting host, and message sender instead of trusting those identity fields from the browser.

Protected write operations return `403 Access denied` when the logged-in user does not have the required role.

## Future next steps

The next iteration can include:

- JWT authentication for secure login
- Role-based access control
- File upload handling for code and zip files
- Real-time chat and video conferencing integration
- React or Angular frontend upgrade
- Deployment setup and CI/CD
