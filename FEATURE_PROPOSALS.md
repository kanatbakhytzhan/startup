# StuLink Feature Proposals
## Three High-Value Features for Platform Enhancement

---

## Feature 1: Real-Time Notification System
**Difficulty Level: Medium**

### Feature Name & Description

**Real-Time Notification System with Database Persistence**

Currently, notifications are stored only in frontend memory and lost on page refresh. This feature adds a complete notification system with:
- **Database persistence**: Notifications saved to MongoDB
- **Real-time delivery**: WebSocket-based instant notifications
- **Notification types**: Task updates, messages, payments, reviews
- **Read/unread status**: Track notification state
- **Notification history**: View past notifications
- **Action buttons**: Direct links to relevant tasks/chat

**How it helps users:**
- Users never miss important updates (task assigned, work submitted, payment received)
- Better engagement with instant notifications
- Professional experience similar to modern platforms
- Reduces need to constantly check feed for updates

---

### Technical Implementation

#### Backend Changes

**1. New Mongoose Model** (`server.js`)
```javascript
const NotificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: ['task_assigned', 'task_submitted', 'task_approved', 'task_cancelled', 
           'message_received', 'payment_received', 'review_received', 'system'],
    required: true 
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  relatedId: { type: mongoose.Schema.Types.ObjectId }, // Post ID, Message ID, etc.
  relatedType: { type: String }, // 'post', 'message', 'transaction'
  read: { type: Boolean, default: false },
  actionUrl: { type: String }, // e.g., '/feed#post-123' or '/chat/user-456'
  metadata: { type: mongoose.Schema.Types.Mixed } // Additional data
}, { timestamps: true });

const Notification = mongoose.model('Notification', NotificationSchema);
```

**2. Notification Service Helper** (`server.js`)
```javascript
// Helper function to create and send notifications
async function createNotification(userId, type, title, message, relatedId = null, relatedType = null, actionUrl = null) {
  const notification = new Notification({
    userId,
    type,
    title,
    message,
    relatedId,
    relatedType,
    actionUrl,
    read: false
  });
  
  await notification.save();
  
  // Emit via WebSocket if user is online
  io.to(userId.toString()).emit('NEW_NOTIFICATION', notification);
  
  return notification;
}
```

**3. Update Existing Endpoints** (`server.js`)

**Task Assignment** (in `/api/posts/:id/take`):
```javascript
// After assigning task
await createNotification(
  post.authorId,
  'task_assigned',
  'Заказ взят',
  `${req.user.name} взял ваш заказ "${post.title}"`,
  post._id,
  'post',
  `/feed#post-${post._id}`
);

await createNotification(
  req.user._id,
  'task_assigned',
  'Вы взяли заказ',
  `Вы взяли заказ "${post.title}" от ${post.authorName}`,
  post._id,
  'post',
  `/feed#post-${post._id}`
);
```

**Task Submission** (in `/api/posts/:id/submit`):
```javascript
// After submission
const isJob = post.type === 'job';
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
```

**Task Approval** (in `/api/posts/:id/approve`):
```javascript
// After approval
await createNotification(
  workerId,
  'payment_received',
  'Оплата получена',
  `Вы получили ${payout} ₸ за "${post.title}"`,
  post._id,
  'post',
  `/feed#post-${post._id}`
);

await createNotification(
  workerId,
  'review_received',
  'Новый отзыв',
  `Клиент оставил отзыв: ${rating}⭐`,
  post._id,
  'post',
  `/feed#post-${post._id}`
);
```

**4. New API Endpoints** (`server.js`)
```javascript
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

// Mark all as read
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

