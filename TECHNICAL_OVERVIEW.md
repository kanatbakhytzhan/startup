# StuLink - Comprehensive Technical Overview

## Executive Summary

StuLink is a student marketplace platform built with Node.js/Express backend and vanilla JavaScript frontend. It enables students to post jobs (tasks they need help with) and gigs (services they offer), with an integrated escrow system, real-time chat, and reputation management.

---

## 1. Architecture & Tech Stack

### Backend Stack
- **Runtime**: Node.js
- **Framework**: Express.js 4.18.2
- **Database**: MongoDB (via Mongoose 7.6.0)
- **Authentication**: JWT (jsonwebtoken 9.0.2)
- **Password Hashing**: bcryptjs 2.4.3
- **File Upload**: Multer 2.0.2
- **Real-time Communication**: Socket.io 4.7.2
- **CORS**: cors 2.8.5

### Frontend Stack
- **HTML5**: Semantic markup with modern structure
- **CSS3**: Custom properties, flexbox, grid, backdrop-filter effects
- **JavaScript**: Vanilla ES6+ (no frameworks)
- **Icons**: Font Awesome 6.4.0
- **Fonts**: Google Fonts (Inter, Outfit)

### Architecture Pattern
- **Monolithic**: Single Express server handling all API routes
- **Client-Server**: RESTful API + WebSocket for real-time features
- **File Structure**: Flat structure with separation of concerns

---

## 2. File Structure & Purpose

### Core Backend Files

#### `server.js` (557 lines)
**Purpose**: Main backend server file containing all API routes, database models, and business logic.

**Key Responsibilities**:
- Express server setup and middleware configuration
- MongoDB connection via Mongoose
- Mongoose schema definitions (User, Post, Transaction, Message)
- Authentication middleware (JWT verification)
- REST API endpoints for all features
- Socket.io WebSocket server for real-time chat
- File upload handling via Multer

**Port**: 3000 (configurable via `process.env.PORT`)

#### `package.json`
**Purpose**: Dependency management and npm scripts.

**Scripts**:
- `npm start`: Production mode (node server.js)
- `npm run dev`: Development mode with nodemon

---

### Core Frontend Files

#### `index.html` (387 lines)
**Purpose**: Single-page application (SPA) structure with all page sections.

**Key Sections**:
- Navigation bar (guest/user states)
- Home page (landing/hero)
- Feed page (job/gig listings)
- Profile page (user dashboard)
- Create page (post creation form)
- Auth pages (login/register)
- Chat widget (floating component)
- Wallet modal
- Review/Submit modals
- Toast notifications

**External Dependencies**:
- Socket.io client library (CDN)
- Font Awesome icons (CDN)
- Google Fonts

#### `app.js` (1171 lines)
**Purpose**: Frontend application logic and state management.

**Key Responsibilities**:
- Application initialization and routing
- API communication via `API` object
- UI rendering (feed, profile, wallet, chat)
- User authentication flow
- Task workflow management (take, submit, approve)
- Real-time message handling
- Notification system
- Form handling and validation

**State Management**: 
- `app.data` object stores current user, feed type, chat target, notifications
- No external state management library

#### `api.js` (217 lines)
**Purpose**: API client wrapper for backend communication.

**Key Features**:
- Centralized API base URL configuration
- JWT token management (localStorage)
- Socket.io client initialization
- HTTP request wrapper with error handling
- Methods for all backend endpoints

**API Base URL**: `http://localhost:3000/api`

#### `style.css` (822 lines)
**Purpose**: Complete styling for the application.

**Key Features**:
- CSS custom properties (variables) for theming
- Glassmorphism effects (backdrop-filter)
- Responsive design (mobile-first)
- Component-based styling (buttons, cards, modals)
- Animation keyframes
- Dark/light theme support via CSS variables

#### `data.js` (75 lines)
**Purpose**: Legacy data generator (appears unused in current backend mode).

**Note**: This file was used for local storage simulation but is now deprecated as the app uses MongoDB backend.

---

## 3. Data Models (Mongoose Schemas)

