# CLAUDE.md

# Frontend Engineering & Design Instructions

You are responsible for building the frontend of the application or product in the current repository.

Your job is NOT to generate a generic frontend, a collection of cards, or a visually polished mockup.

Your job is to understand the existing backend first, derive the actual product capabilities from it, and then build a distinctive, interactive, production-quality frontend around those capabilities.

The frontend must feel like a product designed by a strong human product designer and senior frontend engineer.

It must NOT feel AI-generated.

---

# 1A. RUNTIME AND PACKAGE MANAGEMENT

Use **Bun as the development toolchain**, but write **all application code to be Node.js-compatible**.

Bun is a development tool, NOT the application's runtime dependency.

## Development

Use Bun for:

- Installing dependencies
- Running development scripts
- Running tests
- Running linters
- Running formatters
- Running local builds

Prefer:

```bash
bun install
bun run dev
bun test
bun run build
```

Use the repository's existing scripts when available.

Do not unnecessarily introduce npm, Yarn, or pnpm commands when Bun can perform the same development task.

## Application Code

All application code must remain compatible with Node.js.

Do NOT use Bun-specific:

- APIs
- Runtime globals
- Modules
- `Bun.*` APIs
- Bun-only filesystem APIs
- Bun-only networking APIs
- Bun-specific server APIs
- Bun-specific runtime behavior
- Bun-specific environment assumptions

Do not write application code that requires Bun to execute.

Prefer standard Web APIs, Node.js APIs, and libraries that are compatible with the intended Node.js version.

For example, do not turn:

```text
Development tooling
        ↓
      Bun
```

into:

```text
Application runtime
        ↓
      Bun
```

The application code must remain portable to Node.js.

## Production

Production must use **Node.js as the runtime** unless the repository explicitly specifies another production runtime.

Do not require Bun to:

- Start the production application
- Serve the production application
- Execute server-side application code
- Run production workers
- Run production jobs
- Execute production scripts

Production builds, Dockerfiles, deployment configuration, process definitions, and runtime documentation must assume Node.js.

The intended separation is:

```text
Development Tooling
        ↓
      Bun
 ┌──────┼──────┐
Install  Dev   Test
         │
        Build
         ↓
Application Code
         ↓
Node.js Compatible
         ↓
Production Runtime
         ↓
      Node.js
```

## Package Manager Consistency

Use Bun's package manager during development.

Avoid creating or maintaining multiple lockfiles unnecessarily.

Do not switch package managers simply because a dependency's documentation uses npm.

If the repository already contains an established package-management setup, preserve it unless there is a strong technical reason to change it.

## Runtime Boundary

Always distinguish between:

```text
Bun = development tooling
Node.js = application runtime
```

Never introduce a dependency on Bun into application architecture merely because Bun is being used locally.

---

# 1. PRIMARY OBJECTIVE

Build the frontend by integrating with the existing backend and the actual product requirements.

The backend is the source of truth for:

- Available functionality
- API behavior
- Authentication
- Authorization
- Data models
- Relationships
- Validation
- Business rules
- Resource states
- Error conditions
- User permissions
- Pagination
- Filtering
- Sorting
- Status transitions
- Required fields
- Optional fields

Do NOT invent backend functionality simply because it would make the UI look better.

If a feature does not exist in the backend, do not silently implement fake frontend functionality for it.

If a frontend feature appears necessary but the backend does not support it, document the gap instead of fabricating behavior.

---

# 1B. CREATE AND MAINTAIN A PROJECT MAP

Before implementing the frontend, create a persistent **project map** inside the repository.

The map exists to prevent:

- Context drift
- Hallucinated requirements
- Forgotten backend capabilities
- Forgotten user flows
- Accidental feature invention
- Inconsistent design decisions
- Duplicate implementation
- Architectural drift
- Losing track of what has already been completed

The project map is a navigation and source-of-truth document for the frontend implementation.

Use a clear file such as:

```text
docs/PROJECT_MAP.md
```

If the repository already has an appropriate documentation location, use that instead.

