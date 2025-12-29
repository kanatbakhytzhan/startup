require('dotenv').config();

const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const helmet    = require('helmet');
const compression = require('compression');

const path   = require('path');
const multer = require('multer');

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// ---------- MIDDLEWARE (STRICT ORDER) ----------

// 1. CORS - MUST BE FIRST (allow all origins for Vercel)
app.use(cors({
  origin: '*', // Allow all origins for Vercel deployment
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// 2. Body Parsing - MUST BE BEFORE ROUTES
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. Security & Compression
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development (enable in production)
  crossOriginEmbedderPolicy: false
}));
app.use(compression());

// 4. Debug Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PUT') {
    console.log('Request Body:', JSON.stringify(req.body, null, 2));
    console.log('Content-Type:', req.get('Content-Type'));
  }
  next();
});

// ---------- MONGODB ----------
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stulink';

// DEBUG: Log DB connection info on startup
console.log('🔍 Server startup debug:');
console.log('  DB URI length:', process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 'undefined');
console.log('  DB URI exists:', !!process.env.MONGODB_URI);
console.log('  Using MONGODB_URI:', MONGODB_URI.substring(0, 20) + '...');

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('✅ Connected to MongoDB');
}).catch((err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ---------- MULTER (UPLOADS) ----------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext  = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const uniq = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${uniq}${ext}`);
  }
});

const upload = multer({ storage });

// отдаём файлы по /uploads/...
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==================== MODELS ====================

const UserSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['Client', 'Freelancer', 'Admin'], required: true },

  balance: { type: Number, default: 0 },
  xp:       { type: Number, default: 0 },
  level:    { type: Number, default: 1 },
  completedJobs: { type: Number, default: 0 },

  ratingSum:   { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },

  isVerified: { type: Boolean, default: false },
  isPro:      { type: Boolean, default: false },
  isBanned:   { type: Boolean, default: false },
  bannedAt:   { type: Date },
  bannedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  banReason:  { type: String },

  bio:      { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  tg:       { type: String, default: '' },
  wa:       { type: String, default: '' },
  avatar:   { type: String },
  openForWork: { type: Boolean, default: true }, // Work status toggle
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }] // Saved posts (favorites)
}, { timestamps: true });

const PostSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Please add a title'],
    trim: true,
    validate: {
      validator: function(v) {
        return v && v.trim().length > 0;
      },
      message: 'Title cannot be empty or whitespace only'
    }
  },
  desc:  { 
    type: String, 
    required: [true, 'Please add a description'],
    trim: true,
    validate: {
      validator: function(v) {
        return v && v.trim().length > 0;
      },
      message: 'Description cannot be empty or whitespace only'
    }
  },
  cat:   { type: String, required: true },
  price: { type: Number, required: true },
  type:  { type: String, enum: ['job', 'gig'], required: true },

  authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  authorRole: String,

  assigneeId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigneeName: String,

  status: { type: String, enum: ['open', 'in_progress', 'review', 'completed', 'cancelled'], default: 'open' },

  parentGigId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  clientReview: String,
  rating: Number,
  isPro: { type: Boolean, default: false },

  // файл, который прикрепляет исполнитель при сдаче
  submissionFileUrl:  String,
  submissionFileName: String,
  submissionAt:       Date,

  // Cancellation fields
  cancellationRequested: { type: Boolean, default: false },
  cancellationRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancellationReason: { type: String },
  cancellationStatus: { 
    type: String, 
    enum: ['none', 'pending', 'approved', 'rejected', 'disputed'],
    default: 'none'
  },
  cancelledAt: { type: Date },
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Dispute fields
  disputeOpened: { type: Boolean, default: false },
  disputeOpenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  disputeReason: { type: String },
  disputeStatus: {
    type: String,
    enum: ['none', 'open', 'under_review', 'resolved', 'rejected'],
    default: 'none'
  },
  disputeResolution: { type: String },
  disputeResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  disputeResolvedAt: { type: Date }
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, enum: ['topup', 'pay_gig', 'pay_job', 'earn', 'withdraw', 'pay_pro', 'refund', 'commission_earn'], required: true },
  amount: { type: Number, required: true },
  desc:   { type: String, required: true }
}, { timestamps: true });

const MessageSchema = new mongoose.Schema({
  fromId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  toId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text:   { type: String, required: true },
  read:   { type: Boolean, default: false }
}, { timestamps: true });

const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['task_assigned', 'task_submitted', 'task_approved', 'task_cancelled', 
           'message_received', 'payment_received', 'review_received', 'system',
           'cancellation_requested', 'cancellation_approved', 'dispute_opened'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // Post ID, Message ID, etc.
  relatedType: { type: String }, // 'post', 'message', 'transaction', 'dispute'
  read: { type: Boolean, default: false },
  actionUrl: { type: String }, // e.g., '/feed#post-123' or '/chat/user-456'
  metadata: { type: mongoose.Schema.Types.Mixed } // Additional data
}, { timestamps: true });

const DisputeSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  openedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  against: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ['open', 'under_review', 'resolved', 'rejected'],
    default: 'open'
  },
  resolution: { type: String },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: { type: Date },
  attachments: [{ type: String }] // Screenshot URLs, etc.
}, { timestamps: true });

const User        = mongoose.model('User', UserSchema);
const Post        = mongoose.model('Post', PostSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);
const Message     = mongoose.model('Message', MessageSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Dispute     = mongoose.model('Dispute', DisputeSchema);

// ==================== DATABASE INDEXES ====================

// User indexes
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ openForWork: 1 });

// Post indexes for performance
PostSchema.index({ authorId: 1 });
PostSchema.index({ type: 1 });
PostSchema.index({ status: 1 });
PostSchema.index({ type: 1, status: 1 }); // Compound index for common queries
PostSchema.index({ authorId: 1, status: 1 });
PostSchema.index({ assigneeId: 1, status: 1 });
PostSchema.index({ cat: 1 }); // Category filter
PostSchema.index({ price: 1 }); // Price sorting
PostSchema.index({ createdAt: -1 }); // Default sorting

// Notification indexes for better query performance
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });

// Dispute indexes
DisputeSchema.index({ postId: 1 });
DisputeSchema.index({ openedBy: 1, status: 1 });
DisputeSchema.index({ against: 1, status: 1 });

// Post indexes for cancellation queries
PostSchema.index({ cancellationStatus: 1, cancellationRequested: 1 });
PostSchema.index({ disputeStatus: 1, disputeOpened: 1 });

// Transaction indexes
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1 });

// ==================== NOTIFICATION HELPER ====================

/**
 * Create and send notification to user
 * @param {String} userId - User ID to notify
 * @param {String} type - Notification type
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 * @param {String} relatedId - Related entity ID (post, message, etc.)
 * @param {String} relatedType - Type of related entity ('post', 'message', etc.)
 * @param {String} actionUrl - URL to navigate when clicked
 * @param {Object} metadata - Additional data
 */
async function createNotification(userId, type, title, message, relatedId = null, relatedType = null, actionUrl = null, metadata = null) {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      relatedId,
      relatedType,
      actionUrl,
      metadata,
      read: false
    });
    
    await notification.save();
    
    // Emit via WebSocket if user is online
    io.to(userId.toString()).emit('NEW_NOTIFICATION', notification);
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
}

// ==================== CANCELLATION & REFUND LOGIC ====================

/**
 * Process task cancellation and refund
 * @param {Object} post - Post document
 * @param {Object} session - MongoDB session for transaction
 * @param {Number} refundPercentage - Percentage to refund (0-100)
 */
async function processCancellation(post, session, refundPercentage = 100) {
  try {
    const refundAmount = Math.round(post.price * (refundPercentage / 100));
    
    // Refund to client
    const client = await User.findById(post.authorId).session(session);
    if (client) {
      client.balance += refundAmount;
      await client.save({ session });
      
      // Record transaction
      await Transaction.create([{
        userId: client._id,
        type: 'refund',
        amount: refundAmount,
        desc: `Возврат за отмену: ${post.title} (${refundPercentage}%)`
      }], { session });
    }
    
    // Update post status
    post.status = 'cancelled';
    post.cancellationStatus = 'approved';
    post.cancelledAt = new Date();
    post.cancelledBy = post.cancellationRequestedBy;
    await post.save({ session });
    
    // Notify both parties
    if (client) {
      await createNotification(
        post.authorId,
        'task_cancelled',
        'Задача отменена',
        `Задача "${post.title}" отменена. Возврат: ${refundAmount} ₸`,
        post._id,
        'post',
        `/feed#post-${post._id}`
      );
    }
    
    if (post.assigneeId) {
      await createNotification(
        post.assigneeId,
        'task_cancelled',
        'Задача отменена',
        `Задача "${post.title}" отменена клиентом`,
        post._id,
        'post',
        `/feed#post-${post._id}`
      );
    }
    
    return { success: true, refundAmount };
  } catch (error) {
    console.error('Error processing cancellation:', error);
    throw error;
  }
}

