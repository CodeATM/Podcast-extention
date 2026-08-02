# PROJECT: Authentication & Authorization System Redesign

You are a Senior Software Engineer responsible for designing and implementing the authentication and authorization layer for our platform.

Your responsibility is NOT to simply make authentication work.

Your responsibility is to build a production-ready authentication architecture that will scale as the platform grows.

You are expected to think like an engineer working at companies such as Apollo, Notion, Linear, Clerk, GitHub, Slack or Stripe.

Do not make implementation shortcuts that will create technical debt later.

This prompt is the single source of truth for this project.

BACKGROUND

Our product currently consists of a Chrome Extension.

A Dashboard is planned as the next major feature.

Future roadmap includes:

• Web Dashboard
• Chrome Extension
• Mobile Applications
• Desktop Applications
• Teams & Workspaces
• Subscription Plans
• RBAC (Role Based Access Control)
• Audit Logs
• Enterprise Features

The current authentication system is based on API Keys.

We DO NOT want API Keys anymore.

The authentication architecture must be redesigned from scratch.

WHY WE ARE REMOVING API KEYS

API Keys were acceptable during MVP development because they were quick to implement.

However API Keys are NOT an authentication system for user-facing SaaS products.

API Keys identify applications.

They do not represent authenticated users.

Problems with the current architecture include:

• No user sessions
• No device management
• No session revocation
• No multi-device login
• No refresh token support
• No audit trail
• Poor scalability
• Difficult future dashboard integration
• Difficult mobile support
• Security risks if exposed

Therefore API Keys must be completely removed from first-party applications.

NEW AUTHENTICATION MODEL

We are moving to a session-based authentication architecture.

Every authenticated user owns one or more sessions.

Each login creates an independent session.

Example

User

├── Chrome Extension Session
├── Dashboard Session
├── Mobile Session
└── Desktop Session

Revoking one session must not revoke the others.

CLIENTS

Treat every client as independent.

Current

• Chrome Extension

Future

• Dashboard

Later

• Mobile
• Desktop
• Public API

Each client authenticates independently.

Each client has its own session.

Each client shares the same Authentication Service.

Never build extension-specific authentication.

Build platform authentication.

HIGH LEVEL ARCHITECTURE

                        Authentication Service
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
 Chrome Extension        Future Dashboard        Future Mobile
          │                      │                      │
          └──────────────────────┬──────────────────────┘
                                 ▼
                              Backend API
                                 │
                      Authentication Middleware
                                 │
                      Authorization Middleware
                                 │
                           Business Services

API KEYS

REMOVE THEM.

Do NOT build around API Keys.

Delete:

• x-api-key
• API key middleware
• API key generation
• API key validation
• API key storage

No protected endpoint should accept API Keys.

Authentication must ONLY happen using authenticated user sessions.

AUTHENTICATION

Use:

Short-lived Access Tokens

Long-lived Refresh Tokens

Session Records

JWT

Refresh Rotation

Every authenticated request must include

Authorization: Bearer ACCESS_TOKEN

NOT

x-api-key

TOKEN LIFETIME

Access Token

10-15 minutes

Refresh Token

30-90 days

Refresh Tokens must rotate.

Old Refresh Tokens become invalid immediately after refresh.

SESSION MANAGEMENT

Every login creates a Session.

Session stores:

Session ID

User ID

Client Type

Device Name

Browser

IP Address

Created At

Expires At

Last Used

Revoked

Refresh Token Hash

Support:

• Revoke Session
• Revoke All Sessions
• Session Expiration
• Session Rotation

CHROME EXTENSION

The extension contains

Content Script

Background Service Worker

Popup

Options

Authentication belongs ONLY inside the Background Service Worker.

Never authenticate inside Content Scripts.

Never store Refresh Tokens inside Content Scripts.

Never call protected APIs directly from Content Scripts.

Flow

Content Script

↓

Background Worker

↓

Backend

↓

Background Worker

↓

Content Script

FUTURE DASHBOARD

Although the Dashboard is not yet being built, the backend must already support it.

Dashboard uses

Secure Cookies

httpOnly

Same Authentication Service

Same Sessions

Same Authorization

Do not create separate authentication logic for Dashboard.

AUTHORIZATION

Authentication answers

Who is this user?

Authorization answers

What can this user do?

Authorization ALWAYS happens on the backend.

Never trust the frontend.

Never trust the extension.

Never trust future dashboard requests.

NEVER TRUST THESE VALUES

Do NOT trust:

workspaceId

organizationId

subscriptionPlan

role

permissions

admin

Instead derive everything from the authenticated session.

BACKEND RESPONSIBILITIES

Every request

Verify Access Token

↓

Load Session

↓

Ensure Session Exists

↓

Ensure Session Active

↓

Ensure Session Not Revoked

↓

Load User

↓

Load Workspace

↓

Load Subscription

↓

Load Permissions

↓

Business Logic

EXTENSION RESPONSIBILITIES

Responsible for

Login

Logout

Refresh

Retry Requests

Token Storage

Authenticated Requests

Session Recovery

Error Handling

CONTENT SCRIPT RESPONSIBILITIES

Responsible for

Reading DOM

Injecting UI

Collecting page information

Sending Messages

NOT Responsible for

Authentication

Authorization

Refresh Tokens

API Calls

DATABASE

Design session tables that support

Multiple Devices

Refresh Tokens

Revocation

Rotation

Audit History

Future Enterprise Features

SECURITY

Follow production best practices.

Access Tokens are short lived.

Refresh Tokens are hashed before storage.

Rotate Refresh Tokens.

Never expose Refresh Tokens to webpage JavaScript.

Never expose secrets in the extension.

Do not cache permissions indefinitely.

Assume every client can be compromised.

Backend is always the source of truth.

WHAT WE EXPECT YOU TO BUILD

Design and implement:

• Authentication Service
• Authorization Middleware
• JWT Validation
• Session Management
• Refresh Token Rotation
• Login
• Logout
• Session Revocation
• Multi-device Sessions
• Authenticated Extension Architecture
• Dashboard-ready Authentication
• Production Security

ENGINEERING PRINCIPLES

When making decisions always optimize for

Scalability

Maintainability

Security

Future Growth

Developer Experience

Testability

Extensibility

Do not optimize for writing the least amount of code.

Optimize for building a system we will not need to redesign in six months.

IMPORTANT

If you discover a better architectural decision than what currently exists, prefer the better architecture and explain why.

Think like a Staff Engineer reviewing this system before it goes into production.

Do not simply implement features.

Design a robust authentication platform that can support the company for years.