Do NOT create multiple competing project maps.

---

## What the Project Map Must Contain

At minimum, maintain these sections:

```text
# Project Map

## 1. Product Understanding

## 2. Backend Capabilities

## 3. Resources & Relationships

## 4. API Map

## 5. Authentication & Authorization

## 6. User Roles & Permissions

## 7. User Journeys

## 8. Routes / Screens

## 9. Component Map

## 10. State Map

## 11. Frontend ↔ Backend Dependencies

## 12. Design Direction

## 13. Design Decisions

## 14. Implementation Status

## 15. Known Backend Limitations

## 16. Open Questions

## 17. Deferred Work

## 18. Completed Work
```

The exact structure can evolve with the project, but the information must remain easy to navigate.

---

## Backend Map

Record the actual backend capabilities discovered during reconnaissance.

For example:

```text
Resource
 ├── Endpoints
 ├── Fields
 ├── Relationships
 ├── Validation
 ├── Permissions
 ├── States
 └── Errors
```

Do not invent information.

Every backend capability recorded in the map must be derived from the actual repository.

---

## API Map

Maintain a concise map of frontend-relevant APIs.

Example:

```text
Authentication
 ├── POST /auth/login
 ├── POST /auth/logout
 └── GET  /auth/me

Projects
 ├── GET    /projects
 ├── POST   /projects
 ├── GET    /projects/:id
 ├── PATCH  /projects/:id
 └── DELETE /projects/:id
```

The actual endpoints must come from the backend.

Include relevant information such as:

- HTTP method
- Endpoint
- Request shape
- Response shape
- Authentication requirement
- Permission requirement
- Validation
- Error conditions
- Pagination/filtering where applicable

---

## User Journey Map

Map the important user workflows.

Example:

```text
User opens application
        ↓
Authentication
        ↓
Dashboard
        ↓
Select resource
        ↓
View details
        ↓
Perform action
        ↓
Backend request
        ↓
Success / Error
        ↓
Updated state
```

The actual journey must reflect the product.

For each major workflow, record:

- Entry point
- User intention
- Screen
- Available actions
- Backend dependency
- Success state
- Failure state
- Exit/next step

---

## Route / Screen Map

Maintain a map of frontend routes.

Example:

```text
/
├── /login
├── /dashboard
├── /projects
├── /projects/:id
└── /settings
```

Do not add routes just because they are common in other products.

Every route must have a reason to exist.

---

## Component Map

Track major reusable components and where they are used.

Example:

```text
components/
├── Button
├── Dialog
├── DataTable
├── EmptyState
└── ErrorState
```

Feature-specific components should remain associated with their feature.

Do not turn every component into a global abstraction.

---

## State Map

Track important application states.

For each major workflow, identify:

```text
Initial
Loading
Loaded
Empty
Submitting
Success
Error
Unauthorized
Forbidden
Not Found
Network Failure
```

This prevents implementing only the happy path.

---

## Frontend ↔ Backend Dependency Map

For each major frontend feature, record:

```text
Feature
  ↓
Frontend route/component
  ↓
API endpoint
  ↓
Backend resource
  ↓
Permission
  ↓
Expected states
```

This becomes the fastest way to verify whether a feature is actually supported.

---

## Design Map

Record important design decisions so they are not forgotten later.

Include:

- Typography
- Color system
- Spacing system
- Radius strategy
- Border treatment
- Shadows
- Motion principles
- Navigation pattern
- Interaction patterns
- Responsive behavior
- Accessibility decisions
- Important visual conventions

Do not record only the final values.

Record the reasoning when a decision is important.

Example:

```text
Decision:
Use a dense content layout on the main resource screen.

Reason:
The primary user task involves scanning and comparing multiple records.
```

This prevents later changes from accidentally contradicting the product's UX.

---

## Implementation Status

Track implementation progress explicitly.

Example:

```text
[x] Backend reconnaissance
[x] API map
[x] Authentication flow
[x] Application shell
[ ] Main resource workflow
[ ] Error states
[ ] Mobile refinement
[ ] Accessibility audit
[ ] Final integration testing
```

