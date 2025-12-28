# StuLink Security Action Plan
## Prioritized Fixes for Critical Vulnerabilities

**Priority Levels:**
- 🔴 **CRITICAL**: Fix immediately (security vulnerabilities)
- 🟠 **HIGH**: Fix before production (data integrity)
- 🟡 **MEDIUM**: Fix soon (best practices)
- 🟢 **LOW**: Nice to have (optimization)

---

## Phase 1: Critical Security Fixes (Week 1)

### 🔴 CRITICAL-1: Secure JWT Secret & Environment Variables
**Risk**: Token forgery, unauthorized access, complete system compromise
**Impact**: Attackers can generate valid tokens for any user

**Actions**:
1. Install `dotenv` package
2. Create `.env` file (add to `.gitignore`)
3. Generate strong JWT secret (32+ random characters)
4. Replace hardcoded secret in `server.js`
5. Add environment variable validation on startup

**Implementation**:
```bash
npm install dotenv
```

**Files to modify**:
- `server.js`: Replace `JWT_SECRET` with `process.env.JWT_SECRET`
- Create `.env.example` template
- Create `.env` (local) and `.env.production` (server)

**Code Changes**:
```javascript
// server.js - Add at top
require('dotenv').config();

// Replace line 28
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.error('FATAL: JWT_SECRET not set in environment');
  process.exit(1);
})();
```

**Verification**: 
- ✅ Server fails to start without JWT_SECRET
- ✅ No secrets in code repository
- ✅ Different secrets for dev/prod

---

### 🔴 CRITICAL-2: Financial Logic Security - Balance Manipulation Prevention
**Risk**: Users can manipulate balance through API calls, double-spending, negative balances
**Impact**: Financial fraud, platform bankruptcy

**Vulnerabilities Identified**:
1. No atomic transactions (balance update + transaction record can fail separately)
2. No validation of balance before operations
3. Race conditions in concurrent requests
4. No transaction locking

**Actions**:

#### 2.1 Add Database Transactions (MongoDB Sessions)
```javascript
// server.js - Wrap critical operations in sessions
const session = await mongoose.startSession();
session.startTransaction();

try {
  // Check balance
  const user = await User.findById(userId).session(session);
  if (user.balance < amount) {
    throw new Error('Insufficient balance');
  }
  
  // Update balance
  user.balance -= amount;
  await user.save({ session });
  
  // Create transaction record
  await Transaction.create([{
    userId,
    type: 'pay_job',
    amount: -amount,
    desc: `Job: ${title}`
  }], { session });
  
  await session.commitTransaction();
} catch (error) {
  await session.abortTransaction();
  throw error;
} finally {
  session.endSession();
}
```

#### 2.2 Add Balance Validation Middleware
```javascript
// server.js - Add validation function
async function validateBalance(userId, requiredAmount) {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');
  if (user.balance < requiredAmount) {
    throw new Error('Insufficient balance');
  }
  return user;
}
```

#### 2.3 Fix Job Creation Endpoint
```javascript
// server.js - POST /api/posts (job creation)
app.post('/api/posts', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, cat, price, desc, type } = req.body;
    
    // Validate input
    if (type === 'job' && (!price || price <= 0)) {
      return res.status(400).json({ error: 'Invalid price' });
    }
    
    if (type === 'job') {
      // Reload user with session lock
      const user = await User.findById(req.user._id).session(session);
      
      if (user.balance < price) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      // Atomic update
      user.balance -= price;
      await user.save({ session });
      
      await Transaction.create([{
        userId: user._id,
        type: 'pay_job',
        amount: -price,
        desc: `Создание задания: ${title}`
      }], { session });
    }
    
    const post = new Post({
      title, cat, price, desc, type,
      authorId: req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role
    });
    
    await post.save({ session });
    await session.commitTransaction();
    
    res.json(post);
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});
```