// Get unread count
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
```

**5. WebSocket Integration** (`server.js`)
```javascript
// In Socket.io connection handler
io.on('connection', (socket) => {
  // ... existing code ...
  
  // Send unread notifications on connect
  socket.on('GET_NOTIFICATIONS', async () => {
    const notifications = await Notification.find({
      userId: socket.userId,
      read: false
    }).sort({ createdAt: -1 }).limit(20);
    
    socket.emit('NOTIFICATIONS_LIST', notifications);
  });
  
  // ... rest of socket handlers ...
});
```

#### Frontend Changes

**1. Update API Client** (`api.js`)
```javascript
// Add to StuLinkAPI class
async getNotifications(limit = 50, unreadOnly = false) {
  const query = `limit=${limit}&unreadOnly=${unreadOnly}`;
  return this._fetch(`/notifications?${query}`);
}

async markNotificationRead(notificationId) {
  return this._fetch(`/notifications/${notificationId}/read`, 'PUT');
}

async markAllNotificationsRead() {
  return this._fetch('/notifications/read-all', 'PUT');
}

async getUnreadCount() {
  return this._fetch('/notifications/unread-count');
}
```

**2. Update Socket.io Handler** (`app.js`)
```javascript
// In API.initChat() or new initNotifications()
initNotifications: function() {
  if (!this.socket || !this.data.currentUser) return;
  
  // Listen for new notifications
  this.socket.on('NEW_NOTIFICATION', (notification) => {
    this.handleNewNotification(notification);
  });
  
  // Request notifications on connect
  this.socket.emit('GET_NOTIFICATIONS');
  this.socket.on('NOTIFICATIONS_LIST', (notifications) => {
    this.data.notifications = notifications;
    this.updateNotificationBadge();
  });
},

handleNewNotification: function(notification) {
  // Add to local state
  this.data.notifications.unshift(notification);
  
  // Update badge
  this.updateNotificationBadge();
  
  // Show toast
  this.toast(`🔔 ${notification.title}`);
  
  // Play sound (optional)
  // new Audio('/notification.mp3').play();
},

updateNotificationBadge: function() {
  const unreadCount = this.data.notifications.filter(n => !n.read).length;
  const badge = document.getElementById('notifBadge');
  if (badge) {
    badge.style.display = unreadCount > 0 ? 'block' : 'none';
    badge.innerText = unreadCount > 0 ? unreadCount : '';
  }
},
```

**3. Update Notification UI** (`app.js`)
```javascript
renderNotifications: async function() {
  const list = document.getElementById('notifList');
  const user = this.data.currentUser;
  if (!user) return;
  
  try {
    // Fetch from API instead of local state
    const notifications = await API.getNotifications(50, false);
    this.data.notifications = notifications;
    
    if (!notifications.length) {
      list.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8;">Нет уведомлений</div>`;
      return;
    }
    
    list.innerHTML = '';
    notifications.forEach(n => {
      const icon = this.getNotificationIcon(n.type);
      const html = `
        <div class="notif-item ${!n.read ? 'unread' : ''}" 
             onclick="app.handleNotificationClick('${n._id}', '${n.actionUrl || ''}')">
          <i class="${icon} notif-icon"></i>
          <div style="flex:1;">
            <div style="font-weight:${n.read ? '400' : '700'};">
              ${n.title}
            </div>
            <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">
              ${n.message}
            </div>
            <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">
              ${new Date(n.createdAt).toLocaleString()}
            </div>
          </div>
        </div>`;
      list.innerHTML += html;
    });
    
    this.updateNotificationBadge();
  } catch (e) {
    console.error(e);
    list.innerHTML = `<div style="padding:20px; color:#ef4444;">Ошибка загрузки</div>`;
  }
},

getNotificationIcon: function(type) {
  const icons = {
    'task_assigned': 'fas fa-hand-paper',
    'task_submitted': 'fas fa-file-upload',
    'task_approved': 'fas fa-check-circle',
    'task_cancelled': 'fas fa-times-circle',
    'message_received': 'fas fa-comment',
    'payment_received': 'fas fa-money-bill-wave',
    'review_received': 'fas fa-star',
    'system': 'fas fa-info-circle'
  };
  return icons[type] || 'fas fa-bell';
},