Use clear status markers.

Do not mark work complete merely because a component exists.

A feature is complete only when:

```text
UI
 ↓
Interaction
 ↓
API integration
 ↓
Loading state
 ↓
Success state
 ↓
Error state
 ↓
Permission handling
 ↓
Responsive behavior
 ↓
Verification
```

has been addressed appropriately.

---

# 1C. MAP AS A RECOVERY MECHANISM

The project map is not documentation that gets written once and forgotten.

It is a **recovery mechanism**.

Whenever you become uncertain about:

- What the product is supposed to do
- Which feature is being implemented
- Which route should be used
- Which API supports a feature
- Which permissions apply
- What the intended user journey is
- Why a design decision was made
- What has already been completed
- What should be implemented next

STOP and consult the project map.

Then verify the relevant information against the actual source code when necessary.

Use this recovery sequence:

```text
Uncertainty
    ↓
Check PROJECT_MAP.md
    ↓
Identify intended direction
    ↓
Verify against backend/source code
    ↓
Correct current implementation
    ↓
Continue from the documented state
```

Do not continue by guessing.

---

# 1D. ANTI-HALLUCINATION RULE

If information is not known, do not invent it.

Use this priority order:

```text
1. Actual backend/source code
        ↓
2. Existing project documentation
        ↓
3. PROJECT_MAP.md
        ↓
4. Existing frontend implementation
        ↓
5. Explicit product requirements
        ↓
6. Reasonable UX inference
```

If two sources conflict:

```text
Actual source code
        >
Project documentation
        >
Project map
        >
Inference
```

Update the project map when the verified truth changes.

Do not preserve an outdated map simply because it was written earlier.

---

# 1E. CONTEXT DRIFT CHECK

Before beginning a major implementation task, re-check:

```text
What am I building?
Why does it exist?
Which user journey does it belong to?
Which backend capability supports it?
Which route owns it?
What states does it require?
What has already been completed?
What comes next?
```

If the answer cannot be determined confidently, consult the project map before writing code.

When returning to the project after a long context gap, inspect the project map first.

Do not reconstruct the project from memory when a documented map exists.

---

# 1F. MAP MAINTENANCE RULE

Update the project map when any of the following changes:

- Backend API
- Database-supported capability relevant to the frontend
- Authentication behavior
- Authorization behavior
- User flow
- Route structure
- Major component architecture
- Design system
- Important UX decision
- Implementation status
- Known limitation
- Deferred feature
- Completed feature

Do not update the map for meaningless implementation noise.

The map should remain concise enough to be useful.

---

# 1G. BEFORE YOU FINISH A TASK

At the end of every meaningful implementation task:

1. Verify the implementation.
2. Update the project map.
3. Mark completed work accurately.
4. Record important decisions.
5. Record unresolved issues.
6. Record deferred work if applicable.
7. Ensure the next implementation step is clear.

The project should always be left in a state where another development session can resume without guessing what happened.

---

# 2. MANDATORY FIRST STEP: INSPECT THE BACKEND

Before writing frontend code, inspect the backend folder thoroughly.

DO NOT immediately start creating components.

First understand the existing system.

Inspect:

- Backend directory structure
- Application entry points
- Routes
- Controllers
- Services
- Repositories
- Database schemas
- DTOs
- Validation schemas
- Authentication logic
- Authorization logic
- Middleware
- API response structures
- Error handling
- Pagination
- Filtering
- Sorting
- Resource relationships
- Status values
- Permission rules
- Environment configuration
- API documentation if present
- Existing tests
- Seed data if available

Create an internal understanding of:

```text
Frontend
   ↓
API
   ↓
Controller
   ↓
Service
   ↓
Repository
   ↓
Database
```

Understand every important resource before designing its UI.

For example:

```text
User
 ├── Projects
 │     ├── Members
 │     ├── Tasks
 │     ├── Permissions
 │     └── Activity
```

