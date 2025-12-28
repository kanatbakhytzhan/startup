/**
 * StuLink API Client
 * Handles all communication with the backend server
 */

const API_BASE_URL = 'http://localhost:3000/api';
const WS_URL       = 'http://localhost:3000';

class StuLinkAPI {
  constructor() {
    this.token  = localStorage.getItem('sl_token');
    this.socket = null;
  }

  // ==================== AUTH ====================

  async register(userData) {
    const data = await this._fetch('/auth/register', 'POST', userData);
    if (data.token) {
      this.token = data.token;
      localStorage.setItem('sl_token', data.token);
    }
    return data;
  }

  async login(email, password) {
    const data = await this._fetch('/auth/login', 'POST', { email, password });
    if (data.token) {
      this.token = data.token;
      localStorage.setItem('sl_token', data.token);
    }
    return data;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('sl_token');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // ==================== USERS ====================

  async getCurrentUser() {
    return this._fetch('/users/me');
  }

  async updateProfile(profileData) {
    return this._fetch('/users/me', 'PUT', profileData);
  }

  async buyPro() {
    return this._fetch('/users/pro/buy', 'POST');
  }

  async getPublicProfile(userId) {
    // Public endpoint, no auth required
    const res = await fetch(`${API_BASE_URL}/users/${userId}/public`);
    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Non-JSON response:', text);
      throw new Error('Server returned invalid JSON');
    }
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }

  // ==================== POSTS ====================

  async createPost(postData) {
    return this._fetch('/posts', 'POST', postData);
  }

  async getPosts(type = null, page = 1, limit = 10, filters = {}) {
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    params.append('page', page);
    params.append('limit', limit);
    if (filters.cat) params.append('cat', filters.cat);
    if (filters.minPrice) params.append('minPrice', filters.minPrice);
    if (filters.maxPrice) params.append('maxPrice', filters.maxPrice);
    if (filters.sortBy) params.append('sortBy', filters.sortBy);
    if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);
    return this._fetch(`/posts?${params.toString()}`);
  }

  async takePost(postId) {
    return this._fetch(`/posts/${postId}/take`, 'POST');
  }

  // сдача без файла (если вдруг нужно)
  async submitPost(postId) {
    return this._fetch(`/posts/${postId}/submit`, 'POST');
  }

  /**
   * Сдача работы с файлом.
   * Второй аргумент может быть:
   *  - File / Blob
   *  - FormData (если ты заранее собрал его во frontend)
   */
  // Сдача работы с файлом