handleNotificationClick: async function(notificationId, actionUrl) {
  // Mark as read
  try {
    await API.markNotificationRead(notificationId);
    // Update local state
    const notif = this.data.notifications.find(n => n._id === notificationId);
    if (notif) notif.read = true;
    this.updateNotificationBadge();
  } catch (e) {
    console.error(e);
  }
  
  // Navigate if action URL provided
  if (actionUrl) {
    if (actionUrl.startsWith('/feed#')) {
      this.router('feed');
      // Scroll to post after render
      setTimeout(() => {
        const postId = actionUrl.split('#post-')[1];
        const element = document.querySelector(`[data-post-id="${postId}"]`);
        if (element) element.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } else if (actionUrl.startsWith('/chat/')) {
      const userId = actionUrl.split('/chat/')[1];
      this.openChat(userId, 'User');
    }
  }
},
```

**4. Update HTML** (`index.html`)
```html
<!-- Update notification dropdown to show unread count -->
<div id="notifDropdown" class="notif-dropdown" style="display: none;">
  <div class="notif-header">
    <span>Уведомления</span>
    <div style="display:flex; gap:10px; align-items:center;">
      <button onclick="app.markAllRead()" style="background:none; border:none; color:var(--primary); cursor:pointer; font-size:0.8rem;">
        Отметить все прочитанными
      </button>
      <small onclick="app.clearNotifs()" style="cursor:pointer; color:var(--primary);">Очистить</small>
    </div>
  </div>
  <div id="notifList" class="notif-list"></div>
</div>
```

---

## Feature 2: Task Dispute & Cancellation System
**Difficulty Level: High**

### Feature Name & Description

**Task Dispute Resolution & Cancellation System with Refund Logic**

Currently, once a task is in progress, there's no way to cancel or resolve disputes. This feature adds:
- **Task cancellation**: Client or freelancer can request cancellation
- **Automatic refunds**: Escrow funds returned based on cancellation reason
- **Dispute system**: Escalate conflicts to platform moderation
- **Cancellation reasons**: Track why tasks are cancelled
- **Partial refunds**: Support for milestone-based refunds
- **Cancellation history**: Track cancellation patterns

**How it helps users:**
- Builds trust by allowing task cancellation
- Protects both clients and freelancers from bad actors
- Reduces platform liability with proper dispute handling
- Improves user satisfaction with flexible cancellation policies
- Enables data collection on cancellation reasons for platform improvement

---

### Technical Implementation

#### Backend Changes

**1. Update Post Schema** (`server.js`)
```javascript
const PostSchema = new mongoose.Schema({
  // ... existing fields ...
  
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
  disputeResolution: { type: String }, // Admin resolution notes
  disputeResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  disputeResolvedAt: { type: Date }
}, { timestamps: true });
```

**2. New Dispute Model** (`server.js`)
```javascript
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

const Dispute = mongoose.model('Dispute', DisputeSchema);
```

**3. Cancellation Logic** (`server.js`)
```javascript
// Request cancellation
app.post('/api/posts/:id/cancel', authMiddleware, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { reason, refundPercentage } = req.body;
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
    
    // Set cancellation request
    post.cancellationRequested = true;
    post.cancellationRequestedBy = req.user._id;
    post.cancellationReason = reason;
    post.cancellationStatus = 'pending';
    
    // If both parties agree (simplified: auto-approve if requested by assignee before submission)
    if (isAssignee && post.status === 'in_progress' && !post.submissionFileUrl) {
      // Freelancer cancelling before submission - full refund
      await processCancellation(post, session, 100);
    } else {
      // Requires approval from other party
      await post.save({ session });
      
      // Notify other party
      const otherPartyId = isAuthor ? post.assigneeId : post.authorId;
      await createNotification(
        otherPartyId,
        'task_cancelled',
        'Запрос на отмену',
        `${req.user.name} запросил отмену задачи "${post.title}"`,
        post._id,
        'post'
      );
    }
    
    await session.commitTransaction();
    res.json({ success: true, post });
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
    
    // Process cancellation with refund
    await processCancellation(post, session, refundPercentage);
    
    await session.commitTransaction();
    res.json({ success: true, post });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
});

// Process cancellation and refund
async function processCancellation(post, session, refundPercentage = 100) {
  const refundAmount = Math.round(post.price * (refundPercentage / 100));
  
  // Refund to client
  const client = await User.findById(post.authorId).session(session);
  client.balance += refundAmount;
  await client.save({ session });
  
  // Record transaction
  await Transaction.create([{
    userId: client._id,
    type: 'topup',
    amount: refundAmount,
    desc: `Возврат за отмену: ${post.title} (${refundPercentage}%)`
  }], { session });
  
  // Update post status
  post.status = 'completed';
  post.cancellationStatus = 'approved';
  post.cancelledAt = new Date();
  post.cancelledBy = post.cancellationRequestedBy;
  await post.save({ session });
  
  // Notify both parties
  await createNotification(
    post.authorId,
    'task_cancelled',
    'Задача отменена',
    `Задача "${post.title}" отменена. Возврат: ${refundAmount} ₸`,
    post._id,
    'post'
  );
  
  if (post.assigneeId) {
    await createNotification(
      post.assigneeId,
      'task_cancelled',
      'Задача отменена',
      `Задача "${post.title}" отменена клиентом`,
      post._id,
      'post'
    );
  }
}
```

**4. Dispute Endpoints** (`server.js`)
```javascript
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
    await post.save();
    
    // Notify admin (if admin system exists) and other party
    await createNotification(
      post.against,
      'system',
      'Открыт спор',
      `${req.user.name} открыл спор по задаче "${post.title}"`,
      post._id,
      'post'
    );
    
    res.json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resolve dispute (admin only - simplified)
app.post('/api/disputes/:id/resolve', authMiddleware, async (req, res) => {
  try {
    const { resolution, refundToClient, refundPercentage } = req.body;
    // TODO: Add admin check
    const dispute = await Dispute.findById(req.params.id);
    const post = await Post.findById(dispute.postId);
    
    // Process refund based on resolution
    if (refundToClient) {
      await processCancellation(post, session, refundPercentage);
    }
    
    dispute.status = 'resolved';
    dispute.resolution = resolution;
    dispute.resolvedBy = req.user._id;
    dispute.resolvedAt = new Date();
    await dispute.save();
    
    post.disputeStatus = 'resolved';
    await post.save();
    
    res.json({ success: true, dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Frontend Changes

**1. Add Cancellation UI** (`app.js`)
```javascript
// Add cancel button to task cards (in renderFeed)
// For in_progress tasks, show cancel button
if (status === 'in_progress' && (isMyPost || isAssignee)) {
  actionBtn += `
    <button class="btn btn-danger btn-sm" 
            onclick="app.openCancelModal('${postId}')">
      Отменить
    </button>`;
}

// Cancellation modal handler
openCancelModal: function(postId) {
  this.data.tempCancelPostId = postId;
  const modal = document.getElementById('cancelModal');
  if (modal) {
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
  }
},

handleCancel: async function() {
  const postId = this.data.tempCancelPostId;
  const reason = document.getElementById('cancelReason').value;
  
  if (!reason) {
    this.toast('Укажите причину отмены');
    return;
  }
  
  try {
    await API.cancelPost(postId, reason);
    this.closeCancelModal();
    await this.renderFeed();
    this.toast('Запрос на отмену отправлен');
  } catch (e) {
    this.toast(e.message || 'Ошибка отмены');
  }
},
```

**2. Add to API Client** (`api.js`)
```javascript
async cancelPost(postId, reason) {
  return this._fetch(`/posts/${postId}/cancel`, 'POST', { reason });
}

async approveCancellation(postId, refundPercentage = 100) {
  return this._fetch(`/posts/${postId}/cancel/approve`, 'POST', { refundPercentage });
}

async openDispute(postId, reason, description, attachments = []) {
  const formData = new FormData();
  formData.append('reason', reason);
  formData.append('description', description);
  attachments.forEach(file => formData.append('attachments', file));
  
  return this._fetch(`/posts/${postId}/dispute`, 'POST', formData, true);
}
```

**3. Add Modal HTML** (`index.html`)
```html
<!-- Cancellation Modal -->
<div id="cancelModal" class="modal-overlay" style="display:none;">
  <div class="modal-box">
    <div class="modal-header">
      <h3>Отменить задачу</h3>
      <i class="fas fa-times" onclick="app.closeCancelModal()"></i>
    </div>
    <p style="color:#64748b; margin-bottom:15px;">
      Укажите причину отмены. Другая сторона должна будет подтвердить отмену.
    </p>
    <select id="cancelReason" class="mb-3">
      <option value="">Выберите причину</option>
      <option value="client_no_longer_needs">Клиенту больше не нужна услуга</option>
      <option value="freelancer_unavailable">Исполнитель недоступен</option>
      <option value="requirements_changed">Требования изменились</option>
      <option value="quality_issues">Проблемы с качеством</option>
      <option value="other">Другое</option>
    </select>
    <textarea id="cancelDescription" rows="3" placeholder="Дополнительные детали (необязательно)"></textarea>
    <button class="btn btn-danger btn-full" onclick="app.handleCancel()">
      Отправить запрос на отмену
    </button>
  </div>
</div>
```

---

## Feature 3: Advanced Search & Filtering with Smart Recommendations
**Difficulty Level: Medium**

### Feature Name & Description

**Advanced Search, Filtering, and Personalized Task Recommendations**

Currently, search is basic client-side filtering. This feature adds:
- **Advanced filters**: Price range, category, rating, date, status
- **Sorting options**: Price, date, rating, relevance
- **Smart recommendations**: AI-powered task suggestions based on user history
- **Saved searches**: Save filter combinations
- **Search history**: Track what users search for
- **Trending tasks**: Highlight popular tasks
- **Category tags**: Multiple tags per task for better matching

**How it helps users:**
- Freelancers find relevant tasks faster
- Clients discover better freelancers
- Improved user experience with personalized content
- Higher task completion rates through better matching
- Data insights for platform optimization

---

### Technical Implementation

#### Backend Changes

**1. Update Post Schema** (`server.js`)
```javascript
const PostSchema = new mongoose.Schema({
  // ... existing fields ...
  
  // Enhanced search fields
  tags: [{ type: String }], // e.g., ['python', 'django', 'api']
  searchKeywords: [{ type: String }], // Auto-generated from title/desc
  viewCount: { type: Number, default: 0 },
  applicationCount: { type: Number, default: 0 }, // How many freelancers viewed/tried to take
  trendingScore: { type: Number, default: 0 }, // Calculated score
  lastActivityAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Add indexes for search
PostSchema.index({ title: 'text', desc: 'text', tags: 'text' });
PostSchema.index({ type: 1, status: 1, cat: 1, price: 1, createdAt: -1 });
PostSchema.index({ trendingScore: -1 });
PostSchema.index({ authorId: 1, status: 1 });
```

**2. Enhanced Search Endpoint** (`server.js`)
```javascript
app.get('/api/posts/search', authMiddleware, async (req, res) => {
  try {
    const {
      query,
      type,
      cat,
      minPrice,
      maxPrice,
      minRating,
      status,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 20,
      skip = 0
    } = req.query;
    
    const filter = {};
    
    // Type filter
    if (type) filter.type = type;
    
    // Category filter
    if (cat) filter.cat = cat;
    
    // Price range
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseInt(minPrice);
      if (maxPrice) filter.price.$lte = parseInt(maxPrice);
    }
    
    // Status filter
    if (status) {
      filter.status = status;
    } else {
      // Default: show open + user's tasks
      filter.$or = [
        { status: 'open' },
        { authorId: req.user._id },
        { assigneeId: req.user._id }
      ];
    }
    
    // Text search
    if (query) {
      filter.$text = { $search: query };
    }
    
    // Rating filter (for completed tasks with ratings)
    if (minRating) {
      filter.rating = { $gte: parseInt(minRating) };
    }
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    // Execute query
    const posts = await Post.find(filter)
      .sort(sort)
      .limit(parseInt(limit))
      .skip(parseInt(skip));
    
    // Get total count for pagination
    const total = await Post.countDocuments(filter);
    
    res.json({ posts, total, limit: parseInt(limit), skip: parseInt(skip) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**3. Recommendations Endpoint** (`server.js`)
```javascript
app.get('/api/posts/recommendations', authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    const recommendations = [];
    
    if (user.role === 'Freelancer') {
      // Get user's completed tasks to understand preferences
      const completedTasks = await Post.find({
        assigneeId: user._id,
        status: 'completed'
      }).limit(10);
      
      // Extract common categories and tags
      const categories = {};
      const tags = {};
      completedTasks.forEach(task => {
        categories[task.cat] = (categories[task.cat] || 0) + 1;
        task.tags?.forEach(tag => {
          tags[tag] = (tags[tag] || 0) + 1;
        });
      });
      
      // Find similar open tasks
      const topCategories = Object.keys(categories).sort((a, b) => categories[b] - categories[a]).slice(0, 2);
      const topTags = Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 5);
      
      const recommended = await Post.find({
        status: 'open',
        type: 'job',
        $or: [
          { cat: { $in: topCategories } },
          { tags: { $in: topTags } }
        ],
        price: { $gte: user.balance > 0 ? 0 : 1000 } // Filter by affordability
      })
      .sort({ trendingScore: -1, createdAt: -1 })
      .limit(10);
      
      recommendations.push(...recommended);
    } else if (user.role === 'Client') {
      // Recommend freelancers' gigs based on client's job history
      const clientJobs = await Post.find({
        authorId: user._id,
        status: 'completed'
      }).limit(10);
      
      const categories = {};
      clientJobs.forEach(job => {
        categories[job.cat] = (categories[job.cat] || 0) + 1;
      });
      
      const topCategories = Object.keys(categories).sort((a, b) => categories[b] - categories[a]).slice(0, 2);
      
      const recommended = await Post.find({
        status: 'open',
        type: 'gig',
        cat: { $in: topCategories }
      })
      .populate('authorId', 'name ratingSum ratingCount isPro')
      .sort({ trendingScore: -1 })
      .limit(10);
      
      recommendations.push(...recommended);
    }
    
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**4. Update Trending Score** (`server.js`)
```javascript
// Function to calculate trending score
async function updateTrendingScore(postId) {
  const post = await Post.findById(postId);
  if (!post) return;
  
  // Calculate score based on:
  // - Views (weight: 1)
  // - Applications (weight: 3)
  // - Time since creation (decay)
  // - Price (higher price = more interest)
  
  const hoursSinceCreation = (Date.now() - post.createdAt) / (1000 * 60 * 60);
  const timeDecay = Math.max(0.1, 1 / (1 + hoursSinceCreation / 24)); // Decay over days
  
  const score = (
    post.viewCount * 1 +
    post.applicationCount * 3 +
    (post.price / 1000) * 0.5
  ) * timeDecay;
  
  post.trendingScore = score;
  post.lastActivityAt = new Date();
  await post.save();
}

// Update score when task is viewed
app.get('/api/posts/:id', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    
    // Increment view count
    post.viewCount += 1;
    await post.save();
    await updateTrendingScore(post._id);
    
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Frontend Changes

**1. Advanced Search UI** (`index.html`)
```html
<!-- Enhanced search bar in feed -->
<div class="search-container" style="margin-bottom:20px;">
  <div class="search-bar">
    <i class="fas fa-search"></i>
    <input id="feedSearch" type="text" placeholder="Поиск задач...">
  </div>
  
  <button class="btn btn-secondary" onclick="app.toggleFilters()">
    <i class="fas fa-filter"></i> Фильтры
  </button>
</div>

<!-- Filter Panel -->
<div id="filterPanel" class="glass-card" style="display:none; margin-bottom:20px; padding:20px;">
  <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px;">
    <div>
      <label>Категория</label>
      <select id="filterCat">
        <option value="">Все</option>
        <option value="dev">IT & Разработка</option>
        <option value="design">Дизайн</option>
        <option value="text">Текст / Перевод</option>
        <option value="study">Учеба</option>
      </select>
    </div>
    
    <div>
      <label>Цена от (₸)</label>
      <input type="number" id="filterMinPrice" placeholder="0">
    </div>
    
    <div>
      <label>Цена до (₸)</label>
      <input type="number" id="filterMaxPrice" placeholder="100000">
    </div>
    
    <div>
      <label>Сортировка</label>
      <select id="filterSort">
        <option value="createdAt-desc">Новые сначала</option>
        <option value="price-asc">Цена: по возрастанию</option>
        <option value="price-desc">Цена: по убыванию</option>
        <option value="trendingScore-desc">Популярные</option>
      </select>
    </div>
  </div>
  
  <button class="btn btn-primary" onclick="app.applyFilters()" style="margin-top:15px;">
    Применить фильтры
  </button>
</div>
```

**2. Update Feed Rendering** (`app.js`)
```javascript
renderFeed: async function(forceType = null) {
  if (forceType) this.data.currentFeedType = forceType;
  const type = this.data.currentFeedType;
  
  // Get filter values
  const filters = {
    type,
    query: document.getElementById('feedSearch')?.value || '',
    cat: document.getElementById('filterCat')?.value || '',
    minPrice: document.getElementById('filterMinPrice')?.value || '',
    maxPrice: document.getElementById('filterMaxPrice')?.value || '',
    sortBy: (document.getElementById('filterSort')?.value || 'createdAt-desc').split('-')[0],
    sortOrder: (document.getElementById('filterSort')?.value || 'createdAt-desc').split('-')[1]
  };
  
  try {
    // Use new search endpoint
    const result = await API.searchPosts(filters);
    const posts = result.posts;
    
    // ... rest of rendering logic ...
  } catch (err) {
    console.error(err);
  }
},

toggleFilters: function() {
  const panel = document.getElementById('filterPanel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
},

applyFilters: function() {
  this.renderFeed();
},
```

**3. Recommendations Section** (`app.js`)
```javascript
renderRecommendations: async function() {
  try {
    const recommendations = await API.getRecommendations();
    
    if (!recommendations.length) return;
    
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;
    
    container.innerHTML = `
      <h3 style="margin-bottom:15px;">Рекомендации для вас</h3>
      <div class="feed-grid">
        ${recommendations.map(post => this.renderPostCard(post)).join('')}
      </div>
    `;
  } catch (e) {
    console.error(e);
  }
},
```

**4. Update API Client** (`api.js`)
```javascript
async searchPosts(filters) {
  const params = new URLSearchParams();
  Object.keys(filters).forEach(key => {
    if (filters[key]) params.append(key, filters[key]);
  });
  return this._fetch(`/posts/search?${params.toString()}`);
}

async getRecommendations() {
  return this._fetch('/posts/recommendations');
}
```

---

## Summary Comparison

| Feature | Difficulty | Value | Implementation Time | User Impact |
|---------|-----------|-------|-------------------|-------------|
| **Real-Time Notifications** | Medium | High | 4-6 hours | ⭐⭐⭐⭐⭐ |
| **Dispute & Cancellation** | High | Very High | 8-12 hours | ⭐⭐⭐⭐⭐ |
| **Advanced Search & Recommendations** | Medium | High | 6-8 hours | ⭐⭐⭐⭐ |

---

## Recommended Implementation Order

1. **Real-Time Notifications** (Week 1) - Quick win, high impact
2. **Advanced Search & Recommendations** (Week 2) - Improves core UX
3. **Dispute & Cancellation** (Week 3-4) - Complex but critical for trust

---

**Document Version**: 1.0  
**Last Updated**: 2024