The actual structure must be derived from the backend.

DO NOT assume this example represents the actual project.

---

# 3. BACKEND MUST BE THE SOURCE OF TRUTH

Never create UI behavior based on assumptions.

For every frontend feature, answer:

1. Which backend resource supports this?
2. Which API endpoint supports it?
3. What HTTP method is used?
4. What request body is required?
5. What response structure is returned?
6. What validation rules exist?
7. What permissions are required?
8. What errors can occur?
9. What loading state is required?
10. What empty state is required?

Before implementing a major screen, establish its backend dependency.

Example:

```text
Create Task

Frontend
   ↓
POST /tasks
   ↓
Backend validation
   ↓
Authorization
   ↓
Task creation
   ↓
Response
   ↓
Update UI
```

Do not create fake local state that pretends to be persistent backend data.

---

# 4. DO NOT MODIFY THE BACKEND UNLESS ABSOLUTELY NECESSARY

The first implementation pass is FRONTEND ONLY.

Do not modify backend files merely to make frontend development easier.

Do not:

- Rewrite backend APIs
- Change database schemas
- Rename backend entities
- Change API contracts
- Remove validation
- Bypass authorization
- Add fake endpoints
- Add temporary production endpoints

If the frontend cannot correctly implement a requirement because the backend lacks a required capability:

1. Identify the limitation.
2. Document it.
3. Continue implementing everything that can be correctly implemented.

Only modify backend code if explicitly instructed to do so.

---

# 5. DESIGN PHILOSOPHY

The final product must NOT look like a generated SaaS template.

Avoid the visual language of generic AI-generated applications.

Do NOT automatically create:

- Hero section + three cards + testimonials
- Dashboard made entirely from cards
- Excessive rounded containers
- Excessive gradients
- Excessive glassmorphism
- Random purple/blue gradients
- Giant centered headings everywhere
- Generic sidebar + topbar layouts
- Repetitive cards
- Excessive shadows
- Decorative blobs without purpose
- Fake statistics
- Fake testimonials
- Fake activity feeds
- Fake users
- Fake product data
- Unnecessary animations
- Huge empty spaces
- Identical sections repeated throughout the application

The design should have its own visual identity.

---

# 6. DESIGN REFERENCES ARE ENCOURAGED

You are explicitly allowed to research and study popular websites and products for design inspiration.

Use references aggressively for:

- Information architecture
- Interaction patterns
- Navigation
- Typography
- Layout systems
- Form interactions
- Tables
- Command interfaces
- Filtering
- Search
- Empty states
- Loading states
- Animations
- Micro-interactions
- Responsive behavior
- Accessibility patterns
- UX conventions

Possible reference sources include:

- Linear
- Notion
- Stripe
- Vercel
- Framer
- Raycast
- Figma
- Arc
- GitHub
- Apple
- Shopify
- Airbnb
- Slack
- Discord
- Superhuman
- Readwise
- Dropbox
- modern independent products
- high-quality Awwwards websites
- modern design studios
- well-designed open-source products

These are REFERENCES, NOT TEMPLATES.

---

# 7. NEVER COPY A REFERENCE

Do not copy:

- Layouts
- Exact component arrangements
- Branding
- Logos
- Illustrations
- Copywriting
- Unique visual identities
- Exact color systems
- Exact animations
- Exact navigation structures
- CSS
- Source code
- Assets
- Distinctive compositions

Instead:

```text
REFERENCE
   ↓
Understand the design principle
   ↓
Extract the interaction pattern
   ↓
Adapt it to this product
   ↓
Create a new visual implementation
```

The final product must be independently recognizable.

A user familiar with the reference website should NOT immediately think:

"this is just a clone of X."

---

# 8. CREATE A DISTINCTIVE DESIGN LANGUAGE

Before implementing the UI, establish a design system.

Define:

## Typography

Choose:

- Primary typeface
- Display typeface if required
- Font weights
- Heading scale
- Body scale
- Label scale
- Line heights
- Letter spacing

