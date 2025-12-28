# Quick Implementation Guide
## Step-by-Step Security Fixes

This guide provides exact code snippets to copy-paste for implementing the security fixes.

---

## Step 1: Setup Environment Variables (5 minutes)

### 1.1 Install dotenv
```bash
npm install dotenv
```

### 1.2 Create .env file
Copy `.env.example` to `.env` and generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 1.3 Update server.js (Top of file)
```javascript
// Add this as the FIRST line
require('dotenv').config();

const express = require('express');
// ... rest of imports

// Replace line 28 (JWT_SECRET)
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.error('FATAL: JWT_SECRET not set in environment');
  process.exit(1);
})();
```

---

## Step 2: Install Security Dependencies (2 minutes)

```bash
npm install express-validator validator express-rate-limit winston
```

---

## Step 3: Add Input Validation (10 minutes)

### 3.1 Add to server.js (after imports)
```javascript
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

// Sanitize function
function sanitizeInput(str) {
  if (typeof str !== 'string') return str;
  return validator.escape(str.trim());
}
```

### 3.2 Update registration endpoint
```javascript
app.post('/api/auth/register', [
  body('name').trim().isLength({ min: 2, max: 50 }).escape(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('role').isIn(['Client', 'Freelancer'])
], validate, async (req, res) => {
  // ... existing code, but use sanitizeInput() for name
  const name = sanitizeInput(req.body.name);
  // ... rest of code
});
```

---

## Step 4: Fix Financial Logic with Transactions (15 minutes)

### 4.1 Update job creation endpoint
Replace the entire `POST /api/posts` endpoint with:

```javascript
app.post('/api/posts', authMiddleware, [
  body('title').trim().isLength({ min: 5, max: 200 }).escape(),
  body('desc').trim().isLength({ min: 10, max: 5000 }).escape(),
  body('cat').isIn(['dev', 'design', 'text', 'study']),
  body('price').isFloat({ min: 0, max: 1000000 }),
  body('type').isIn(['job', 'gig'])
], validate, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { title, cat, price, desc, type } = req.body;
    const sanitizedTitle = sanitizeInput(title);
    const sanitizedDesc = sanitizeInput(desc);

    if (type === 'job' && req.user.role !== 'Client') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Only clients can create jobs' });
    }
    if (type === 'gig' && req.user.role !== 'Freelancer') {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Only freelancers can create gigs' });
    }

    if (type === 'job') {
      // Reload user with session lock
      const user = await User.findById(req.user._id).session(session);
      
      if (user.balance < price) {
        await session.abortTransaction();
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      
      user.balance -= price;
      await user.save({ session });

      await Transaction.create([{
        userId: user._id,
        type: 'pay_job',
        amount: -price,
        desc: `Создание задания: ${sanitizedTitle}`
      }], { session });
    }

    const post = new Post({
      title: sanitizedTitle,
      cat,
      price,
      desc: sanitizedDesc,
      type,
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

### 4.2 Update approval endpoint
Replace the entire `POST /api/posts/:id/approve` endpoint with the code from SECURITY_ACTION_PLAN.md (CRITICAL-2, section 2.4).

---

## Step 5: Secure File Uploads (10 minutes)

### 5.1 Update multer configuration
Replace the multer setup (around line 31-43) with:

```javascript
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
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 50);
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${uniq}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('File type not allowed'));
  }
  
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

Add `fs` import at top:
```javascript
const fs = require('fs');
```

---

## Step 6: Secure Chat (15 minutes)

### 6.1 Add rate limiting map
Add after socket.io setup:
```javascript
const messageRateLimit = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const userLimit = messageRateLimit.get(userId);
  
  if (!userLimit || now > userLimit.resetTime) {
    messageRateLimit.set(userId, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (userLimit.count >= 30) {
    return false;
  }
  
  userLimit.count++;
  return true;
}
```

### 6.2 Update socket authentication
Replace the `io.use()` block (around line 490) with:
```javascript
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
    
    socket.userId = user._id.toString();
    socket.user = user;
    next();
  } catch (error) {
    next(new Error('Authentication error: Invalid token'));
  }
});
```

### 6.3 Update message handler
Replace the `SEND_MESSAGE` handler with code from SECURITY_ACTION_PLAN.md (CRITICAL-4, section 4.2).

---

## Step 7: Add CORS & Rate Limiting (5 minutes)

### 7.1 Update CORS
Replace `app.use(cors());` with:
```javascript
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'];
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

### 7.2 Add rate limiting
Add after CORS:
```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again later',
  skipSuccessfulRequests: true
});

app.use('/api/', apiLimiter);
app.use('/api/auth/', authLimiter);
```

---

## Step 8: Add Logging (5 minutes)

### 8.1 Add Winston setup
Add after imports:
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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
```

### 8.2 Add error handler
Add before `server.listen()`:
```javascript
app.use((err, req, res, next) => {
  logger.error('Error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: req.user?._id
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});
```

---

## Testing Checklist

After implementing, test:

- [ ] Server fails to start without JWT_SECRET
- [ ] Registration rejects weak passwords
- [ ] XSS attempts are escaped in posts
- [ ] File upload rejects .exe files
- [ ] Chat rate limiting works (send 31 messages rapidly)
- [ ] Balance operations are atomic (test concurrent requests)
- [ ] CORS blocks unauthorized origins
- [ ] Rate limiting blocks after 100 requests
- [ ] Logs are written to files

---

## Quick Test Scripts

### Test Balance Atomicity
```javascript
// Run this in browser console (multiple tabs)
for(let i=0; i<10; i++) {
  fetch('http://localhost:3000/api/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer YOUR_TOKEN'
    },
    body: JSON.stringify({
      title: 'Test',
      desc: 'Test description',
      cat: 'dev',
      price: 1000,
      type: 'job'
    })
  });
}
// Check that balance is correct (should be -10000, not -1000 or -20000)
```

### Test XSS Protection
```javascript
// Try to create post with script tag
fetch('http://localhost:3000/api/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN'
  },
  body: JSON.stringify({
    title: '<script>alert("XSS")</script>',
    desc: 'Test',
    cat: 'dev',
    price: 1000,
    type: 'job'
  })
});
// Title should be escaped, not executed
```

---

**Estimated Total Time**: 1-2 hours for all fixes