### User Schema
```javascript
{
  name: String (required),
  email: String (required, unique),
  password: String (hashed, required),
  role: Enum ['Client', 'Freelancer'] (required),
  
  // Financial
  balance: Number (default: 0),
  
  // Gamification (Freelancer)
  xp: Number (default: 0),
  level: Number (default: 1),
  completedJobs: Number (default: 0),
  
  // Reputation
  ratingSum: Number (default: 0),
  ratingCount: Number (default: 0),
  
  // Status
  isVerified: Boolean (default: false),
  isPro: Boolean (default: false),
  
  // Profile
  bio: String,
  photoUrl: String,
  tg: String (Telegram),
  wa: String (WhatsApp),
  avatar: String,
  
  timestamps: true
}
```

**Relationships**:
- One-to-many with `Post` (as author)
- One-to-many with `Post` (as assignee)
- One-to-many with `Transaction`
- One-to-many with `Message` (as sender/receiver)

---

### Post Schema
```javascript
{
  title: String (required),
  desc: String (required),
  cat: String (required), // Category: dev, design, text, study
  price: Number (required),
  type: Enum ['job', 'gig'] (required),
  
  // Authorship
  authorId: ObjectId (ref: 'User', required),
  authorName: String,
  authorRole: String,
  
  // Assignment
  assigneeId: ObjectId (ref: 'User'),
  assigneeName: String,
  
  // Workflow
  status: Enum ['open', 'in_progress', 'review', 'completed'] (default: 'open'),
  
  // Gig-specific
  parentGigId: ObjectId (ref: 'Post'), // For gig orders
  
  // Completion
  clientReview: String,
  rating: Number,
  isPro: Boolean (default: false), // Inherited from author
  
  // Submission
  submissionFileUrl: String,
  submissionFileName: String,
  submissionAt: Date,
  
  timestamps: true
}
```

**Relationships**:
- Many-to-one with `User` (author)
- Many-to-one with `User` (assignee)
- Self-referential (parentGigId for gig orders)

**Workflow States**:
1. **open**: Available for assignment
2. **in_progress**: Assigned and being worked on
3. **review**: Submitted, awaiting client approval
4. **completed**: Approved and paid

---

### Transaction Schema
```javascript
{
  userId: ObjectId (ref: 'User', required),
  type: Enum ['topup', 'pay_gig', 'pay_job', 'earn', 'withdraw', 'pay_pro'] (required),
  amount: Number (required), // Positive for credits, negative for debits
  desc: String (required),
  timestamps: true
}
```

**Transaction Types**:
- `topup`: Balance deposit
- `pay_gig`: Payment for ordering a gig
- `pay_job`: Escrow freeze when creating a job
- `earn`: Payment received after task completion
- `withdraw`: Balance withdrawal
- `pay_pro`: PRO subscription purchase (990 ₸)

---

### Message Schema
```javascript
{
  fromId: ObjectId (ref: 'User', required),
  toId: ObjectId (ref: 'User', required),
  text: String (required),
  read: Boolean (default: false),
  timestamps: true
}
```

**Relationships**:
- Many-to-one with `User` (sender)
- Many-to-one with `User` (receiver)

---

## 4. Core Business Logic

### 4.1 User Authentication

#### Registration Flow
1. Client sends: `{ name, email, password, role }`
2. Backend validates email uniqueness
3. Password hashed with bcrypt (10 rounds)
4. User document created with default values
5. JWT token generated and returned
6. Token stored in localStorage (`sl_token`)

**Endpoint**: `POST /api/auth/register`

#### Login Flow
1. Client sends: `{ email, password }`
2. Backend finds user by email
3. Password verified via bcrypt.compare()
4. JWT token generated and returned
5. Token stored in localStorage

**Endpoint**: `POST /api/auth/login`

#### Authentication Middleware
- Extracts token from `Authorization: Bearer <token>` header
- Verifies JWT signature with `JWT_SECRET`
- Loads user from database
- Attaches `req.user` for protected routes

**Security Note**: `JWT_SECRET` is hardcoded as `'your-secret-key-change-in-production'` - **CRITICAL SECURITY ISSUE**

---

### 4.2 Task Workflow

#### Job Creation (Client)
1. Client creates job post with price
2. **Escrow**: Price deducted from client balance immediately
3. Transaction recorded: `type: 'pay_job', amount: -price`
4. Post created with `status: 'open'`
5. Funds frozen until completion