Typography should create hierarchy without relying on giant font sizes.

## Color

Define a coherent color system:

```text
Background
Surface
Surface Elevated
Border
Primary Text
Secondary Text
Muted Text
Primary Action
Success
Warning
Danger
Info
```

Use color intentionally.

Do not use gradients simply because gradients make screenshots look impressive.

## Spacing

Use a consistent spacing system.

Avoid arbitrary values everywhere.

## Radius

Use consistent corner treatment.

Not every element needs to be heavily rounded.

## Shadows

Use shadows only where they communicate hierarchy or elevation.

## Motion

Define a small motion language:

- Hover
- Focus
- Press
- Expand
- Collapse
- Enter
- Exit
- Loading
- Success
- Error

Animations must communicate state or improve comprehension.

Never animate something simply because animation exists.

---

# 9. PRODUCT-FIRST DESIGN

Do not design the interface as disconnected screens.

Think about the complete user journey.

For each major workflow:

```text
User intention
      ↓
Entry point
      ↓
Interaction
      ↓
Validation
      ↓
Backend request
      ↓
Loading
      ↓
Success / Failure
      ↓
Updated UI
```

Example:

```text
User wants to create something
        ↓
Clicks Create
        ↓
Form opens
        ↓
User enters data
        ↓
Client validation
        ↓
Submit
        ↓
Loading state
        ↓
Backend response
        ↓
Success feedback
        ↓
UI updates
```

Every important interaction should have a complete lifecycle.

---

# 10. THE WEBSITE MUST BE INTERACTIVE

This is NOT a static visual prototype.

Users must be able to meaningfully interact with the product.

Implement real interactions such as appropriate to the backend:

- Create
- Edit
- Delete
- Search
- Filter
- Sort
- Pagination
- Open
- Close
- Expand
- Collapse
- Select
- Multi-select
- Toggle
- Form validation
- Authentication
- Navigation
- Context menus
- Modals
- Drawers
- Tabs
- Keyboard interactions
- Confirmation flows
- Error recovery
- Retry
- Refresh
- State changes

Only implement interactions supported by the actual product requirements/backend.

---

# 11. STATES ARE PART OF THE DESIGN

Every major component must account for real application states.

At minimum consider:

```text
Initial
Loading
Loaded
Empty
Error
Disabled
Submitting
Success
Unauthorized
Forbidden
Not Found
Offline / Network Failure
```

Do not design only the "happy path."

For example:

```text
Loading
   ↓
Data available
   ├── populated state
   └── empty state

Request failure
   ↓
Error state
   ↓
Retry
```

Empty states should explain:

- What happened
- Why the screen is empty
- What the user can do next

Never use meaningless:

"Nothing here."

---

# 12. REAL DATA ONLY

Do not fill the application with fake production-looking data unless it is explicitly required for development.

If mock data is temporarily necessary:

- Keep it clearly isolated.
- Make it easy to remove.
- Never confuse it with backend data.
- Do not hardcode fake business statistics into production UI.

The UI should eventually work against the actual backend.

---

# 13. AUTHENTICATION & AUTHORIZATION

Respect backend authentication and authorization.

Do not assume:

```text
Logged in = can perform everything
```

Instead:

```text
Authenticated
      ↓
Authorized?
   ↙       ↘
 YES       NO
  ↓         ↓
Action    Forbidden state
```

The frontend should reflect permissions where appropriate.

IMPORTANT:

Frontend permission checks are UX controls, NOT security controls.

Never rely on frontend authorization for security.

The backend remains authoritative.

---

# 14. COMPONENT ARCHITECTURE

Build reusable components based on actual repeated patterns.

Do not create abstractions merely for the sake of abstraction.

Prefer:

```text
Feature
 ├── Components
 ├── Hooks
 ├── API
 ├── Types
 └── Utilities
```

Keep components understandable.

Avoid:

- Massive components
- God components
- Components containing unrelated business logic
- Deeply nested abstraction layers
- Generic abstractions that exist only once

Extract components when reuse or readability justifies it.