// ==================== AUTH MIDDLEWARE ====================

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check if user is banned
    if (user.isBanned) {
      return res.status(403).json({ error: 'Your account has been suspended', banned: true });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Optional auth middleware - sets req.user if token is valid, but doesn't require it
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId);
        if (user && !user.isBanned) {
          req.user = user;
        }
      } catch (error) {
        // Invalid token, but continue as guest
        req.user = null;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// Admin-only middleware
const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ==================== DEBUG ROUTES (TEMPORARY) ====================
const debugRoutes = require('./routes/debugRoutes');
app.use('/api/debug', debugRoutes);

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register', async (req, res) => {
  try {
    console.log('=== REGISTER REQUEST ===');
    console.log('Register Body:', req.body);
    console.log('Content-Type:', req.get('Content-Type'));
    
    const { name, email, password, role } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      console.log('❌ Missing fields');
      return res.status(400).json({ 
        message: 'Missing fields',
        error: 'Name, email, password, and role are required' 
      });
    }

    console.log('✅ Fields present, checking if user exists');
    const exists = await User.findOne({ email });
    if (exists) {
      console.log('❌ Email already registered:', email);
      return res.status(400).json({ 
        message: 'Email already registered',
        error: 'Email already registered' 
      });
    }

    console.log('✅ Email available, creating user');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      avatar: name[0]
    });

    await user.save();
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);

    console.log('✅ Registration successful for:', email);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('❌ Register error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    // CRITICAL: Debug logging at the very start
    console.log('=== LOGIN REQUEST ===');
    console.log('Login attempt body:', req.body);
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    const { email, password } = req.body;

    // CRITICAL: Validate required fields
    if (!email || !password) {
      console.log('❌ Missing fields - email:', !!email, 'password:', !!password);
      return res.status(400).json({ 
        message: 'Missing fields',
        error: 'Email and password are required',
        received: { email: !!email, password: !!password }
      });
    }

    console.log('✅ Fields present, searching for user:', email);
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found:', email);
      return res.status(400).json({ 
        message: 'User not found',
        error: 'Invalid email or password' 
      });
    }

    console.log('✅ User found, validating password');
    const valid = await bcrypt.compare(password, user.password);
    
    if (!valid) {
      console.log('❌ Invalid password');
      return res.status(400).json({ 
        message: 'Invalid credentials',
        error: 'Invalid email or password' 
      });
    }

    console.log('✅ Password valid, generating token');
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    
    console.log('✅ Login successful for:', email);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