**Endpoint**: `POST /api/posts` (type: 'job')

#### Gig Creation (Freelancer)
1. Freelancer creates gig post (no payment required)
2. Post created with `status: 'open'`
3. No funds frozen (gig is a service offering)

**Endpoint**: `POST /api/posts` (type: 'gig')

#### Taking a Job (Freelancer)
1. Freelancer clicks "Take Job"
2. Post `assigneeId` set to freelancer
3. Status changed to `'in_progress'`
4. Funds remain in escrow

**Endpoint**: `POST /api/posts/:id/take`

#### Ordering a Gig (Client)
1. Client clicks "Order Gig"
2. **Escrow**: Price deducted from client balance
3. Transaction recorded: `type: 'pay_gig', amount: -price`
4. New order post created (child of original gig)
5. Order post has `status: 'in_progress'`, `parentGigId` set
6. Funds frozen until completion

**Endpoint**: `POST /api/posts/:id/take` (for gigs)

#### Submission (Worker)
1. Worker submits work via file upload
2. Multer saves file to `uploads/` directory
3. Post updated:
   - `status: 'review'`
   - `submissionFileUrl: '/uploads/filename'`
   - `submissionFileName: originalname`
   - `submissionAt: Date`
4. Client notified (via notifications)

**Endpoint**: `POST /api/posts/:id/submit` (multipart/form-data)

#### Approval & Payment (Client)
1. Client reviews submission and rates (1-5 stars)
2. Backend calculates commission:
   - **PRO users**: 0% commission
   - **Regular users**: 5% commission
3. Payout calculation:
   ```javascript
   commission = worker.isPro ? 0 : Math.round(price * 0.05)
   payout = price - commission
   ```
4. Worker balance increased by `payout`
5. Worker stats updated:
   - `completedJobs += 1`
   - `xp += 100`
   - Level up if `xp >= level * 1000`
   - `ratingSum += rating`
   - `ratingCount += 1`
6. Transaction recorded: `type: 'earn', amount: payout`
7. Post status set to `'completed'`
8. Review and rating saved to post

**Endpoint**: `POST /api/posts/:id/approve`

**Commission Logic**:
- Regular freelancer: 5% commission (e.g., 5000 ₸ → 250 ₸ commission → 4750 ₸ payout)
- PRO freelancer: 0% commission (e.g., 5000 ₸ → 5000 ₸ payout)

---

### 4.3 Escrow & Finance

#### Escrow Mechanism
- **Job Creation**: Funds frozen when job is created
- **Gig Ordering**: Funds frozen when gig is ordered
- **Release**: Funds released to worker upon approval
- **No Refund Logic**: Currently no cancellation/refund mechanism

#### Balance Operations

**Top-up**:
- Client adds funds to balance
- Transaction: `type: 'topup', amount: positive`

**Withdrawal**:
- User withdraws funds (no external payment gateway)
- Transaction: `type: 'withdraw', amount: negative`
- **Note**: No actual bank integration - just balance reduction

**PRO Purchase**:
- Cost: 990 ₸
- One-time purchase, permanent status
- Transaction: `type: 'pay_pro', amount: -990`

**Endpoints**:
- `POST /api/wallet/topup`
- `POST /api/wallet/withdraw`
- `GET /api/wallet/transactions`

---

### 4.4 Reputation System

#### Rating Calculation
- Average rating: `ratingSum / ratingCount`
- Ratings stored per user (cumulative)
- Displayed as: `⭐ ${average.toFixed(1)}` or `'New'` if no ratings

#### XP & Leveling (Freelancers Only)
- **XP Gain**: +100 XP per completed job
- **Level Up**: When `xp >= level * 1000`
- **Level Formula**: `level = Math.floor(xp / 1000) + 1`
- **Display**: Progress bar showing XP toward next level

#### PRO Status Benefits
- **0% Commission**: No platform fee on earnings
- **Badge Display**: "PRO" indicator in profile
- **Cost**: 990 ₸ one-time

---

### 4.5 Real-time Chat

#### WebSocket Architecture
- **Server**: Socket.io on Express HTTP server
- **Client**: Socket.io client library (CDN)
- **Authentication**: JWT token in `socket.handshake.auth.token`