---

# 15. BUSINESS LOGIC

Keep business logic separate from presentation.

Prefer:

```text
UI
 ↓
Interaction layer
 ↓
Application logic
 ↓
API layer
 ↓
Backend
```

Do not bury API calls, validation rules, and complex business logic inside JSX.

The UI should remain readable.

---

# 16. TYPES

Use strong typing throughout the frontend.

Types should accurately represent backend contracts.

Do not use:

```ts
any
```

as an easy escape hatch.

If the backend returns:

```text
User
Project
Member
Task
```

represent those structures properly.

Keep API types consistent.

---

# 17. API INTEGRATION

Create a clear API integration layer.

Do not scatter raw API requests throughout random components.

Prefer a structure that makes this relationship obvious:

```text
Component
   ↓
Feature API function
   ↓
HTTP client
   ↓
Backend
```

Centralize:

- Base URL
- Headers
- Authentication
- Error normalization
- Request handling
- Response parsing

Do not duplicate API configuration.

---

# 18. ERROR HANDLING

Errors should be understandable to humans.

Bad:

```text
Error 500
```

Better:

```text
Something went wrong while saving your changes.

Try again.
```

For development, preserve useful technical information in logs.

For users, provide appropriate actionable feedback.

Never expose:

- Stack traces
- Internal database errors
- Secrets
- Tokens
- Internal infrastructure details

---

# 19. FORMS

Forms must feel deliberate.

Implement:

- Clear labels
- Appropriate input types
- Validation
- Error messages
- Loading state
- Disabled submit state
- Success feedback
- Keyboard navigation
- Focus management
- Unsaved-change handling when relevant

Validation should align with backend rules.

Do not create conflicting frontend validation rules.

---

# 20. RESPONSIVE DESIGN

The frontend must work across:

```text
Desktop
Laptop
Tablet
Mobile
```

Do not simply shrink the desktop UI.

Design responsive behavior intentionally.

For each major component decide:

```text
Desktop behavior
Tablet behavior
Mobile behavior
```

Do not blindly apply a generic sidebar/topbar/mobile-navigation pattern.

The actual layout should be based on the product.

---

# 21. ACCESSIBILITY

Accessibility is part of the implementation.

Include:

- Semantic HTML
- Keyboard navigation
- Visible focus states
- Accessible labels
- Proper button semantics
- Proper form labels
- Sufficient contrast
- Reduced-motion support where appropriate
- Screen-reader-friendly state changes
- Accessible dialogs
- Accessible dropdowns
- Accessible menus

Do not sacrifice usability for visual effects.

---

# 22. MICRO-INTERACTIONS

Use subtle interaction feedback.

Examples:

```text
Button
Idle → Hover → Press → Loading → Success

Input
Idle → Focus → Valid / Invalid

Card
Idle → Hover → Active

Modal
Closed → Opening → Open → Closing
```

Motion should be:

- Fast
- Intentional
- Consistent
- Non-distracting

Avoid animation overload.

The goal is:

"this interface feels alive"

not:

"the developer discovered CSS transitions yesterday."

---

# 23. NAVIGATION

Navigation must reflect actual product structure.

Users should always understand:

- Where they are
- Where they can go
- What they can do
- How to return

Use appropriate patterns such as:

- Sidebar
- Top navigation
- Breadcrumbs
- Tabs
- Contextual navigation
- Command palette

Only when they make sense.

Do not add navigation patterns simply because popular products use them.

---

# 24. SEARCH & DISCOVERY

If the backend supports searching, make the experience excellent.

Consider:

- Search input
- Debouncing
- Loading state
- Empty result state
- Clear search
- Keyboard interaction
- Filtering
- Sorting
- Search result hierarchy

Do not create fake search functionality that only filters frontend mock data.

---

# 25. PERFORMANCE

Build with performance in mind.

Avoid:

- Unnecessary re-renders
- Huge client bundles
- Unoptimized images
- Excessive dependencies
- Heavy animations
- Unnecessary API requests
- Repeated fetching
- Blocking UI