#### 2.4 Fix Approval/Payment Endpoint
```javascript
// server.js - POST /api/posts/:id/approve
app.post('/api/posts/:id/approve', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { rating, review } = req.body;
    
    // Validate rating
    if (!rating || rating < 1 || rating > 5) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Rating must be 1-5' });
    }
    
    const post = await Post.findById(req.params.id).session(session);
    if (!post) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Verify user is the client
    if (post.authorId.toString() !== req.user._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    if (post.status !== 'review') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Post not in review status' });
    }
    
    const isJob = post.type === 'job';
    const workerId = isJob ? post.assigneeId : post.authorId;
    const worker = await User.findById(workerId).session(session);
    
    if (!worker) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Worker not found' });
    }
    
    // Calculate payout (atomic)
    const commission = worker.isPro ? 0 : Math.round(post.price * 0.05);
    const payout = post.price - commission;
    
    worker.balance += payout;
    worker.completedJobs += 1;
    worker.xp += 100;
    if (worker.xp >= worker.level * 1000) worker.level += 1;
    worker.ratingSum += rating;
    worker.ratingCount += 1;
    
    await worker.save({ session });
    
    await Transaction.create([{
      userId: worker._id,
      type: 'earn',
      amount: payout,
      desc: `Оплата: ${post.title} ${commission > 0 ? `(Комиссия: ${commission})` : '(PRO: 0%)'}`
    }], { session });
    
    post.status = 'completed';
    post.clientReview = review;
    post.rating = rating;
    await post.save({ session });
    
    await session.commitTransaction();
    res.json({ success: true, post, worker: sanitizeUser(worker) });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});
```

**Verification**:
- ✅ Test concurrent balance operations (should not allow double-spending)
- ✅ Test insufficient balance scenarios
- ✅ Verify transaction rollback on errors
- ✅ Check balance consistency after operations

---

### 🔴 CRITICAL-3: Input Validation & Sanitization
**Risk**: SQL injection (mitigated by Mongoose), XSS attacks, data corruption
**Impact**: Data integrity, user safety

**Actions**:

#### 3.1 Install Validation Libraries
```bash
npm install express-validator express-validator
npm install validator
```

#### 3.2 Create Validation Middleware
```javascript
// server.js - Add validation functions
const { body, validationResult } = require('express-validator');
const validator = require('validator');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Sanitize user input
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return validator.escape(str.trim());
}
```

#### 3.3 Add Route Validations
```javascript
// Registration validation
app.post('/api/auth/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('role').isIn(['Client', 'Freelancer'])
], validate, async (req, res) => {
  // ... existing code
});

// Post creation validation
app.post('/api/posts', authMiddleware, [
  body('title').trim().isLength({ min: 5, max: 200 }).escape(),
  body('desc').trim().isLength({ min: 10, max: 5000 }).escape(),
  body('cat').isIn(['dev', 'design', 'text', 'study']),
  body('price').isFloat({ min: 0, max: 1000000 }),
  body('type').isIn(['job', 'gig'])
], validate, async (req, res) => {
  // ... existing code with sanitized inputs
  const title = sanitizeInput(req.body.title);
  const desc = sanitizeInput(req.body.desc);
});

// Rating validation
app.post('/api/posts/:id/approve', authMiddleware, [
  body('rating').isInt({ min: 1, max: 5 }),
  body('review').optional().trim().isLength({ max: 1000 }).escape()
], validate, async (req, res) => {
  // ... existing code
});
```

**Verification**:
- ✅ XSS attempts are escaped
- ✅ Invalid inputs are rejected
- ✅ SQL injection attempts fail
- ✅ File paths are validated

---

### 🔴 CRITICAL-4: Chat Security - Authentication & Authorization
**Risk**: Unauthorized message access, message spoofing, user impersonation
**Impact**: Privacy breach, harassment, fraud

**Vulnerabilities Identified**:
1. Socket.io authentication only checks token, not user permissions
2. No message rate limiting
3. No validation of message content
4. Users can send messages to themselves
5. No blocking/reporting mechanism

**Actions**:

#### 4.1 Enhance Socket.io Authentication
```javascript
// server.js - Improve socket authentication
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error: No token'));
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }
    
    // Attach full user object
    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});
```