#### Connection Flow
1. Client connects with JWT token
2. Server verifies token and extracts `userId`
3. Socket joins room: `socket.userId.toString()`
4. Client can send/receive messages

#### Message Flow
1. Client emits: `SEND_MESSAGE` with `{ toId, text }`
2. Server saves message to MongoDB
3. Server emits `RECEIVE_MESSAGE` to:
   - Sender (echo)
   - Receiver (if online)
4. Frontend displays message in chat widget

#### Message Retrieval
- REST endpoint: `GET /api/messages/:targetId`
- Returns all messages between current user and target
- Sorted by `createdAt` ascending

**Endpoints**:
- WebSocket: `SEND_MESSAGE` event
- REST: `GET /api/messages/:targetId`

---

## 5. API Endpoints

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login user |

### Users
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/users/me` | Yes | Get current user profile |
| PUT | `/api/users/me` | Yes | Update profile (bio, photoUrl, tg, wa) |
| POST | `/api/users/pro/buy` | Yes | Purchase PRO status (990 ₸) |

### Posts
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/posts` | Yes | Create job or gig |
| GET | `/api/posts?type=job\|gig` | Yes | Get posts (filtered by type) |
| POST | `/api/posts/:id/take` | Yes | Take job or order gig |
| POST | `/api/posts/:id/submit` | Yes | Submit work (with file upload) |
| POST | `/api/posts/:id/approve` | Yes | Approve and pay worker |

### Wallet
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/wallet/topup` | Yes | Add funds to balance |
| POST | `/api/wallet/withdraw` | Yes | Withdraw funds |
| GET | `/api/wallet/transactions` | Yes | Get transaction history |

### Messages
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/messages/:targetId` | Yes | Get chat history with user |