async submitPostWithFile(postId, payload) {
  // payload может быть либо FormData, либо File
  let body;

  if (payload instanceof FormData) {
    body = payload;
  } else {
    body = new FormData();
    if (payload) {
      body.append('file', payload); // backend ждёт поле "file"
    }
  }

  const url = `${API_BASE_URL}/posts/${postId}/submit`;
  console.log('SUBMIT FILE →', url); // чтобы в консоли видеть точный URL

  const res  = await fetch(url, {
    method: 'POST',
    headers: {
      // НЕ ставим Content-Type, иначе сломаем multipart/form-data
      'Authorization': `Bearer ${this.token || ''}`
    },
    body
  });

  const text = await res.text();      // читаем как текст, БЕЗ res.json()
  console.log('SUBMIT RESPONSE RAW:', text.slice(0, 200));

  let data = {};
  try {
    data = JSON.parse(text);          // пробуем распарсить JSON
  } catch (e) {
    // если пришёл HTML или обычный текст — просто логируем,
    // но не кидаем "Unexpected token '<'"
    console.warn('Response is not JSON, keeping raw text.');
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(data.error || 'Submit failed');
  }

  return data;
}


  async approvePost(postId, rating, review) {
    return this._fetch(`/posts/${postId}/approve`, 'POST', { rating, review });
  }

  async savePost(postId) {
    return this._fetch(`/posts/${postId}/save`, 'POST');
  }

  async getSavedPosts(page = 1, limit = 10) {
    return this._fetch(`/posts/saved?page=${page}&limit=${limit}`);
  }

  // ==================== CANCELLATION & DISPUTES ====================

  async cancelPost(postId, reason, description = '') {
    return this._fetch(`/posts/${postId}/cancel`, 'POST', { reason, description });
  }

  async approveCancellation(postId, refundPercentage = 100) {
    return this._fetch(`/posts/${postId}/cancel/approve`, 'POST', { refundPercentage });
  }

  async rejectCancellation(postId) {
    return this._fetch(`/posts/${postId}/cancel/reject`, 'POST');
  }

  async openDispute(postId, reason, description, attachments = []) {
    const formData = new FormData();
    formData.append('reason', reason);
    formData.append('description', description);
    attachments.forEach(file => formData.append('attachments', file));

    const url = `${API_BASE_URL}/posts/${postId}/dispute`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token || ''}`
      },
      body: formData
    });

    const text = await res.text();
    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Non-JSON response:', text);
      throw new Error('Server returned invalid JSON');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  async getDisputes() {
    return this._fetch('/disputes');
  }

  // ==================== WALLET ====================

  async topUp(amount) {
    return this._fetch('/wallet/topup', 'POST', { amount });
  }

  async withdraw(amount) {
    return this._fetch('/wallet/withdraw', 'POST', { amount });
  }

  async getTransactions() {
    return this._fetch('/wallet/transactions');
  }

  // ==================== CHAT ====================

  initChat(onMessageReceived, onNotificationReceived) {
    if (this.socket || !this.token) return;

    this.socket = io(WS_URL, {
      auth: { token: this.token }
    });

    this.socket.on('connect', () => {
      console.log('Chat connected');
      this.socket.emit('JOIN_ROOM');
      // Request notifications on connect
      this.socket.emit('GET_NOTIFICATIONS');
    });

    this.socket.on('RECEIVE_MESSAGE', (message) => {
      if (onMessageReceived) onMessageReceived(message);
    });

    // Handle real-time notifications
    this.socket.on('NEW_NOTIFICATION', (notification) => {
      if (onNotificationReceived) onNotificationReceived(notification);
    });

    this.socket.on('NOTIFICATIONS_LIST', (notifications) => {
      if (onNotificationReceived) {
        // Send each notification individually for consistency
        notifications.forEach(notif => {
          onNotificationReceived(notif);
        });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Chat disconnected');
    });
  }

  sendMessage(toId, text) {
    if (!this.socket) throw new Error('Chat not initialized');
    this.socket.emit('SEND_MESSAGE', { toId, text });
  }

  async getMessages(targetId) {
    return this._fetch(`/messages/${targetId}`);
  }

  // ==================== NOTIFICATIONS ====================

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

  // ==================== ADMIN ====================

  async getAdminStats() {
    return this._fetch('/admin/stats');
  }

  async getAdminUsers(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._fetch(`/admin/users?${query}`);
  }

  async banUser(userId, reason = '') {
    return this._fetch(`/admin/users/${userId}/ban`, 'POST', { reason });
  }

  async unbanUser(userId) {
    return this._fetch(`/admin/users/${userId}/unban`, 'POST');
  }

  async verifyUserAdmin(userId) {
    return this._fetch(`/admin/users/${userId}/verify`, 'POST');
  }

  async unverifyUser(userId) {
    return this._fetch(`/admin/users/${userId}/unverify`, 'POST');
  }

  async getAdminPosts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._fetch(`/admin/posts?${query}`);
  }

  async deletePost(postId) {
    return this._fetch(`/admin/posts/${postId}`, 'DELETE');
  }

  async getAdminDisputes(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._fetch(`/admin/disputes?${query}`);
  }

  async resolveDispute(disputeId, resolution, refundToClient = false, refundPercentage = 100) {
    return this._fetch(`/admin/disputes/${disputeId}/resolve`, 'POST', {
      resolution,
      refundToClient,
      refundPercentage
    });
  }

  async getAdminTransactions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this._fetch(`/admin/transactions?${query}`);
  }

  async getAdminBalance() {
    return this._fetch('/admin/financials/balance');
  }

  async getAdminCommissionHistory() {
    return this._fetch('/admin/financials/commissions');
  }

  async adminWithdrawRevenue() {
    return this._fetch('/admin/financials/withdraw', 'POST');
  }

  async seedAdmin(secretKey) {
    return this._fetch('/admin/seed', 'POST', { secretKey });
  }

  // ==================== HELPERS ====================

  async _fetch(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token || ''}`
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res  = await fetch(`${API_BASE_URL}${endpoint}`, options);
    const text = await res.text();

    let data = {};
    try {
      data = JSON.parse(text);
    } catch (e) {
      // если вдруг backend вернул не JSON
      console.error('Non-JSON response:', text);
      throw new Error('Server returned invalid JSON');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }
}

window.API = new StuLinkAPI();