#### 4.2 Add Message Validation & Rate Limiting
```javascript
// server.js - Add rate limiting map
const messageRateLimit = new Map(); // userId -> { count, resetTime }

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = messageRateLimit.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    messageRateLimit.set(userId, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }
  
  if (userLimit.count >= 30) { // 30 messages per minute
    return false;
  }
  
  userLimit.count++;
  return true;
}

// Enhanced message handler
io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);
  socket.join(socket.userId.toString());
  
  socket.on('SEND_MESSAGE', async (data) => {
    try {
      // Rate limiting
      if (!checkRateLimit(socket.userId)) {
        socket.emit('ERROR', { message: 'Rate limit exceeded. Please wait.' });
        return;
      }
      
      // Validate input
      if (!data.toId || !data.text) {
        socket.emit('ERROR', { message: 'Invalid message data' });
        return;
      }
      
      // Sanitize message
      const text = validator.escape(data.text.trim());
      if (text.length === 0 || text.length > 2000) {
        socket.emit('ERROR', { message: 'Message must be 1-2000 characters' });
        return;
      }
      
      // Prevent self-messaging (optional, remove if needed)
      if (socket.userId === data.toId.toString()) {
        socket.emit('ERROR', { message: 'Cannot send message to yourself' });
        return;
      }
      
      // Verify target user exists
      const targetUser = await User.findById(data.toId);
      if (!targetUser) {
        socket.emit('ERROR', { message: 'Recipient not found' });
        return;
      }
      
      // Save message
      const message = new Message({
        fromId: socket.userId,
        toId: data.toId,
        text: text
      });
      await message.save();
      
      // Emit to both users
      io.to(socket.userId.toString()).emit('RECEIVE_MESSAGE', message);
      io.to(data.toId.toString()).emit('RECEIVE_MESSAGE', message);
      
    } catch (error) {
      console.error('Message error:', error);
      socket.emit('ERROR', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.userId);
  });
});
```

#### 4.3 Secure Message Retrieval Endpoint
```javascript
// server.js - GET /api/messages/:targetId
app.get('/api/messages/:targetId', authMiddleware, async (req, res) => {
  try {
    const targetId = req.params.targetId;
    
    // Validate targetId format
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Verify target user exists
    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Only return messages between current user and target
    const messages = await Message.find({
      $or: [
        { fromId: req.user._id, toId: targetId },
        { fromId: targetId, toId: req.user._id }
      ]
    })
    .sort({ createdAt: 1 })
    .limit(100); // Limit to prevent large responses
    
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Verification**:
- ✅ Users cannot send messages without valid token
- ✅ Rate limiting prevents spam
- ✅ Messages are sanitized
- ✅ Users can only access their own conversations
- ✅ Invalid user IDs are rejected

---

### 🔴 CRITICAL-5: File Upload Security
**Risk**: Malicious file uploads, path traversal, storage exhaustion
**Impact**: Server compromise, data breach

**Actions**:

#### 5.1 Add File Validation
```javascript
// server.js - Enhanced multer configuration
const path = require('path');
const fs = require('fs');

// Allowed file types and sizes
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain'
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Sanitize filename
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50); // Limit length
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${uniq}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('File type not allowed. Allowed: PDF, DOC, DOCX, ZIP, TXT'));
  }
  
  // Check file extension
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.doc', '.docx', '.zip', '.txt'];
  if (!allowedExts.includes(ext)) {
    return cb(new Error('File extension not allowed'));
  }
  
  cb(null, true);
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: fileFilter
});
```

#### 5.2 Secure File Serving
```javascript
// server.js - Secure file serving endpoint
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;
  
  // Validate filename (prevent path traversal)
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  
  const filePath = path.join(__dirname, 'uploads', filename);
  
  // Check if file exists and is within uploads directory
  if (!fs.existsSync(filePath) || !filePath.startsWith(path.join(__dirname, 'uploads'))) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Optional: Add authentication check
  // Only allow access if user is involved in the post
  
  res.sendFile(filePath);
});
```

**Verification**:
- ✅ Only allowed file types are accepted
- ✅ File size limits are enforced
- ✅ Path traversal attempts fail
- ✅ Malicious filenames are sanitized

---

## Phase 2: High Priority Fixes (Week 2)

### 🟠 HIGH-1: CORS Configuration
**Risk**: Unauthorized API access from malicious websites
**Impact**: CSRF attacks, data theft

**Actions**:
```javascript
// server.js - Replace current CORS config
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
```

**Environment Variable**:
```env
CORS_ORIGINS=http://localhost:3000,https://yourdomain.com
```

---

### 🟠 HIGH-2: Rate Limiting
**Risk**: Brute force attacks, DDoS, resource exhaustion
**Impact**: Service unavailability, account compromise

**Actions**:
```bash
npm install express-rate-limit
```

```javascript
// server.js - Add rate limiting
const rateLimit = require('express-rate-limit');

// General API rate limit
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: 'Too many requests, please try again later'
});

// Auth endpoints (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 login attempts per 15 minutes
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true
});