### Static Files
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/uploads/*` | No | Serve uploaded files |

---

## 6. Current Project State

### Code Quality Assessment

#### Strengths ✅
1. **Clear Separation**: Backend and frontend are well-separated
2. **RESTful Design**: API endpoints follow REST conventions
3. **Real-time Features**: WebSocket implementation for chat
4. **File Upload**: Proper multipart/form-data handling
5. **Error Handling**: Try-catch blocks in most async operations
6. **Modern UI**: Glassmorphism, responsive design, animations

#### Critical Issues 🚨

1. **Security Vulnerabilities**:
   - **Hardcoded JWT Secret**: `JWT_SECRET = 'your-secret-key-change-in-production'`
   - **No Environment Variables**: Sensitive configs in code
   - **CORS Wide Open**: `cors({ origin: "*" })` allows all origins
   - **No Input Validation**: Missing validation middleware (express-validator)
   - **No Rate Limiting**: Vulnerable to brute force attacks
   - **Password Requirements**: No minimum length/complexity rules

2. **Database Issues**:
   - **No Connection Error Handling**: MongoDB connection failures not handled
   - **No Indexes**: Missing indexes on frequently queried fields (email, userId)
   - **No Transactions**: Multi-step operations not atomic (e.g., balance update + transaction creation)

3. **Business Logic Gaps**:
   - **No Refund System**: Cannot cancel tasks or refund escrow
   - **No Dispute Resolution**: No mechanism for conflicts
   - **No Task Cancellation**: Once in progress, cannot cancel
   - **No Deadline System**: Tasks have no time limits
   - **No File Validation**: Uploaded files not validated (type, size)

4. **Error Handling**:
   - **Generic Error Messages**: User-facing errors may leak internal details
   - **No Logging**: No structured logging system (Winston, Pino)
   - **No Error Tracking**: No Sentry or similar service

5. **Code Organization**:
   - **Monolithic server.js**: 557 lines, should be split into routes/models/middleware
   - **No Controllers**: Business logic mixed with route handlers
   - **No Services**: No service layer for complex operations
   - **Hardcoded URLs**: `http://localhost:3000` hardcoded in frontend

6. **Frontend Issues**:
   - **No Build Process**: No bundling, minification, or transpilation
   - **Global Variables**: Heavy reliance on `window.app` and `window.API`
   - **No State Management**: Manual state updates, prone to bugs
   - **Mixed Concerns**: UI logic mixed with business logic

7. **Testing**:
   - **No Tests**: Zero unit, integration, or E2E tests
   - **No Test Coverage**: Cannot verify functionality changes

8. **Documentation**:
   - **No API Documentation**: No Swagger/OpenAPI spec
   - **No README**: Missing setup instructions
   - **No Code Comments**: Minimal inline documentation

---

### Missing Features for Production

#### Essential Features
1. **Email Verification**: Users should verify email addresses
2. **Password Reset**: Forgot password functionality
3. **Profile Pictures**: Upload instead of URL input
4. **Search & Filters**: Advanced search (price range, category, rating)
5. **Pagination**: Limit posts per page (currently loads all)
6. **Notifications**: Real-time notifications for task updates
7. **Admin Panel**: Dashboard for platform management
8. **Analytics**: User activity, revenue tracking

#### Security Features
1. **HTTPS**: SSL/TLS encryption
2. **CSRF Protection**: CSRF tokens for forms
3. **XSS Protection**: Input sanitization
4. **SQL Injection Prevention**: Already using Mongoose (parameterized queries)
5. **File Upload Security**: Validate file types, scan for malware
6. **Session Management**: Token refresh, logout all devices

#### Payment Integration
1. **Real Payment Gateway**: Integrate Stripe/PayPal for top-ups
2. **Withdrawal Processing**: Actual bank transfers
3. **Payment History**: Detailed transaction logs
4. **Invoice Generation**: Receipts for transactions

#### User Experience
1. **Mobile App**: React Native or PWA
2. **Push Notifications**: Browser push API
3. **Dark Mode**: Theme toggle
4. **Internationalization**: Multi-language support
5. **Accessibility**: ARIA labels, keyboard navigation

---

### Recommended Improvements

#### Immediate (Pre-Launch)
1. **Environment Variables**: Use `dotenv` for secrets
2. **Input Validation**: Add `express-validator`
3. **Error Handling Middleware**: Centralized error handler
4. **Logging**: Add Winston or Pino
5. **Rate Limiting**: Add `express-rate-limit`
6. **CORS Configuration**: Restrict to specific origins
7. **File Upload Validation**: Type and size limits
8. **Database Indexes**: Add indexes on email, userId, postId

#### Short-term (Post-Launch)
1. **Refactor server.js**: Split into routes, controllers, services
2. **Add Tests**: Jest for unit tests, Supertest for API tests
3. **API Documentation**: Swagger/OpenAPI
4. **Monitoring**: Add health check endpoint
5. **Caching**: Redis for frequently accessed data
6. **Background Jobs**: Bull or similar for async tasks

#### Long-term (Scale)
1. **Microservices**: Split chat, payments, notifications
2. **Message Queue**: RabbitMQ/Kafka for event-driven architecture
3. **CDN**: Serve static assets via CDN
4. **Database Sharding**: Scale MongoDB horizontally
5. **Load Balancing**: Multiple server instances

---

## 7. Deployment Considerations

### Current Setup
- **Development**: `npm run dev` (nodemon)
- **Production**: `npm start` (node)
- **Database**: Local MongoDB (`mongodb://localhost:27017/stulink`)

### Production Requirements
1. **Environment**: Node.js 18+ recommended
2. **Database**: MongoDB Atlas or self-hosted MongoDB
3. **File Storage**: Consider cloud storage (AWS S3, Cloudinary) instead of local `uploads/`
4. **Process Manager**: PM2 or systemd for process management
5. **Reverse Proxy**: Nginx for static files and SSL termination
6. **SSL Certificate**: Let's Encrypt for HTTPS

### Environment Variables Needed
```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://...
JWT_SECRET=<strong-random-secret>
CORS_ORIGIN=https://yourdomain.com
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,doc,docx,zip
```

---

## 8. Conclusion

StuLink is a **functional MVP** with core features implemented, but requires significant security and architectural improvements before production deployment. The codebase demonstrates good understanding of full-stack development but needs:

1. **Security hardening** (critical)
2. **Code organization** (refactoring)
3. **Testing infrastructure** (quality assurance)
4. **Production features** (user experience)

**Estimated Time to Production-Ready**: 2-3 months with focused development effort.

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Author**: Technical Analysis