// ==================== USER ROUTES ====================

app.get('/api/users/me', authMiddleware, async (req, res) => {
  res.json(sanitizeUser(req.user));
});

app.put('/api/users/me', authMiddleware, async (req, res) => {
  try {
    const { bio, photoUrl, tg, wa, openForWork } = req.body;

    req.user.bio      = bio      ?? req.user.bio;
    req.user.photoUrl = photoUrl ?? req.user.photoUrl;
    req.user.tg       = tg       ?? req.user.tg;
    req.user.wa       = wa       ?? req.user.wa;
    if (typeof openForWork === 'boolean') {
      req.user.openForWork = openForWork;
    }

    await req.user.save();
    res.json(sanitizeUser(req.user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/pro/buy', authMiddleware, async (req, res) => {
  try {
    if (req.user.isPro)         return res.status(400).json({ error: 'Already PRO' });
    if (req.user.balance < 990) return res.status(400).json({ error: 'Insufficient balance' });

    req.user.balance -= 990;
    req.user.isPro = true;
    await req.user.save();

    await new Transaction({
      userId: req.user._id,
      type:   'pay_pro',
      amount: -990,
      desc:   'Покупка PRO статуса'
    }).save();

    res.json({ success: true, user: sanitizeUser(req.user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get public user profile (no auth required, but safe data only)
app.get('/api/users/:id/public', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Get reviews for this user (from completed posts where they were the worker)
    const reviews = await Post.find({
      status: 'completed',
      $or: [
        { assigneeId: user._id, type: 'job' }, // Freelancer who completed a job
        { authorId: user._id, type: 'gig' }    // Freelancer who completed a gig
      ],
      rating: { $exists: true, $ne: null },
      clientReview: { $exists: true, $ne: '' }
    })
      .select('title rating clientReview authorName assigneeName createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Calculate average rating
    const avgRating = user.ratingCount > 0 
      ? (user.ratingSum / user.ratingCount).toFixed(1) 
      : 0;

    // Return safe public data only
    res.json({
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      photoUrl: user.photoUrl,
      bio: user.bio,
      role: user.role,
      isPro: user.isPro,
      isVerified: user.isVerified,
      openForWork: user.openForWork,
      completedJobs: user.completedJobs,
      level: user.level,
      xp: user.xp,
      rating: parseFloat(avgRating),
      ratingCount: user.ratingCount,
      createdAt: user.createdAt,
      reviews: reviews.map(r => ({
        title: r.title,
        rating: r.rating,
        review: r.clientReview,
        reviewerName: r.type === 'job' ? r.authorName : r.assigneeName,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== POST ROUTES ====================

app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { title, cat, price, desc, type } = req.body;

    // CRITICAL: Validate required fields at the very beginning
    if (!title || !desc || title.trim() === '' || desc.trim() === '') {
      return res.status(400).json({ 
        message: 'Title and description are required',
        error: 'Title and description cannot be empty' 
      });
    }

    if (type === 'job' && req.user.role !== 'Client') {
      return res.status(403).json({ error: 'Only clients can create jobs' });
    }
    if (type === 'gig' && req.user.role !== 'Freelancer') {
      return res.status(403).json({ error: 'Only freelancers can create gigs' });
    }

    if (type === 'job') {
      if (req.user.balance < price) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      req.user.balance -= price;
      await req.user.save();

      await new Transaction({
        userId: req.user._id,
        type:   'pay_job',
        amount: -price,
        desc:   `Создание задания: ${title}`
      }).save();
    }

    // Trim and validate before creating post
    const trimmedTitle = title ? title.trim() : '';
    const trimmedDesc = desc ? desc.trim() : '';

    if (!trimmedTitle || !trimmedDesc) {
      return res.status(400).json({ 
        message: 'Title and description are required',
        error: 'Title and description cannot be empty' 
      });
    }

    const post = new Post({
      title: trimmedTitle,
      cat,
      price,
      desc: trimmedDesc,
      type,
      authorId:   req.user._id,
      authorName: req.user.name,
      authorRole: req.user.role
    });

    await post.save();
    res.json(post);
  } catch (error) {
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message).join(', ');
      return res.status(400).json({ 
        message: 'Validation failed',
        error: messages 
      });
    }
    console.error('Post creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUBLIC ROUTE: Get all posts (NO AUTH REQUIRED)
app.get('/api/posts', async (req, res) => {
  try {
    console.log('=== GET /api/posts (PUBLIC) ===');
    console.log('Query params:', req.query);
    
    const { 
      type, 
      page = 1, 
      limit = 10,
      cat, // Category filter
      minPrice,
      maxPrice,
      sortBy = 'createdAt', // createdAt, price
      sortOrder = 'desc' // asc, desc
    } = req.query;

    // Build query - PUBLIC: show only open posts with valid titles (anyone can view)
    const query = {
      status: 'open',
      title: { 
        $exists: true, 
        $ne: null, 
        $ne: '',
        $not: { $regex: /^\s*$/ } // Not just whitespace
      },
      desc: { 
        $exists: true, 
        $ne: null, 
        $ne: '',
        $not: { $regex: /^\s*$/ } // Not just whitespace
      }
    };

    if (type) query.type = type;
    if (cat) query.cat = cat;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseInt(minPrice);
      if (maxPrice) query.price.$lte = parseInt(maxPrice);
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Execute query with pagination
    const [posts, total] = await Promise.all([
      Post.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Post.countDocuments(query)
    ]);

    console.log(`✅ Returning ${posts.length} posts (total: ${total})`);
    res.json({
      posts,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    console.error('❌ Get posts error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: error.message 
    });
  }
});

app.post('/api/posts/:id/take', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (post.type === 'job') {
      if (req.user.role !== 'Freelancer') {
        return res.status(403).json({ error: 'Only freelancers can take jobs' });
      }

      post.status       = 'in_progress';
      post.assigneeId   = req.user._id;
      post.assigneeName = req.user.name;
      await post.save();

      // Notify client that task was taken
      await createNotification(
        post.authorId,
        'task_assigned',
        'Заказ взят',
        `${req.user.name} взял ваш заказ "${post.title}"`,
        post._id,
        'post',
        `/feed#post-${post._id}`
      );

      // Notify freelancer
      await createNotification(
        req.user._id,
        'task_assigned',
        'Вы взяли заказ',
        `Вы взяли заказ "${post.title}" от ${post.authorName}`,
        post._id,
        'post',
        `/feed#post-${post._id}`
      );

      res.json(post);
    } else {
      if (req.user.role !== 'Client') {
        return res.status(403).json({ error: 'Only clients can order gigs' });
      }

      if (req.user.balance < post.price) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      req.user.balance -= post.price;
      await req.user.save();

      await new Transaction({
        userId: req.user._id,
        type:   'pay_gig',
        amount: -post.price,
        desc:   `Заказ услуги: ${post.title}`
      }).save();

      const order = new Post({
        title: post.title,
        cat:   post.cat,
        price: post.price,
        desc:  post.desc,
        type:  'gig',

        authorId:   post.authorId,
        authorName: post.authorName,
        authorRole: post.authorRole,

        assigneeId:   req.user._id,
        assigneeName: req.user.name,

        status:      'in_progress',
        parentGigId: post._id,
        isPro:       post.isPro
      });

      await order.save();

      // Notify freelancer that gig was ordered
      await createNotification(
        post.authorId,
        'task_assigned',
        'Новый заказ услуги',
        `${req.user.name} заказал вашу услугу "${post.title}"`,
        order._id,
        'post',
        `/feed#post-${order._id}`
      );

      // Notify client
      await createNotification(
        req.user._id,
        'task_assigned',
        'Услуга заказана',
        `Вы заказали услугу "${post.title}" от ${post.authorName}`,
        order._id,
        'post',
        `/feed#post-${order._id}`
      );

      res.json(order);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// === СДАТЬ РАБОТУ С ФАЙЛОМ ===
app.post(
  '/api/posts/:id/submit',
  authMiddleware,
  upload.single('file'),       // ожидаем поле "file" в FormData
  async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // проверим, что текущий пользователь — исполнитель
      const isJob     = post.type === 'job';
      const workerId  = isJob ? post.assigneeId : post.authorId;
      if (!workerId || workerId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ error: 'You are not the worker for this task' });
      }

      post.status = 'review';

      if (req.file) {
        post.submissionFileUrl  = `/uploads/${req.file.filename}`;
        post.submissionFileName = req.file.originalname;
        post.submissionAt       = new Date();
      }

      await post.save();

      // Notify client that work was submitted
      const clientId = isJob ? post.authorId : post.assigneeId;
      await createNotification(
        clientId,
        'task_submitted',
        'Работа отправлена',
        `Исполнитель отправил работу для "${post.title}"`,
        post._id,
        'post',
        `/feed#post-${post._id}`
      );

      res.json(post);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Submit error' });
    }
  }
);

app.post('/api/posts/:id/approve', authMiddleware, async (req, res) => {
  try {
    const { rating, review } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isJob   = post.type === 'job';
    const workerId = isJob ? post.assigneeId : post.authorId;
    const worker   = await User.findById(workerId);

    if (!worker) return res.status(404).json({ error: 'Worker not found' });

    // Calculate commission: 0% for PRO, 5% for non-PRO
    const commission = worker.isPro ? 0 : Math.round(post.price * 0.05);
    const payout     = post.price - commission;

    // Transfer payout to worker
    worker.balance       += payout;
    worker.completedJobs += 1;
    worker.xp            += 100;
    if (worker.xp >= worker.level * 1000) worker.level += 1;

    worker.ratingSum   += rating;
    worker.ratingCount += 1;
    await worker.save();

    // Create transaction for worker
    const commText = commission > 0 ? `(Комиссия: ${commission})` : '(PRO: 0%)';
    await new Transaction({
      userId: worker._id,
      type:   'earn',
      amount: payout,
      desc:   `Оплата: ${post.title} ${commText}`
    }).save();

    // Transfer commission to Admin if commission > 0
    if (commission > 0) {
      const admin = await User.findOne({ role: 'Admin' });
      if (admin) {
        admin.balance += commission;
        await admin.save();

        // Create commission transaction for Admin
        await new Transaction({
          userId: admin._id,
          type:   'commission_earn',
          amount: commission,
          desc:   `Commission from Task: ${post.title} by ${worker.name}`
        }).save();
      }
    }

    post.status       = 'completed';
    post.clientReview = review;
    post.rating       = rating;
    await post.save();

    // Notify worker about payment
    await createNotification(
      workerId,
      'payment_received',
      'Оплата получена',
      `Вы получили ${payout} ₸ за "${post.title}"`,
      post._id,
      'post',
      `/feed#post-${post._id}`,
      { amount: payout, commission }
    );

    // Notify worker about review
    await createNotification(
      workerId,
      'review_received',
      'Новый отзыв',
      `Клиент оставил отзыв: ${rating}⭐`,
      post._id,
      'post',
      `/feed#post-${post._id}`,
      { rating, review }
    );

    res.json({ success: true, post, worker: sanitizeUser(worker) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SAVED POSTS (FAVORITES) ====================

// Toggle save/unsave post
app.post('/api/posts/:id/save', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const postId = post._id;
    const savedIndex = req.user.savedPosts.findIndex(
      id => id.toString() === postId.toString()
    );

    if (savedIndex === -1) {
      // Add to saved
      req.user.savedPosts.push(postId);
      await req.user.save();
      res.json({ success: true, saved: true, message: 'Post saved' });
    } else {
      // Remove from saved
      req.user.savedPosts.splice(savedIndex, 1);
      await req.user.save();
      res.json({ success: true, saved: false, message: 'Post unsaved' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get saved posts
app.get('/api/posts/saved', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get user with saved posts
    const user = await User.findById(req.user._id);
    const total = user.savedPosts.length;

    // Get saved posts with pagination
    const posts = await Post.find({
      _id: { $in: user.savedPosts }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.json({
      posts,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== WALLET ROUTES ====================

app.post('/api/wallet/topup', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    req.user.balance += amount;
    await req.user.save();

    await new Transaction({
      userId: req.user._id,
      type:   'topup',
      amount,
      desc:   'Пополнение баланса'
    }).save();

    res.json({ success: true, balance: req.user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wallet/withdraw', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    if (req.user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    req.user.balance -= amount;
    await req.user.save();

    await new Transaction({
      userId: req.user._id,
      type:   'withdraw',
      amount: -amount,
      desc:   'Вывод на карту'
    }).save();

    res.json({ success: true, balance: req.user.balance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wallet/transactions', authMiddleware, async (req, res) => {
  try {
    const transactions = await Transaction
      .find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTIFICATION ROUTES ====================

// Get user notifications
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const { limit = 50, unreadOnly = false } = req.query;
    const query = { userId: req.user._id };
    if (unreadOnly === 'true') query.read = false;
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      userId: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    notification.read = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { read: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread notification count
app.get('/api/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      read: false
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CANCELLATION & DISPUTE ROUTES ====================

// Request cancellation
app.post('/api/posts/:id/cancel', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { reason, description } = req.body;
    const post = await Post.findById(req.params.id).session(session);
    
    if (!post) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Verify user is involved in task
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isAssignee = post.assigneeId && post.assigneeId.toString() === req.user._id.toString();
    
    if (!isAuthor && !isAssignee) {
      await session.abortTransaction();
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Can only cancel if in progress or review
    if (!['in_progress', 'review'].includes(post.status)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Task cannot be cancelled in current status' });
    }
    
    // Check if already has cancellation request
    if (post.cancellationRequested && post.cancellationStatus === 'pending') {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Cancellation already requested' });
    }
    
    // Set cancellation request
    post.cancellationRequested = true;
    post.cancellationRequestedBy = req.user._id;
    post.cancellationReason = reason;
    post.cancellationStatus = 'pending';
    
    // If freelancer cancelling before submission - auto-approve with full refund
    if (isAssignee && post.status === 'in_progress' && !post.submissionFileUrl) {
      await processCancellation(post, session, 100);
      await session.commitTransaction();
      return res.json({ success: true, post, autoApproved: true });
    }
    
    // Otherwise requires approval from other party
    await post.save({ session });
    await session.commitTransaction();
    
    // Notify other party
    const otherPartyId = isAuthor ? post.assigneeId : post.authorId;
    if (otherPartyId) {
      await createNotification(
        otherPartyId,
        'cancellation_requested',
        'Запрос на отмену',
        `${req.user.name} запросил отмену задачи "${post.title}"`,
        post._id,
        'post',
        `/feed#post-${post._id}`,
        { reason, requestedBy: req.user._id.toString() }
      );
    }
    
    res.json({ success: true, post, autoApproved: false });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

// Approve cancellation
app.post('/api/posts/:id/cancel/approve', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { refundPercentage = 100 } = req.body;
    const post = await Post.findById(req.params.id).session(session);
    
    if (!post || !post.cancellationRequested) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'No cancellation request' });
    }
    
    // Verify user is the other party
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isAssignee = post.assigneeId && post.assigneeId.toString() === req.user._id.toString();
    const requestedBy = post.cancellationRequestedBy.toString();
    
    if ((isAuthor && requestedBy === post.authorId.toString()) ||
        (isAssignee && requestedBy === post.assigneeId.toString())) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Cannot approve your own cancellation request' });
    }
    
    // Validate refund percentage
    const refundPct = Math.max(0, Math.min(100, parseInt(refundPercentage)));
    
    // Process cancellation with refund
    await processCancellation(post, session, refundPct);
    
    await session.commitTransaction();
    res.json({ success: true, post });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

// Reject cancellation
app.post('/api/posts/:id/cancel/reject', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post || !post.cancellationRequested) {
      return res.status(400).json({ error: 'No cancellation request' });
    }
    
    // Verify user is the other party
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isAssignee = post.assigneeId && post.assigneeId.toString() === req.user._id.toString();
    const requestedBy = post.cancellationRequestedBy.toString();
    
    if ((isAuthor && requestedBy === post.authorId.toString()) ||
        (isAssignee && requestedBy === post.assigneeId.toString())) {
      return res.status(400).json({ error: 'Cannot reject your own cancellation request' });
    }
    
    post.cancellationStatus = 'rejected';
    post.cancellationRequested = false;
    await post.save();
    
    // Notify requester
    await createNotification(
      post.cancellationRequestedBy,
      'cancellation_requested',
      'Запрос на отмену отклонен',
      `Запрос на отмену задачи "${post.title}" был отклонен`,
      post._id,
      'post',
      `/feed#post-${post._id}`
    );
    
    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Open dispute
app.post('/api/posts/:id/dispute', authMiddleware, upload.array('attachments', 5), async (req, res) => {
  try {
    const { reason, description } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    // Verify user is involved
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const isAssignee = post.assigneeId && post.assigneeId.toString() === req.user._id.toString();
    
    if (!isAuthor && !isAssignee) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Can only dispute if task is in progress or review
    if (!['in_progress', 'review'].includes(post.status)) {
      return res.status(400).json({ error: 'Task cannot be disputed in current status' });
    }
    
    // Check if dispute already exists
    if (post.disputeOpened) {
      return res.status(400).json({ error: 'Dispute already opened for this task' });
    }
    
    // Create dispute
    const attachments = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const dispute = new Dispute({
      postId: post._id,
      openedBy: req.user._id,
      against: isAuthor ? post.assigneeId : post.authorId,
      reason,
      description,
      attachments
    });
    await dispute.save();
    
    // Update post
    post.disputeOpened = true;
    post.disputeOpenedBy = req.user._id;
    post.disputeReason = reason;
    post.disputeStatus = 'open';
    post.cancellationStatus = 'disputed';
    await post.save();
    
    // Notify other party
    const otherPartyId = isAuthor ? post.assigneeId : post.authorId;
    if (otherPartyId) {
      await createNotification(
        otherPartyId,
        'dispute_opened',
        'Открыт спор',
        `${req.user.name} открыл спор по задаче "${post.title}"`,
        post._id,
        'post',
        `/feed#post-${post._id}`,
        { disputeId: dispute._id.toString() }
      );
    }
    
    res.json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get disputes (for admin or involved parties)
app.get('/api/disputes', authMiddleware, async (req, res) => {
  try {
    // TODO: Add admin check
    const disputes = await Dispute.find({
      $or: [
        { openedBy: req.user._id },
        { against: req.user._id }
      ]
    })
    .populate('postId', 'title price status')
    .populate('openedBy', 'name email')
    .populate('against', 'name email')
    .sort({ createdAt: -1 });
    
    res.json(disputes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CHAT - WEBSOCKETS ====================

io.use((socket, next) => {
  try {
    const token   = socket.handshake.auth.token;
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (error) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', async (socket) => {
  console.log('User connected:', socket.userId);

  socket.join(socket.userId.toString()); // сразу заходим в свою комнату

  // Send unread notifications on connect
  try {
    const unreadNotifications = await Notification.find({
      userId: socket.userId,
      read: false
    }).sort({ createdAt: -1 }).limit(20);
    
    if (unreadNotifications.length > 0) {
      socket.emit('NOTIFICATIONS_LIST', unreadNotifications);
    }
  } catch (error) {
    console.error('Error loading notifications:', error);
  }

  // Handle notification requests
  socket.on('GET_NOTIFICATIONS', async () => {
    try {
      const notifications = await Notification.find({
        userId: socket.userId
      }).sort({ createdAt: -1 }).limit(50);
      
      socket.emit('NOTIFICATIONS_LIST', notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  });

  socket.on('SEND_MESSAGE', async (data) => {
    try {
      const message = new Message({
        fromId: socket.userId,
        toId:   data.toId,
        text:   data.text
      });
      await message.save();

      // отправляем себе и получателю
      io.to(socket.userId.toString()).emit('RECEIVE_MESSAGE', message);
      io.to(data.toId.toString()).emit('RECEIVE_MESSAGE', message);

      // Create notification for message recipient
      const sender = await User.findById(socket.userId);
      if (sender) {
        await createNotification(
          data.toId,
          'message_received',
          'Новое сообщение',
          `${sender.name}: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`,
          message._id,
          'message',
          `/chat/${socket.userId}`,
          { fromName: sender.name }
        );
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.userId);
  });
});

app.get('/api/messages/:targetId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { fromId: req.user._id,     toId: req.params.targetId },
        { fromId: req.params.targetId, toId: req.user._id }
      ]
    }).sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Admin: Get platform statistics
app.get('/api/admin/stats', authMiddleware, requireAdmin, async (req, res) => {
  try {
    // Total users by role
    const totalUsers = await User.countDocuments();
    const totalClients = await User.countDocuments({ role: 'Client' });
    const totalFreelancers = await User.countDocuments({ role: 'Freelancer' });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const proUsers = await User.countDocuments({ isPro: true });

    // Total posts by status
    const totalPosts = await Post.countDocuments();
    const openPosts = await Post.countDocuments({ status: 'open' });
    const inProgressPosts = await Post.countDocuments({ status: 'in_progress' });
    const reviewPosts = await Post.countDocuments({ status: 'review' });
    const completedPosts = await Post.countDocuments({ status: 'completed' });
    const cancelledPosts = await Post.countDocuments({ status: 'cancelled' });

    // Active disputes
    const activeDisputes = await Dispute.countDocuments({ status: { $in: ['open', 'under_review'] } });
    const totalDisputes = await Dispute.countDocuments();

    // Financial stats
    const transactions = await Transaction.find();
    let totalVolume = 0;
    let platformCommission = 0;
    let totalTopups = 0;
    let totalWithdrawals = 0;
    let totalPayouts = 0;
    let totalRefunds = 0;

    transactions.forEach(t => {
      if (t.type === 'topup') totalTopups += t.amount;
      if (t.type === 'withdraw') totalWithdrawals += Math.abs(t.amount);
      if (t.type === 'earn') {
        totalPayouts += t.amount;
        // Calculate commission from description if available
        const commMatch = t.desc?.match(/Комиссия:\s*(\d+)/);
        if (commMatch) platformCommission += parseInt(commMatch[1]);
      }
      if (t.type === 'refund') totalRefunds += t.amount;
      if (['pay_job', 'pay_gig'].includes(t.type)) totalVolume += Math.abs(t.amount);
    });

    // Recent activity
    const recentUsers = await User.find().sort({ createdAt: -1 }).limit(5).select('name email role createdAt');
    const recentPosts = await Post.find().sort({ createdAt: -1 }).limit(5).select('title type status price createdAt');
    const recentTransactions = await Transaction.find().sort({ createdAt: -1 }).limit(10);

    // Daily stats for last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newUsersWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const newPostsWeek = await Post.countDocuments({ createdAt: { $gte: sevenDaysAgo } });
    const completedWeek = await Post.countDocuments({ status: 'completed', updatedAt: { $gte: sevenDaysAgo } });

    res.json({
      users: {
        total: totalUsers,
        clients: totalClients,
        freelancers: totalFreelancers,
        banned: bannedUsers,
        verified: verifiedUsers,
        pro: proUsers,
        newThisWeek: newUsersWeek
      },
      posts: {
        total: totalPosts,
        open: openPosts,
        inProgress: inProgressPosts,
        review: reviewPosts,
        completed: completedPosts,
        cancelled: cancelledPosts,
        newThisWeek: newPostsWeek,
        completedThisWeek: completedWeek
      },
      disputes: {
        active: activeDisputes,
        total: totalDisputes
      },
      financials: {
        totalVolume,
        platformCommission,
        totalTopups,
        totalWithdrawals,
        totalPayouts,
        totalRefunds
      },
      recent: {
        users: recentUsers,
        posts: recentPosts,
        transactions: recentTransactions
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all users with pagination and filters
app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      search, 
      status, // 'active', 'banned', 'verified', 'pro'
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { role: { $ne: 'Admin' } }; // Don't show other admins

    if (role && role !== 'all') query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'verified') query.isVerified = true;
    if (status === 'pro') query.isPro = true;
    if (status === 'active') query.isBanned = { $ne: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    // Get additional stats for each user
    const usersWithStats = await Promise.all(users.map(async (user) => {
      const postsCreated = await Post.countDocuments({ authorId: user._id });
      const postsCompleted = await Post.countDocuments({ 
        $or: [{ authorId: user._id }, { assigneeId: user._id }],
        status: 'completed'
      });
      return {
        ...user.toObject(),
        stats: { postsCreated, postsCompleted }
      };
    }));

    res.json({
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Ban/Unban user
app.post('/api/admin/users/:id/ban', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'Admin') return res.status(403).json({ error: 'Cannot ban admin users' });

    user.isBanned = true;
    user.bannedAt = new Date();
    user.bannedBy = req.user._id;
    user.banReason = reason || 'Violation of terms of service';
    await user.save();

    // Create notification for banned user
    await createNotification(
      user._id,
      'system',
      'Аккаунт заблокирован',
      `Ваш аккаунт был заблокирован. Причина: ${user.banReason}`,
      null,
      null,
      null,
      { reason: user.banReason }
    );

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:id/unban', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isBanned = false;
    user.bannedAt = null;
    user.bannedBy = null;
    user.banReason = null;
    await user.save();

    // Create notification for unbanned user
    await createNotification(
      user._id,
      'system',
      'Аккаунт разблокирован',
      'Ваш аккаунт был разблокирован. Добро пожаловать обратно!',
      null,
      null,
      null
    );

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Verify/Unverify user
app.post('/api/admin/users/:id/verify', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isVerified = true;
    await user.save();

    await createNotification(
      user._id,
      'system',
      'Аккаунт верифицирован ✓',
      'Поздравляем! Ваш аккаунт успешно верифицирован.',
      null,
      null,
      null
    );

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:id/unverify', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.isVerified = false;
    await user.save();

    res.json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get all posts with pagination and filters
app.get('/api/admin/posts', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      type,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (type && type !== 'all') query.type = type;
    if (status && status !== 'all') query.status = status;

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { desc: { $regex: search, $options: 'i' } },
        { authorName: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const posts = await Post.find(query)
      .populate('authorId', 'name email')
      .populate('assigneeId', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    res.json({
      posts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Delete post
app.delete('/api/admin/posts/:id', authMiddleware, requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const post = await Post.findById(req.params.id).session(session);
    
    if (!post) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Post not found' });
    }

    // Refund if post has frozen funds and is not completed
    if (['open', 'in_progress', 'review'].includes(post.status)) {
      const clientId = post.type === 'job' ? post.authorId : post.assigneeId;
      if (clientId) {
        const client = await User.findById(clientId).session(session);
        if (client) {
          client.balance += post.price;
          await client.save({ session });

          await Transaction.create([{
            userId: clientId,
            type: 'refund',
            amount: post.price,
            desc: `Возврат (удаление администратором): ${post.title}`
          }], { session });

          await createNotification(
            clientId,
            'system',
            'Пост удален',
            `Пост "${post.title}" был удален администратором. Средства возвращены.`,
            post._id,
            'post'
          );
        }
      }
    }

    // Notify author
    await createNotification(
      post.authorId,
      'system',
      'Пост удален администратором',
      `Ваш пост "${post.title}" был удален за нарушение правил платформы.`,
      null,
      null
    );

    await Post.findByIdAndDelete(req.params.id).session(session);

    await session.commitTransaction();
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

// Admin: Get all disputes
app.get('/api/admin/disputes', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const disputes = await Dispute.find(query)
      .populate('postId', 'title price status')
      .populate('openedBy', 'name email')
      .populate('against', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Dispute.countDocuments(query);

    res.json({
      disputes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Resolve dispute
app.post('/api/admin/disputes/:id/resolve', authMiddleware, requireAdmin, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { resolution, refundToClient, refundPercentage = 100 } = req.body;
    const dispute = await Dispute.findById(req.params.id).session(session);
    
    if (!dispute) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Dispute not found' });
    }

    const post = await Post.findById(dispute.postId).session(session);

    // Process refund if needed
    if (refundToClient && post && ['in_progress', 'review'].includes(post.status)) {
      const refundAmount = Math.round(post.price * (refundPercentage / 100));
      const clientId = post.type === 'job' ? post.authorId : post.assigneeId;
      
      if (clientId) {
        const client = await User.findById(clientId).session(session);
        if (client) {
          client.balance += refundAmount;
          await client.save({ session });

          await Transaction.create([{
            userId: clientId,
            type: 'refund',
            amount: refundAmount,
            desc: `Возврат по решению спора: ${post.title} (${refundPercentage}%)`
          }], { session });
        }
      }

      post.status = 'cancelled';
      post.disputeStatus = 'resolved';
      post.disputeResolution = resolution;
      post.disputeResolvedBy = req.user._id;
      post.disputeResolvedAt = new Date();
      await post.save({ session });
    }

    dispute.status = 'resolved';
    dispute.resolution = resolution;
    dispute.resolvedBy = req.user._id;
    dispute.resolvedAt = new Date();
    await dispute.save({ session });

    // Notify both parties
    await createNotification(
      dispute.openedBy,
      'system',
      'Спор разрешен',
      `Ваш спор был рассмотрен. Решение: ${resolution}`,
      post?._id,
      'post'
    );

    await createNotification(
      dispute.against,
      'system',
      'Спор разрешен',
      `Спор по вашей задаче был рассмотрен. Решение: ${resolution}`,
      post?._id,
      'post'
    );

    await session.commitTransaction();
    res.json({ success: true, dispute });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

// Admin: Get transactions
app.get('/api/admin/transactions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, type, userId } = req.query;

    const query = {};
    if (type && type !== 'all') query.type = type;
    if (userId) query.userId = userId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transactions = await Transaction.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get admin balance
app.get('/api/admin/financials/balance', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    res.json({ balance: admin.balance || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Get commission history
app.get('/api/admin/financials/commissions', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const commissions = await Transaction.find({
      userId: admin._id,
      type: 'commission_earn'
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Extract freelancer name from description
    const commissionsWithNames = commissions.map(c => {
      const descMatch = c.desc.match(/by (.+)$/);
      return {
        ...c,
        freelancerName: descMatch ? descMatch[1] : 'Unknown'
      };
    });

    res.json(commissionsWithNames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Withdraw all revenue
app.post('/api/admin/financials/withdraw', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const admin = await User.findOne({ role: 'Admin' });
    if (!admin) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const withdrawAmount = admin.balance || 0;
    
    if (withdrawAmount <= 0) {
      return res.status(400).json({ error: 'No revenue to withdraw' });
    }

    // Set balance to 0
    admin.balance = 0;
    await admin.save();

    // Create withdraw transaction
    await new Transaction({
      userId: admin._id,
      type: 'withdraw',
      amount: -withdrawAmount,
      desc: 'Вывод дохода на банковскую карту'
    }).save();

    res.json({ 
      success: true, 
      withdrawn: withdrawAmount,
      balance: 0 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin: Seed first admin account
app.post('/api/admin/seed', async (req, res) => {
  try {
    const { secretKey } = req.body;
    
    // Simple secret key check for seeding (change in production!)
    if (secretKey !== 'stulink-admin-seed-2024') {
      return res.status(403).json({ error: 'Invalid secret key' });
    }

    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'Admin' });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin account already exists' });
    }

    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = new User({
      name: 'Admin',
      email: 'admin@stulink.com',
      password: hashedPassword,
      role: 'Admin',
      isVerified: true,
      balance: 0,
      avatar: 'A'
    });

    await admin.save();
    const token = jwt.sign({ userId: admin._id }, JWT_SECRET);

    res.json({ 
      success: true, 
      message: 'Admin account created successfully',
      credentials: {
        email: 'admin@stulink.com',
        password: 'admin123'
      },
      token,
      user: sanitizeUser(admin)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== UTILITY ====================

function sanitizeUser(user) {
  const obj = user.toObject();
  delete obj.password;
  return obj;
}

// ==================== STATIC FILES ====================
// Serve static frontend files (HTML, CSS, JS)
// This must be AFTER all API routes
app.use(express.static(path.join(__dirname, '../frontend')));

// Catch-all handler: serve index.html for SPA routing
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 StuLink Backend running on port ${PORT}`);
  console.log(`📁 Frontend files served from: ${path.join(__dirname, '../frontend')}`);
  console.log(`🔍 Server startup debug - DB URI length:`, process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 'undefined');
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});
