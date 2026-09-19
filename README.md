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
- `routes/api.js` - API endpoints for users, workspaces, projects, tasks, submissions, meetings, chat and notifications
- `middleware/auth.js` - JWT verification middleware for protected API routes
- `public/` - simple HTML/CSS/JS frontend for testing the basic workflow
- `scripts/seed.js` - seed demo data for admin, manager, developers and sample workspace/project/task records

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

The app will be available at http://localhost:5000

## API endpoints

- GET /api/health
- GET /api/dashboard
- POST /api/users/register
- POST /api/users/login
- GET /api/users/me (JWT required)
- GET /api/users
- POST /api/workspaces
- GET /api/workspaces
- POST /api/projects
- GET /api/projects
- POST /api/tasks
- GET /api/tasks
- POST /api/submissions
- GET /api/submissions
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

## Future next steps

The next iteration can include:

- JWT authentication for secure login
- Role-based access control
- File upload handling for code and zip files
- Real-time chat and video conferencing integration
- React or Angular frontend upgrade
- Deployment setup and CI/CD