Use appropriate techniques such as:

- Lazy loading
- Code splitting
- Caching
- Pagination
- Debouncing
- Memoization where justified
- Optimistic updates where safe

Do not optimize prematurely.

Measure before introducing complicated optimizations.

---

# 26. NO DESIGN SYSTEM OVERENGINEERING

Do not build a 300-component design system for a small project.

Start with the actual product.

Extract reusable primitives only when they naturally emerge.

For example:

```text
Button
Input
Dialog
Dropdown
Tooltip
Badge
Tabs
Table
```

should be reusable when repeated.

But do not create giant abstractions that obscure simple UI behavior.

---

# 27. VISUAL HIERARCHY

Every screen should have a clear hierarchy.

The user should immediately understand:

```text
Where am I?
What is this page?
What is the primary action?
What information matters?
What can I interact with?
```

Primary actions should visually dominate secondary actions.

Do not make every button look equally important.

---

# 28. INFORMATION DENSITY

Use the amount of information appropriate to the task.

Some screens should be dense.

Some screens should breathe.

Do not force every screen into:

```text
Large heading
Subtitle
Three cards
Large empty space
```

Design based on the user's task.

---

# 29. VISUAL REFERENCES DURING DEVELOPMENT

When researching references, analyze them using:

```text
What problem does this pattern solve?

Why does this layout work?

How does hierarchy work?

How does the user discover actions?

How does the interface communicate state?

What makes the interaction satisfying?

What can be adapted?

What should NOT be copied?
```

Create a new solution from those principles.

---

# 30. DO NOT USE REFERENCE ASSET FILES

Do not copy:

- Images
- Logos
- SVGs
- Icons unique to another product
- Illustrations
- Source CSS
- Source JavaScript
- Source components

Use original assets or appropriately licensed assets.

For icons, prefer an established icon library where appropriate rather than copying proprietary assets.

---

# 31. "ONE OF A KIND" DOES NOT MEAN RANDOM

Uniqueness must come from:

- Product-specific interaction design
- Strong visual hierarchy
- Typography
- Layout composition
- Information architecture
- Motion
- Context-aware components
- Distinctive navigation
- Meaningful visual language

Do NOT attempt to be unique by randomly changing:

- Colors
- Border radius
- Font sizes
- Button shapes

Randomness is not design.

---

# 32. BUILD THE PRODUCT, NOT A DRIBBBLE SHOT

The result must prioritize:

1. Usability
2. Product clarity
3. Interaction
4. Accessibility
5. Performance
6. Maintainability
7. Visual quality

A beautiful screenshot that doesn't work is not a successful frontend.

---

# 33. IMPLEMENTATION ORDER

Follow this order.

## Phase 1 — Backend Reconnaissance

Inspect the backend.

Document internally:

```text
Resources
Endpoints
Authentication
Authorization
Validation
Relationships
States
Errors
```

Do not start visual implementation before this is understood.

---

## Phase 2 — Product Model

Determine:

- Who is the user?
- What is the main task?
- What are the important workflows?
- What resources does the user interact with?
- What actions are available?
- What states exist?

---

## Phase 3 — UX Architecture

Define:

```text
Routes
Navigation
Primary workflows
Secondary workflows
Screen hierarchy
Interaction patterns
```

---

## Phase 4 — Visual Direction

Create the design language:

```text
Typography
Colors
Spacing
Radius
Borders
Shadows
Motion
Icons
Components
```

The design should be coherent before building dozens of screens.

---

## Phase 5 — Core Shell

Build:

- Application layout
- Navigation
- Authentication flow if required
- Global loading behavior
- Global error handling
- Responsive shell

---

## Phase 6 — Core Product Workflow

Implement the most important user journey first.

Do not build every secondary screen before the primary workflow works.

---

## Phase 7 — Secondary Features

Implement remaining backend-supported functionality.

---

## Phase 8 — Edge Cases

Test:

- Empty data
- Invalid input
- Failed requests
- Unauthorized requests
- Forbidden actions
- Slow requests
- Network failures
- Large datasets
- Long text
- Mobile layouts
- Keyboard navigation

---

## Phase 9 — Visual Refinement

Only after functionality works:

- Refine spacing
- Typography
- Motion
- Interaction feedback
- Responsive behavior
- Visual hierarchy
- Accessibility

---

## Phase 10 — Final Verification

Verify:

```text
Frontend ↔ Backend contract
Authentication
Authorization
Validation
Error handling
Responsive behavior
Accessibility
Performance
Loading states
Empty states
Interactions
Navigation
```

Remove:

- Dead code
- Fake data
- Debug logs
- Temporary components
- Unused dependencies
- Placeholder content
- Broken interactions

---

# 34. DEVELOPMENT DISCIPLINE

Before implementing anything substantial:

1. Inspect existing code.
2. Understand the architecture.
3. Reuse existing infrastructure where appropriate.
4. Avoid unnecessary rewrites.
5. Keep changes focused.
6. Verify behavior after changes.
7. Do not introduce unrelated refactors.

Do not destroy existing working code simply because you prefer another architecture.

---

# 35. CODE QUALITY

Code should be:

- Readable
- Typed
- Modular
- Maintainable
- Predictable
- Consistent

Prefer simple code over clever code.

Avoid abstractions that require documentation to understand what straightforward code could have done.

---

# 36. NO PLACEHOLDER UI

Do not leave:

```text
Lorem ipsum
Coming soon
Test
Sample text
Fake statistics
Random usernames
Placeholder charts
```

unless explicitly required during development.

Use realistic product-specific content derived from the actual domain.

---

# 37. NO FAKE FEATURES

Never implement UI for a feature merely because:

"every SaaS app has this."

Examples:

- Fake analytics
- Fake notifications
- Fake activity feeds
- Fake AI assistant
- Fake collaboration
- Fake charts
- Fake settings
- Fake integrations

If the backend/product does not support it, do not pretend it exists.

---

# 38. FINAL DESIGN TEST

Before considering the frontend complete, ask:

### Product

Does the UI accurately represent the backend?

### UX

Can a new user understand what to do?

### Interaction

Does the application actually respond to user actions?

### Design

Does it have a recognizable visual identity?

### Originality

Does it feel independently designed rather than copied from another product?

### States

Does it handle failure and empty states?

### Responsive

Does it work on mobile and desktop?

### Accessibility

Can users navigate it without a mouse?

### Engineering

Can another developer understand and maintain it?

### Performance

Does it avoid unnecessary work?

---

# 39. ABSOLUTE RULES

These rules override convenience.

1. Backend first.
2. Never invent backend capabilities.
3. Never fake persistence.
4. Never bypass authorization.
5. Never copy another website.
6. References are allowed; cloning is not.
7. Do not build a generic AI-looking interface.
8. Do not optimize for screenshots over usability.
9. Every major interaction must have meaningful behavior.
10. Every important request must handle loading, success, and failure.
11. Responsive behavior must be intentional.
12. Accessibility is required.
13. Keep business logic separate from presentation.
14. Keep API integration organized.
15. Prefer simple maintainable code.
16. Do not modify backend unless explicitly necessary.
17. Remove temporary development artifacts before completion.
18. The final UI must feel like a real product, not a generated demo.
19. Do not expose secrets, environment variables, tokens, or internal backend implementation details in the frontend.
20. Build something with its own identity.

---

# 40. SUCCESS CRITERIA

The frontend is successful when:

```text
Existing Backend
       ↓
Backend Understanding
       ↓
Product Model
       ↓
UX Architecture
       ↓
Distinctive Design Language
       ↓
Interactive Frontend
       ↓
Real API Integration
       ↓
Complete Application States
       ↓
Responsive + Accessible UI
       ↓
Production-quality Product
```

The goal is not to make the frontend look impressive in a screenshot.

The goal is to make the user forget they are interacting with a frontend and simply feel like they are using a well-designed product.