// Apply middleware
app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
```

---

### 🟠 HIGH-3: Password Security
**Risk**: Weak passwords, credential stuffing
**Impact**: Account takeover

**Actions**:
- Already added in CRITICAL-3 (password validation)
- Add password hashing rounds: `bcrypt.hash(password, 12)` (increase from 10)
- Add password history (prevent reuse of last 3 passwords)
- Add account lockout after failed attempts

---

### 🟠 HIGH-4: Error Handling & Logging
**Risk**: Information leakage, no audit trail
**Impact**: Security incidents go undetected

**Actions**:
```bash
npm install winston
```

```javascript
// server.js - Add logging
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?._id
  });
  
  // Don't leak error details in production
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});
```

---

## Phase 3: Medium Priority (Week 3)

### 🟡 MEDIUM-1: Database Indexes
**Performance & Data Integrity**

```javascript
// server.js - Add indexes
// In User model
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ _id: 1, balance: 1 }); // For balance queries

// In Post model
PostSchema.index({ authorId: 1, status: 1 });
PostSchema.index({ assigneeId: 1, status: 1 });
PostSchema.index({ type: 1, status: 1, createdAt: -1 }); // For feed queries

// In Transaction model
TransactionSchema.index({ userId: 1, createdAt: -1 });

// In Message model
MessageSchema.index({ fromId: 1, toId: 1, createdAt: 1 });
```

---

### 🟡 MEDIUM-2: Session Management
**JWT Token Refresh & Logout**

```javascript
// Add token expiration (currently tokens never expire)
const token = jwt.sign(
  { userId: user._id },
  JWT_SECRET,
  { expiresIn: '7d' } // 7 days
);

// Add refresh token endpoint
app.post('/api/auth/refresh', authMiddleware, async (req, res) => {
  const newToken = jwt.sign({ userId: req.user._id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: newToken });
});

// Add logout endpoint (blacklist tokens)
const tokenBlacklist = new Set();
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  tokenBlacklist.add(token);
  res.json({ success: true });
});

// Update auth middleware to check blacklist
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ error: 'Token revoked' });
  }
  // ... existing code
};
```

---

## Implementation Checklist

### Week 1 (Critical)
- [ ] Install `dotenv` and configure environment variables
- [ ] Generate and set strong JWT_SECRET
- [ ] Add MongoDB session transactions to financial operations
- [ ] Implement input validation with express-validator
- [ ] Add file upload validation and sanitization
- [ ] Enhance Socket.io authentication and rate limiting
- [ ] Secure message validation and authorization

### Week 2 (High Priority)
- [ ] Configure CORS with whitelist
- [ ] Add rate limiting middleware
- [ ] Increase password hashing rounds
- [ ] Implement Winston logging
- [ ] Add error handling middleware

### Week 3 (Medium Priority)
- [ ] Add database indexes
- [ ] Implement JWT token expiration
- [ ] Add token refresh endpoint
- [ ] Implement token blacklist for logout

---

## Testing Requirements

### Security Tests
1. **Balance Manipulation**: Attempt concurrent balance operations
2. **Token Forgery**: Try to create tokens with weak secret
3. **XSS Injection**: Test with `<script>` tags in inputs
4. **File Upload**: Try uploading executables, oversized files
5. **Rate Limiting**: Send 100+ requests rapidly
6. **Chat Security**: Try sending messages without auth, to invalid users

### Test Scripts
```bash
# Install test dependencies
npm install --save-dev jest supertest

# Create test files
# tests/security.test.js
# tests/financial.test.js
# tests/chat.test.js
```

---

## Monitoring & Alerts

### Key Metrics to Monitor
1. Failed authentication attempts
2. Rate limit violations
3. Unusual balance changes
4. File upload rejections
5. Chat message rate spikes
6. Database transaction failures

### Recommended Tools
- **Application Monitoring**: PM2 Plus, New Relic
- **Error Tracking**: Sentry
- **Log Aggregation**: Loggly, Papertrail
- **Security Scanning**: Snyk, npm audit

---

## Deployment Checklist

Before deploying to production:
- [ ] All environment variables set
- [ ] JWT_SECRET is strong and unique
- [ ] CORS_ORIGINS configured correctly
- [ ] Database indexes created
- [ ] File upload directory has proper permissions
- [ ] Logging configured and tested
- [ ] Rate limiting tested
- [ ] HTTPS enabled
- [ ] Security headers configured (helmet.js)
- [ ] Backup strategy in place

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Priority**: Critical Security Fixes

