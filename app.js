/**
 * StuLink Frontend – режим работы с backend API
 * Всё (пользователи, посты, чат, кошелёк) идёт через API и MongoDB
 */

const app = {
   data: {
    currentUser: null,
    currentFeedType: 'job',
    currentFeedView: 'all', // 'all' or 'saved'
    chatTarget: null,
    notifications: [],
    tempReviewTaskId: null,   // для модалки оценки
    tempSubmitPostId: null,    // для модалки сдачи работы
    feedPage: 1,
    feedHasMore: true,
    feedFilters: {
      cat: '',
      minPrice: '',
      maxPrice: '',
      sortBy: 'createdAt',
      sortOrder: 'desc'
    },
    searchTimeout: null // For debounced search
  },


    // ================== 1. ИНИЦИАЛИЗАЦИЯ ==================
    init: async function () {
        console.log('StuLink app init (backend mode)');

        // Старый локальный режим нам больше не нужен
        localStorage.removeItem('sl_users_v11');
        localStorage.removeItem('sl_posts_v11');
        localStorage.removeItem('sl_messages_v11');
        localStorage.removeItem('sl_transactions_v11');
        localStorage.removeItem('sl_session_v11');

        // Пытаемся восстановить сессию по токену из API
        if (API.token) {
            try {
                this.data.currentUser = await API.getCurrentUser();
                // Initialize chat and notifications
                API.initChat(
                    (msg) => this.handleNewMessage(msg),
                    (notif) => this.handleNewNotification(notif)
                );
                // Load notifications from API
                await this.loadNotifications();
            } catch (e) {
                console.warn('Token invalid, logout');
                API.logout();
                this.data.currentUser = null;
            }
        }

        this.injectNavLinks();
        this.updateNav();
        this.router('home');

        // Initialize theme from localStorage
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeIcon(savedTheme);

        // Подключаем поиск с debounce (300ms)
        const search = document.getElementById('feedSearch');
        if (search) {
            search.addEventListener('input', (e) => {
                clearTimeout(this.data.searchTimeout);
                this.data.searchTimeout = setTimeout(() => {
                    this.data.feedPage = 1;
                    this.data.feedHasMore = true;
                    this.renderFeed();
                }, 300);
            });
        }

        // Initialize mobile menu
        this.initMobileMenu();
        
        // Initialize click-outside for notifications
        this.initClickOutsideNotifications();
        
        // Initialize i18n
        const savedLang = localStorage.getItem('language') || 'ru';
        this.selectLanguage(savedLang);
        
        // Close language dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const langWrapper = document.getElementById('langSwitcherDesktop');
            const dropdown = document.getElementById('langDropdown');
            if (langWrapper && dropdown && !langWrapper.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
    },

    initMobileMenu: function() {
        // Mobile menu is handled by toggleMobileDrawer
        // This function exists for compatibility
    },

    // ================== 2. UI & NAVIGATION ==================
    injectNavLinks: function () {
        const navGuest = document.getElementById('navGuest');
        const navUser = document.getElementById('navUser');

        if (navGuest && !document.getElementById('navBtnFeedGuest')) {
            const btn = document.createElement('button');
            btn.id = 'navBtnFeedGuest';
            btn.className = 'btn btn-secondary';
            btn.innerText = '🔍 Лента';
            btn.onclick = () => app.router('feed');
            navGuest.prepend(btn);
        }

        if (navUser && !document.getElementById('navBtnFeedUser')) {
            const btn = document.createElement('button');
            btn.id = 'navBtnFeedUser';
            btn.className = 'btn btn-secondary btn-icon';
            btn.innerHTML = '<i class="fas fa-search"></i>';
            btn.onclick = () => app.router('feed');
            navUser.prepend(btn);
        }
    },

    router: function (pageId) {
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
            p.style.opacity = '0';
        });

        const p = document.getElementById(pageId);
        if (p) {
            p.classList.add('active');
            setTimeout(() => p.style.opacity = '1', 50);
            window.scrollTo(0, 0);
        }

        if (pageId === 'feed') this.renderFeed();
        if (pageId === 'profile') this.renderProfile();
        if (pageId === 'admin') this.renderAdmin();

        this.updateNav();
    },

    // Switch feed type and update active tab
    switchFeed: function(type) {
        // Remove active class from all tabs
        document.querySelectorAll('.tab-btn, .feed-tab').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Add active class to clicked tab
        setTimeout(() => {
            const tabs = document.querySelectorAll('.tab-btn, .feed-tab');
            tabs.forEach(btn => {
                const btnText = btn.textContent || '';
                if (type === 'job' && btnText.includes('Заказы')) {
                    btn.classList.add('active');
                } else if (type === 'gig' && btnText.includes('Услуги')) {
                    btn.classList.add('active');
                } else if (type === 'saved' && btnText.includes('Избранное')) {
                    btn.classList.add('active');
                }
            });
        }, 50);
        
        // Update feed view
        if (type === 'saved') {
            this.data.currentFeedView = 'saved';
            this.renderFeed(null);
        } else {
            this.data.currentFeedView = 'all';
            this.renderFeed(type);
        }
    },

    // ================== 3. ЛЕНТА ==================
    renderFeed: async function (forceType = null, append = false) {
    if (forceType) {
        this.data.currentFeedType = forceType;
        this.data.feedPage = 1;
        this.data.feedHasMore = true;
    }
    const type = this.data.currentFeedType;

    // Reset grid if not appending
    if (!append) {
        const grid = document.getElementById('feedGrid');
        if (grid) grid.innerHTML = '';
    }

    const header = document.querySelector('#feed .feed-header');
    const oldTabs = document.getElementById('feedTypeTabs');
    if (oldTabs) oldTabs.remove();

    const tabsHtml = `
    <div id="feedTypeTabs" style="width:100%; display:flex; gap:15px; margin-bottom:25px; padding:0 5px;">
        <button class="feed-tab tab-btn ${this.data.currentFeedView==='all' && type === 'job' ? 'active' : ''}"
            onclick="app.switchFeed('job')"
            style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-weight:700; background:#f1f5f9; color:#64748b; display:flex; align-items:center; justify-content:center; gap:8px;">
            <div style="background:#e0f2fe; padding:6px; border-radius:8px; color:#0284c7;">🔥</div>
            <div><div style="font-size:0.9rem;" data-i18n="FEED_TAB_JOBS">Заказы</div></div>
        </button>
        <button class="feed-tab tab-btn ${this.data.currentFeedView==='all' && type === 'gig' ? 'active' : ''}"
            onclick="app.switchFeed('gig')"
            style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-weight:700; background:#f1f5f9; color:#64748b; display:flex; align-items:center; justify-content:center; gap:8px;">
            <div style="background:#fce7f3; padding:6px; border-radius:8px; color:#db2777;">💼</div>
            <div><div style="font-size:0.9rem;" data-i18n="FEED_TAB_GIGS">Услуги</div></div>
        </button>
        ${this.data.currentUser ? `
        <button class="feed-tab tab-btn ${this.data.currentFeedView==='saved' ? 'active' : ''}"
            onclick="app.switchFeed('saved')"
            style="flex:1; padding:12px; border-radius:12px; border:none; cursor:pointer; font-weight:700; background:#f1f5f9; color:#64748b; display:flex; align-items:center; justify-content:center; gap:8px;">
            <div style="background:#fef3c7; padding:6px; border-radius:8px; color:#b45309;">❤️</div>
            <div><div style="font-size:0.9rem;" data-i18n="FEED_TAB_SAVED">Избранное</div></div>
        </button>
        ` : ''}
    </div>`;

        if (header) {
            const h2 = header.querySelector('h2');
            if (h2 && !document.getElementById('feedTypeTabs')) {
                h2.insertAdjacentHTML('afterend', tabsHtml);
                // Apply translations to newly created tabs
                const currentLang = localStorage.getItem('language') || 'ru';
                this.changeLanguage(currentLang);
                
                // Set default active tab (Orders/Job)
                setTimeout(() => {
                    const jobTab = Array.from(document.querySelectorAll('.tab-btn, .feed-tab')).find(btn => 
                        btn.textContent.includes('Заказы') || btn.textContent.includes('Orders')
                    );
                    if (jobTab && type === 'job') {
                        jobTab.classList.add('active');
                    }
                }, 100);
            }
        }

    // Render filter bar
    this.renderFilterBar();

    const grid = document.getElementById('feedGrid');
    if (!grid) return;

    const me = this.data.currentUser;
    const myId = me ? String(me._id || me.id) : null;

    const icons = { dev: '💻', design: '🎨', text: '✍️', study: '📚' };

    // Show skeleton loading while fetching
    if (!append) {
        grid.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            grid.innerHTML += `
                <div class="glass-card skeleton-card skeleton" style="padding:20px;">
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;">
                        <div class="skeleton-avatar skeleton"></div>
                        <div style="flex:1;">
                            <div class="skeleton-text short skeleton" style="margin-bottom:5px;"></div>
                            <div class="skeleton-text medium skeleton"></div>
                        </div>
                    </div>
                    <div class="skeleton-title skeleton" style="margin-bottom:10px;"></div>
                    <div class="skeleton-text long skeleton" style="margin-bottom:8px;"></div>
                    <div class="skeleton-text long skeleton" style="width:70%;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
                        <div class="skeleton-price skeleton"></div>
                        <div class="skeleton-text short skeleton" style="width:80px;"></div>
                    </div>
                </div>
            `;
        }
    }

    try {
        // Get filter values
        const searchEl = document.getElementById('feedSearch');
        const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
        
        // Build filters for API
        const filters = {
            cat: this.data.feedFilters.cat,
            minPrice: this.data.feedFilters.minPrice,
            maxPrice: this.data.feedFilters.maxPrice,
            sortBy: this.data.feedFilters.sortBy,
            sortOrder: this.data.feedFilters.sortOrder
        };

        // Fetch posts - either saved or regular feed
        let result;
        if (this.data.currentFeedView === 'saved' && this.data.currentUser) {
            result = await API.getSavedPosts(this.data.feedPage, 10);
        } else {
            result = await API.getPosts(type, this.data.feedPage, 10, filters);
        }
        
        // Handle both old format (array) and new format (object with posts and pagination)
        let posts = [];
        let pagination = null;
        
        if (Array.isArray(result)) {
            posts = result;
        } else if (result && result.posts) {
            posts = result.posts;
            pagination = result.pagination;
        } else {
            posts = [];
        }

        // Client-side search filter (if search is not empty)
        let filteredPosts = posts;
        if (q) {
            filteredPosts = posts.filter(p => {
                const title = (p.title || '').toLowerCase();
                const desc  = (p.desc || p.description || '').toLowerCase();
                const cat   = (p.cat || p.category || '').toLowerCase();
                return title.includes(q) || desc.includes(q) || cat.includes(q);
            });
        }

        // Filter closed tasks (only show to participants)
        // Skip type filter for saved posts
        if (this.data.currentFeedView !== 'saved') {
            filteredPosts = filteredPosts.filter(p => {
                if (p.type !== type) return false;
                const status = p.status || 'open';
                if (status === 'open') return true;
                if (!me) return false;

                const authorId   = String(p.author?._id   || p.authorId   || '');
                const assigneeId = String(p.assignee?._id || p.assigneeId || '');
                return authorId === myId || assigneeId === myId;
            });
        } else {
            // For saved posts, only filter by status
            filteredPosts = filteredPosts.filter(p => {
                const status = p.status || 'open';
                if (status === 'open') return true;
                if (!me) return false;

                const authorId   = String(p.author?._id   || p.authorId   || '');
                const assigneeId = String(p.assignee?._id || p.assigneeId || '');
                return authorId === myId || assigneeId === myId;
            });
        }

        if (!append && !filteredPosts.length) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:#94a3b8; font-style:italic;">Пусто... Пока что.</div>`;
            return;
        }

        // Update pagination state
        if (pagination) {
            this.data.feedHasMore = this.data.feedPage < pagination.pages;
        } else {
            this.data.feedHasMore = filteredPosts.length >= 10;
        }

        // Render posts
        filteredPosts.forEach((post, index) => {
            const postId = post._id || post.id;
            const cat    = post.cat || post.category || 'dev';
            const icon   = icons[cat] || '🔥';
            const status = post.status || 'open';
            const price  = post.price || 0;
            const title  = post.title || 'Без названия';
            const desc   = post.desc || post.description || '';

            // ---------- АВТОР ----------
            let authorId   = '';
            let authorName = 'Автор';

            if (post.author && typeof post.author === 'object') {
                authorId   = String(post.author._id || post.author.id || '');
                authorName = post.author.name || post.authorName || 'Автор';
            } else {
                authorId   = String(post.authorId || post.clientId || '');
                authorName = post.authorName || post.clientName || 'Автор';
            }

            // ---------- ИСПОЛНИТЕЛЬ ----------
            let assigneeId   = '';
            let assigneeName = 'Исполнитель';

            if (post.assignee && typeof post.assignee === 'object') {
                assigneeId   = String(post.assignee._id || post.assignee.id || '');
                assigneeName = post.assignee.name || post.assigneeName || 'Исполнитель';
            } else {
                assigneeId   = String(post.assigneeId || post.workerId || '');
                assigneeName = post.assigneeName || 'Исполнитель';
            }

            const isMyPost   = myId && authorId   && (authorId   === myId);
            const isAssignee = myId && assigneeId && (assigneeId === myId);

            // ---------- БЕЙДЖ СТАТУСА ----------
            let statusBadge = '';
            if (status === 'in_progress') {
                statusBadge = '<div style="margin-bottom:10px;"><span class="badge" style="background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe;">⚡ В работе</span></div>';
            } else if (status === 'review') {
                statusBadge = '<div style="margin-bottom:10px;"><span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">👀 На проверке</span></div>';
            } else if (status === 'completed') {
                statusBadge = '<div style="margin-bottom:10px;"><span class="badge" style="background:#dcfce7; color:#166534; border:1px solid #bbf7d0;">✅ Выполнено</span></div>';
            } else if (status === 'cancelled') {
                statusBadge = '<div style="margin-bottom:10px;"><span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca;">❌ Отменено</span></div>';
            }
            
            // Show cancellation request badge
            if (post.cancellationRequested && post.cancellationStatus === 'pending') {
                statusBadge += '<div style="margin-bottom:10px;"><span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a;">⏳ Запрос на отмену</span></div>';
            }
            
            // Show dispute badge
            if (post.disputeOpened && post.disputeStatus === 'open') {
                statusBadge += '<div style="margin-bottom:10px;"><span class="badge" style="background:#fee2e2; color:#991b1b; border:1px solid #fecaca;">⚖️ Спор открыт</span></div>';
            }

            // ---------- КНОПКИ ДЕЙСТВИЙ ----------
            let actionBtn = '';

            if (!me) {
                actionBtn = `<button class="btn btn-secondary btn-sm" onclick="app.router('login')">Войти</button>`;
            } else {
                // ОТКРЫТЫЙ заказ/услуга
                if (status === 'open') {
                    if (isMyPost) {
                        actionBtn = `<span style="font-size:0.8rem; color:#94a3b8; font-weight:500;">Ваше объявление</span>`;
                    } else {
                        if (type === 'job' && me.role === 'Freelancer') {
                            actionBtn = `<button class="btn btn-primary btn-sm" onclick="app.takeTask('${postId}')">Взять заказ</button>`;
                        } else if (type === 'gig' && me.role === 'Client') {
                            actionBtn = `<button class="btn btn-primary btn-sm" onclick="app.takeTask('${postId}')">Заказать</button>`;
                        } else {
                            actionBtn = `<span style="font-size:0.75rem; color:#94a3b8; opacity:0.6;">Недоступно для вашей роли</span>`;
                        }
                    }
                }

                // В РАБОТЕ
                else if (status === 'in_progress') {
                    const iAmWorker = !!isAssignee;  // я исполнитель
                    const iAmOwner  = !!isMyPost;    // я создатель заказа
                    const cancellationRequested = post.cancellationRequested;
                    const cancellationPending = post.cancellationStatus === 'pending';

                    if (iAmWorker) {
                        const partnerId   = authorId;
                        const partnerName = authorName || 'Клиент';

                        actionBtn = `
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-secondary btn-sm"
                                onclick="app.openChat('${partnerId}', '${partnerName}')">💬 Чат</button>
                            <button class="btn btn-primary btn-sm"
                                onclick="app.openSubmitModal('${postId}')">Сдать</button>
                            ${!cancellationRequested ? `<button class="btn btn-danger btn-sm" onclick="app.openCancelModal('${postId}')">Отменить</button>` : ''}
                            ${cancellationPending && post.cancellationRequestedBy && String(post.cancellationRequestedBy) !== String(myId) ? 
                                `<div style="display:flex; gap:4px;">
                                    <button class="btn btn-success btn-sm" onclick="app.approveCancellation('${postId}')">✓ Принять</button>
                                    <button class="btn btn-danger btn-sm" onclick="app.rejectCancellation('${postId}')">✗ Отклонить</button>
                                </div>` : ''}
                        </div>`;
                    } else if (iAmOwner && assigneeId) {
                        const partnerId   = assigneeId;
                        const partnerName = assigneeName || 'Исполнитель';

                        actionBtn = `
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-secondary btn-sm"
                                onclick="app.openChat('${partnerId}', '${partnerName}')">
                                💬 Чат с исполнителем
                            </button>
                            ${!cancellationRequested ? `<button class="btn btn-danger btn-sm" onclick="app.openCancelModal('${postId}')">Отменить</button>` : ''}
                            ${cancellationPending && post.cancellationRequestedBy && String(post.cancellationRequestedBy) !== String(myId) ? 
                                `<div style="display:flex; gap:4px;">
                                    <button class="btn btn-success btn-sm" onclick="app.approveCancellation('${postId}')">✓ Принять</button>
                                    <button class="btn btn-danger btn-sm" onclick="app.rejectCancellation('${postId}')">✗ Отклонить</button>
                                </div>` : ''}
                        </div>`;
                    } else {
                        actionBtn = `<span style="font-size:0.75rem; color:#94a3b8;">Недоступно</span>`;
                    }
                }

                // НА ПРОВЕРКЕ
                else if (status === 'review') {
                    const iAmOwner  = !!isMyPost;
                    const iAmWorker = !!isAssignee;
                    const cancellationRequested = post.cancellationRequested;
                    const cancellationPending = post.cancellationStatus === 'pending';

                    if (iAmOwner) {
                        actionBtn = `
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <button class="btn btn-success btn-sm" onclick="app.approveTask('${postId}')">Принять и оценить</button>
                            ${!cancellationRequested ? `<button class="btn btn-danger btn-sm" onclick="app.openCancelModal('${postId}')">Отменить</button>` : ''}
                            ${cancellationPending && post.cancellationRequestedBy && String(post.cancellationRequestedBy) !== String(myId) ? 
                                `<div style="display:flex; gap:4px;">
                                    <button class="btn btn-success btn-sm" onclick="app.approveCancellation('${postId}')">✓ Принять</button>
                                    <button class="btn btn-danger btn-sm" onclick="app.rejectCancellation('${postId}')">✗ Отклонить</button>
                                </div>` : ''}
                        </div>`;
                    } else if (iAmWorker) {
                        actionBtn = `
                        <div style="display:flex; gap:8px; flex-wrap:wrap;">
                            <span style="font-size:0.8rem; color:#b45309">Ждём проверки...</span>
                            ${!cancellationRequested ? `<button class="btn btn-danger btn-sm" onclick="app.openCancelModal('${postId}')">Отменить</button>` : ''}
                        </div>`;
                    } else {
                        actionBtn = `<span style="font-size:0.75rem; color:#94a3b8;">Недоступно</span>`;
                    }
                }

                // ОТМЕНЕНО
                else if (status === 'cancelled') {
                    actionBtn = `<span style="font-size:0.8rem; color:#ef4444; font-weight:600;">❌ Отменено</span>`;
                }
            }

            // Check if post is saved
            const isSaved = me && me.savedPosts && me.savedPosts.some(id => String(id) === String(postId));
            const heartIcon = isSaved ? '❤️' : '🤍';
            
            const html = `
            <div class="glass-card task-card anim-fade-up ${status !== 'open' ? 'task-card-active' : ''}"
                 style="animation-delay:${index * 0.03}s;">
                ${me ? `<button class="favorite-btn" data-saved="${isSaved}" onclick="app.toggleSavePost('${postId}')" title="${isSaved ? 'Удалить из избранного' : 'Добавить в избранное'}">${heartIcon}</button>` : ''}
                <div class="card-header">
                    <div class="user-info" style="cursor:pointer; display:flex; align-items:center; gap:10px; flex-wrap:wrap;" onclick="app.viewPublicProfile('${authorId}')">
                        <div class="avatar sm" style="background:#e2e8f0; color:#475569;">${authorName[0]}</div>
                        <div class="user-name" style="font-weight:700; font-size:0.95rem;">${authorName}</div>
                        <span class="badge task-category-badge" style="font-weight:600; font-size:0.7rem; padding:4px 8px;">${icon} ${cat.toUpperCase()}</span>
                    </div>
                </div>
                ${statusBadge}
                <h3 class="task-title" style="margin-bottom:8px; font-size:1.1rem; font-weight:700; padding-right:40px;">${title}</h3>
                <p class="task-desc" style="font-size:0.9rem; line-height:1.4; margin-bottom:15px; min-height:40px;">${desc}</p>
                <div class="task-footer" style="display:flex; justify-content:space-between; align-items:center; padding-top:12px;">
                    <span class="price" style="font-size:1.1rem; font-weight:700;">${price} ₸</span>
                    ${actionBtn}
                </div>
            </div>`;

            grid.innerHTML += html;
        });

        // Remove old "Load More" button if exists
        const oldLoadMore = document.getElementById('loadMoreBtn');
        if (oldLoadMore) oldLoadMore.remove();

        // Add "Load More" button if there are more pages
        if (this.data.feedHasMore && !append) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'loadMoreBtn';
            loadMoreBtn.className = 'btn btn-secondary btn-full';
            loadMoreBtn.style.marginTop = '20px';
            loadMoreBtn.innerText = 'Загрузить ещё';
            loadMoreBtn.onclick = () => {
                this.data.feedPage++;
                this.renderFeed(null, true);
            };
            grid.appendChild(loadMoreBtn);
        }

    } catch (err) {
        console.error(err);
        if (!append) {
            grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:60px; color:#ef4444;">Ошибка загрузки ленты</div>`;
        }
    }
},

    // Render filter bar
    renderFilterBar: function() {
        const header = document.querySelector('#feed .feed-header');
        if (!header) return;

        let filterBar = document.getElementById('filterBar');
        if (!filterBar) {
            filterBar = document.createElement('div');
            filterBar.id = 'filterBar';
            filterBar.className = 'filter-bar';
            header.appendChild(filterBar);
        }

        filterBar.innerHTML = `
            <div class="filter-row">
                <select id="filterCat" class="filter-select" onchange="app.applyFilters()">
                    <option value="">Все категории</option>
                    <option value="dev">IT & Разработка</option>
                    <option value="design">Дизайн</option>
                    <option value="text">Текст / Перевод</option>
                    <option value="study">Учеба</option>
                </select>
                <input type="number" id="filterMinPrice" placeholder="Мин. цена" class="filter-input" onchange="app.applyFilters()">
                <input type="number" id="filterMaxPrice" placeholder="Макс. цена" class="filter-input" onchange="app.applyFilters()">
                <select id="filterSort" class="filter-select" onchange="app.applyFilters()">
                    <option value="createdAt-desc">Новые сначала</option>
                    <option value="createdAt-asc">Старые сначала</option>
                    <option value="price-desc">Дорогие сначала</option>
                    <option value="price-asc">Дешевые сначала</option>
                </select>
            </div>
        `;

        // Restore filter values
        if (this.data.feedFilters.cat) {
            document.getElementById('filterCat').value = this.data.feedFilters.cat;
        }
        if (this.data.feedFilters.minPrice) {
            document.getElementById('filterMinPrice').value = this.data.feedFilters.minPrice;
        }
        if (this.data.feedFilters.maxPrice) {
            document.getElementById('filterMaxPrice').value = this.data.feedFilters.maxPrice;
        }
        const sortValue = `${this.data.feedFilters.sortBy}-${this.data.feedFilters.sortOrder}`;
        document.getElementById('filterSort').value = sortValue;
    },

    // Apply filters
    applyFilters: function() {
        const cat = document.getElementById('filterCat')?.value || '';
        const minPrice = document.getElementById('filterMinPrice')?.value || '';
        const maxPrice = document.getElementById('filterMaxPrice')?.value || '';
        const sort = document.getElementById('filterSort')?.value || 'createdAt-desc';
        const [sortBy, sortOrder] = sort.split('-');

        this.data.feedFilters = { cat, minPrice, maxPrice, sortBy, sortOrder };
        this.data.feedPage = 1;
        this.data.feedHasMore = true;
        this.renderFeed();
    },

    // Initialize mobile menu
    initMobileMenu: function() {
        // Mobile menu will be handled in CSS
        const nav = document.querySelector('nav');
        if (!nav) return;

        // Add hamburger button for mobile
        if (!document.getElementById('mobileMenuBtn')) {
            const hamburger = document.createElement('button');
            hamburger.id = 'mobileMenuBtn';
            hamburger.className = 'mobile-menu-btn';
            hamburger.innerHTML = '<i class="fas fa-bars"></i>';
            hamburger.onclick = () => this.toggleMobileMenu();
            nav.insertBefore(hamburger, nav.firstChild);
        }
    },

    // Toggle mobile menu
    toggleMobileMenu: function() {
        const nav = document.querySelector('nav');
        if (nav) nav.classList.toggle('mobile-menu-open');
    },

    // ======== Модалка сдачи работы ========

    // открыть модалку "Сдать работу"
    openSubmitModal: function (postId) {
        this.data.tempSubmitPostId = postId;

        const modal = document.getElementById('submitModal');
        if (!modal) {
            alert('Ошибка: submitModal не найден');
            return;
        }

        const fileInput = document.getElementById('submitFileInput');
        if (fileInput) fileInput.value = '';

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    },

    // закрыть модалку "Сдать работу"
    closeSubmitModal: function () {
        const modal = document.getElementById('submitModal');
        if (!modal) return;

        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 150);
    },

    // реально отправляем файл на backend (multipart/form-data)
 confirmSubmitWithFile: async function () {
    const postId = this.data.tempSubmitPostId;
    const input  = document.getElementById('submitFileInput');

    if (!this.data.currentUser) {
        this.toast('Сначала войдите');
        return;
    }

    if (!postId) {
        this.toast('Ошибка: не выбрана задача');
        return;
    }

    if (!input || !input.files || !input.files[0]) {
        this.toast('Прикрепите файл');
        return;
    }

    const file = input.files[0];
    const formData = new FormData();
    // ВАЖНО: имя должно быть "file", как в upload.single('file')
    formData.append('file', file);

    const token = API.token || localStorage.getItem('sl_token') || localStorage.getItem('token');
    if (!token) {
        this.toast('Нужно войти в аккаунт');
        return;
    }

    const API_ROOT = 'http://localhost:3000';

    try {
        const res = await fetch(`${API_ROOT}/api/posts/${postId}/submit`, {
            method: 'POST',
            headers: {
                // НЕ ставим Content-Type, тогда браузер сам поставит multipart/form-data
                'Authorization': 'Bearer ' + token
            },
            body: formData
        });

        // СНАЧАЛА читаем как текст, чтобы не ловить "Unexpected token '<'"
        const text = await res.text();
        console.log('SUBMIT RAW RESPONSE:', text);

        let data = {};
        try {
            data = JSON.parse(text);
        } catch (e) {
            // здесь окажется HTML-страница с ошибкой Express
            console.warn('Ответ не JSON, возможно, это страница ошибки Express.');
        }

        if (!res.ok) {
            throw new Error((data && data.error) || 'Ошибка отправки работы');
        }

        this.closeSubmitModal();
        await this.renderFeed();
        this.toast('📨 Работа отправлена на проверку');

    } catch (e) {
        console.error('SUBMIT ERROR:', e);
        this.toast(e.message || 'Ошибка при отправке работы');
    }
},


    // ================== 4. WORKFLOW (TAKE / SUBMIT / REVIEW) ==================
    takeTask: async function (postId) {
        if (!this.data.currentUser) return this.toast('Сначала войдите');

        try {
            await API.takePost(postId);
            await this.renderFeed();
            this.toast('🚀 Заказ взят!');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка при взятии заказа');
        }
    },

    submitTask: async function (postId) {
        try {
            await API.submitPost(postId);
            await this.renderFeed();
            this.toast('📨 Работа отправлена на проверку');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка при отправке');
        }
    },

   approveTask: async function (postId) {
    this.data.tempReviewTaskId = postId;

    const modal     = document.getElementById('reviewModal');
    const attachBox = document.getElementById('reviewAttachment');

    if (!modal || !attachBox) {
        this.showToast('reviewModal или reviewAttachment не найден в HTML', 'error');
        return;
    }

    let post = null;

    try {
        // берём все посты и ищем нужный
        const allPosts = await API.getPosts();
        post = allPosts.find(p => String(p._id || p.id) === String(postId));
        console.log('POST FOR REVIEW:', post);
    } catch (e) {
        console.error('Ошибка загрузки поста:', e);
    }

    // ====== ФАЙЛ ИЗ ПОЛЕЙ submissionFileUrl / submissionFileName ======
    let fileUrl  = '';
    let fileName = '';

    if (post) {
        fileUrl  = post.submissionFileUrl  || post.fileUrl  || '';
        fileName = post.submissionFileName || post.fileName || 'Файл работы';

        // сервер отдаёт /uploads/..., дополняем хостом
        if (fileUrl && fileUrl.startsWith('/')) {
            fileUrl = 'http://localhost:3000' + fileUrl;
        }
    }

    // ====== РЕНДЕР ФАЙЛА ======
    if (fileUrl) {
        attachBox.innerHTML = `
            <div style="border-radius:14px; border:1px solid #e5e7eb; padding:12px 14px; display:flex; justify-content:space-between; align-items:center; background:#f9fafb;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:#e0f2fe; display:flex; align-items:center; justify-content:center;">
                        <i class="fas fa-file-code" style="color:#0284c7;"></i>
                    </div>
                    <div>
                        <div style="font-size:0.95rem; font-weight:600;">${fileName}</div>
                        <div style="font-size:0.8rem; color:#6b7280;">Файл от исполнителя</div>
                    </div>
                </div>
                <a href="${fileUrl}" target="_blank" class="btn btn-secondary btn-sm">
                    Скачать
                </a>
            </div>
        `;
    } else {
        attachBox.innerHTML = `
            <div style="border-radius:14px; border:1px dashed #e5e7eb; padding:12px 14px; font-size:0.85rem; color:#9ca3af;">
                Исполнитель не прикрепил файл к задаче.
            </div>
        `;
    }

    // ====== ОТКРЫТИЕ МОДАЛКИ ======
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);

    this.setStar(5);
    document.getElementById('reviewText').value = '';
},




closeReviewModal: function () {
    const modal = document.getElementById('reviewModal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.style.display = 'none';
},



// Отправка работы с файлом
submitTaskWithFile: async function () {
    if (!this.data.currentUser) return this.toast('Сначала войдите');
    if (!this.data.submitPostId) return this.toast('Ошибка: нет id задачи');

    const fileInp = document.getElementById('submitFileInput');
    const txtInp  = document.getElementById('submitCommentInput');

    const file = fileInp && fileInp.files && fileInp.files[0] ? fileInp.files[0] : null;
    const comment = txtInp ? txtInp.value.trim() : '';

    if (!file && !comment) {
        return this.toast('Прикрепите файл или добавьте комментарий');
    }

    try {
        // формируем FormData для backend
        const formData = new FormData();
        if (file)    formData.append('file', file);
        if (comment) formData.append('comment', comment);

        await API.submitPostWithFile(this.data.submitPostId, formData);

        this.closeSubmitModal();
        await this.renderFeed();
        this.toast('📨 Работа отправлена на проверку');

    } catch (e) {
        console.error(e);
        this.toast(e.message || 'Ошибка при сдаче работы');
    }
},


    setStar: function (n) {
        document.getElementById('reviewRating').value = n;
        const stars = document.querySelectorAll('.star-rating i');
        stars.forEach(s => {
            const val = parseInt(s.getAttribute('data-val'));
            if (val <= n) s.classList.add('active');
            else s.classList.remove('active');
        });
    },

   submitReview: async function () {
  const postId = this.data.tempReviewTaskId;
  const rating = Number(document.getElementById('reviewRating').value);
  const text = document.getElementById('reviewText').value;

  try {
    await API.approvePost(postId, rating, text);

    const modal = document.getElementById('reviewModal');
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 150);

    this.showToast('Оплата проведена ✅', 'success');
    this.renderFeed();
  } catch (e) {
    this.showToast('Ошибка оплаты: ' + e.message, 'error');
  }
},

    // ================== 5. КОШЕЛЁК ==================
    toggleWallet: function () {
        const modal = document.getElementById('walletModalFixed');
        if (!modal) return;

        if (modal.classList.contains('show')) {
            modal.classList.remove('show');
        } else {
            this.renderWallet();
            modal.classList.add('show');
        }
    },

    renderWallet: async function () {
        const user = this.data.currentUser;
        if (!user) return;

        const modalBox = document.querySelector('#walletModalFixed .modal-box');
        const meId = user._id || user.id;

        try {
            const transactions = await API.getTransactions();

            const history = transactions
                .filter(t => String(t.userId) === String(meId))
                .sort((a, b) => new Date(b.createdAt || b.id) - new Date(a.createdAt || a.id));

            let historyHtml = '';
            if (!history.length) {
                historyHtml = `<div style="text-align:center; color:#94a3b8; font-size:0.9rem; padding:15px;">История пуста</div>`;
            } else {
                history.forEach(t => {
                    const amt = t.amount;
                    const color = amt > 0 ? '#10b981' : '#ef4444';
                    const sign = amt > 0 ? '+' : '';
                    const date = t.createdAt ? new Date(t.createdAt) : new Date();

                    historyHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;">
                        <div style="font-size:0.85rem; color:#334155;">
                            <div style="font-weight:600;">${t.desc || t.type}</div>
                            <div style="font-size:0.75rem; color:#94a3b8;">${date.toLocaleString()}</div>
                        </div>
                        <div style="font-weight:700; color:${color};">${sign}${amt} ₸</div>
                    </div>`;
                });
            }

            modalBox.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:20px;">
                    <h3 style="font-family:'Outfit', sans-serif; font-size:1.5rem; margin:0;">Кошелёк</h3>
                    <button onclick="app.toggleWallet()" style="background:none; border:none; font-size:1.5rem; cursor:pointer;">&times;</button>
                </div>
                
                <div style="background:linear-gradient(135deg, #1e293b, #0f172a); color:white; padding:25px; border-radius:20px; text-align:center; margin-bottom:20px; box-shadow:0 10px 30px rgba(0,0,0,0.2);">
                    <div style="opacity:0.7; font-size:0.9rem;">Ваш баланс</div>
                    <div id="walletAmountDisplay" style="font-size:2.5rem; font-weight:800; font-family:'Outfit', sans-serif;">${user.balance} ₸</div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px;">
                    <button class="btn btn-secondary" onclick="app.topUp(1000)">+ 1k</button>
                    <button class="btn btn-secondary" onclick="app.topUp(5000)">+ 5k</button>
                    <button class="btn btn-secondary" onclick="app.topUp(10000)">+ 10k</button>
                    <button class="btn btn-secondary" style="border:1px solid var(--danger); color:var(--danger);" onclick="app.withdraw()">📤 Вывести</button>
                </div>
                
                <h4 style="font-size:1rem; margin-bottom:10px; color:#64748b;">История операций</h4>
                <div style="max-height:150px; overflow-y:auto; padding-right:5px;">
                    ${historyHtml}
                </div>
                <div id="walletStatus" style="text-align:center; margin-top:10px; font-size:0.9rem; color:#64748b;"></div>
            `;
        } catch (e) {
            console.error(e);
            this.toast('Ошибка кошелька');
        }
    },

    topUp: async function (amount) {
        if (!this.data.currentUser) return;

        const status = document.getElementById('walletStatus');
        if (status) status.innerText = 'Подключение к банку...';

        try {
            await API.topUp(amount);
            this.data.currentUser = await API.getCurrentUser();
            await this.renderWallet();

            const pDisplay = document.getElementById('profileBalance');
            if (pDisplay) pDisplay.innerText = this.data.currentUser.balance + ' ₸';

            this.toast(`+ ${amount} ₸`);
            if (status) status.innerText = 'Успешно!';
        } catch (e) {
            console.error(e);
            if (status) status.innerText = 'Ошибка';
            this.toast(e.message || 'Ошибка пополнения');
        }
    },

    withdraw: async function () {
        if (!this.data.currentUser) return;

        const amountStr = prompt('Введите сумму для вывода (₸):');
        if (!amountStr) return;

        const amount = parseInt(amountStr);
        if (isNaN(amount) || amount <= 0) return this.toast('Неверная сумма');

        try {
            await API.withdraw(amount);
            this.data.currentUser = await API.getCurrentUser();
            await this.renderWallet();

            const pDisplay = document.getElementById('profileBalance');
            if (pDisplay) pDisplay.innerText = this.data.currentUser.balance + ' ₸';

            this.toast(`📤 Выведено: ${amount} ₸`);
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка вывода');
        }
    },

    // ================== 6. ПРОФИЛЬ ==================
    renderProfile: async function () {
        if (!this.data.currentUser) return this.router('login');

        const user = this.data.currentUser;
        document.getElementById('profileName').innerText = user.name + (user.isPro ? ' (PRO)' : '');
        const ratingVal = user.ratingCount ? (user.ratingSum / user.ratingCount).toFixed(1) : 'New';
        document.getElementById('profileRoleBadge').innerHTML = `${user.role} &bull; ⭐ ${ratingVal}`;
        document.getElementById('profileBalance').innerText = user.balance + ' ₸';

        const avatarEl = document.getElementById('profileAvatarBig');
        if (user.photoUrl) {
            avatarEl.innerHTML = `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%; box-shadow:0 4px 6px rgba(0,0,0,0.1);">`;
            avatarEl.style.background = 'none';
        } else {
            avatarEl.innerText = user.name[0];
            avatarEl.style.background = '#e2e8f0';
        }

        const contentGrid = document.getElementById('profileContent');
        
        // CRITICAL: Clear old content to prevent duplicates
        if (contentGrid) {
            contentGrid.innerHTML = '';
        }

        const settingsHtml = `
        <div class="glass-card" style="padding:25px; margin-bottom:25px; border:1px solid #e5e7eb;">
            <h4 style="margin-bottom:20px; font-family:'Outfit', sans-serif; display:flex; align-items:center; gap:10px;">
                <i class="fas fa-cog" style="color:var(--primary);"></i> Настройки
            </h4>
            <div style="display:grid; gap:15px;">
                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:5px; display:block;">Фото профиля (URL)</label>
                    <input type="text" id="profAvatarUrl" placeholder="https://..." value="${user.photoUrl || ''}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; width:100%;">
                </div>
                <div>
                    <label style="font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:5px; display:block;">Bio</label>
                    <textarea id="profBio" rows="3" placeholder="Расскажи о себе..." style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; width:100%;">${user.bio || ''}</textarea>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                    <input type="text" id="profTg" placeholder="Telegram" value="${user.tg || ''}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                    <input type="text" id="profWa" placeholder="WhatsApp" value="${user.wa || ''}" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px;">
                </div>
                ${user.role === 'Freelancer' ? `
                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:#f8fafc; border-radius:12px; margin-top:10px;">
                    <label class="switch" style="position:relative; display:inline-block; width:50px; height:28px; margin:0;">
                        <input type="checkbox" id="workStatusToggle" ${user.openForWork !== false ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                        <span class="slider round"></span>
                    </label>
                    <span id="workStatusText" style="font-size:0.9rem; font-weight:600; color:#334155; flex:1;">${user.openForWork !== false ? '✅ Открыт для работы' : '⏸️ Занят'}</span>
                </div>
                ` : ''}
                <button class="btn btn-primary btn-sm btn-full" onclick="app.saveProfileData()" style="padding:12px; margin-top:5px;">Сохранить изменения</button>
                
                <div style="margin-top:15px; display:flex; gap:15px;">
                     ${!user.isVerified ? `<button class="btn btn-secondary btn-sm" style="flex:1; border:1px solid #e2e8f0;" onclick="app.verifyUser()">🛡️ Верификация</button>` : '<div class="glass-card" style="flex:1; text-align:center; padding:10px; color:#059669; font-weight:600; font-size:0.9rem;">✅ Verified</div>'}
                     ${!user.isPro ? `<button class="btn btn-warning btn-sm" style="flex:1; background:linear-gradient(45deg, #fbbf24, #d97706); color:white; border:none;" onclick="app.buyPro()">👑 PRO</button>` : '<div class="glass-card" style="flex:1; text-align:center; padding:10px; color:#d97706; font-weight:600; font-size:0.9rem;">👑 PRO</div>'}
                </div>
            </div>
        </div>`;

        let tasksHtml = '<h4 style="margin-bottom:15px; font-family:\'Outfit\', sans-serif;">История задач</h4>';

        // Show skeleton loading while fetching
        if (contentGrid) {
            contentGrid.innerHTML = settingsHtml + `
                <div style="margin-top:20px;">
                    ${Array.from({length: 3}, () => `
                        <div class="glass-card skeleton" style="padding:15px; margin-bottom:10px; height:80px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div style="flex:1;">
                                    <div class="skeleton-text medium skeleton" style="margin-bottom:8px;"></div>
                                    <div class="skeleton-text short skeleton" style="width:100px;"></div>
                                </div>
                                <div class="skeleton-price skeleton" style="width:80px;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        try {
            // Fetch all posts (both job and gig types)
            const resultJob = await API.getPosts('job', 1, 100, {});
            const resultGig = await API.getPosts('gig', 1, 100, {});
            
            // Handle both array and object response formats
            const postsJob = Array.isArray(resultJob) ? resultJob : (resultJob?.posts || []);
            const postsGig = Array.isArray(resultGig) ? resultGig : (resultGig?.posts || []);
            const allPosts = [...postsJob, ...postsGig];
            
            const myId = String(user._id || user.id || '');
            
            // CRITICAL FIX: Ensure unique tasks by ID to prevent duplicates
            const seenTaskIds = new Set();
            const myTasks = allPosts.filter(p => {
                const taskId = String(p._id || p.id || '');
                // Skip if we've already seen this task
                if (seenTaskIds.has(taskId)) {
                    return false;
                }
                seenTaskIds.add(taskId);
                
                const authorId = String(p.author?._id || p.authorId || '');
                const assigneeId = String(p.assignee?._id || p.assigneeId || '');
                return authorId === myId || assigneeId === myId;
            }).sort((a, b) => {
                const dateA = new Date(a.createdAt || a.id || 0);
                const dateB = new Date(b.createdAt || b.id || 0);
                return dateB - dateA;
            });
            
            // DEBUG: Log unique tasks count
            console.log('Unique Tasks Found:', myTasks.length);
            const completedCount = myTasks.filter(t => t.status === 'completed').length;
            console.log('Completed Tasks:', completedCount);

            if (!myTasks.length) {
                tasksHtml += `
                    <div class="empty-history-placeholder" style="padding:40px 20px; text-align:center;">
                        <div style="font-size:3rem; margin-bottom:15px; opacity:0.5;">📋</div>
                        <div style="color:#94a3b8; font-size:1rem; font-weight:500; margin-bottom:8px;">История пуста</div>
                        <div style="color:#cbd5e1; font-size:0.85rem;">Выполненные задачи появятся здесь</div>
                    </div>
                `;
            } else {
                myTasks.forEach(t => {
                    let statusColor = '#64748b';
                    let statusText = t.status;
                    let opacity = '1';

                    if (t.status === 'in_progress') { statusColor = '#3b82f6'; statusText = 'В работе'; }
                    else if (t.status === 'review') { statusColor = '#f59e0b'; statusText = 'Проверка'; }
                    else if (t.status === 'completed') { statusColor = '#10b981'; statusText = 'Завершено'; opacity = '0.6'; }

                    tasksHtml += `
                    <div class="glass-card" style="padding:15px; display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; opacity:${opacity};">
                        <div>
                            <div style="font-weight:700; color:#334155;">${t.title}</div>
                            <div style="font-size:0.75rem; color:${statusColor}; font-weight:800; text-transform:uppercase; margin-top:3px;">${statusText}</div>
                        </div>
                        <div style="text-align:right;">
                            <b style="color:var(--primary); font-family:'Outfit', sans-serif;">${t.price} ₸</b>
                            <div style="font-size:0.7rem; color:#94a3b8;">${t.type === 'job' ? 'Заказ' : 'Услуга'}</div>
                        </div>
                    </div>`;
                });
            }

            contentGrid.innerHTML = settingsHtml + tasksHtml;

            // Initialize toggle switch event listener
            const workStatusToggle = document.getElementById('workStatusToggle');
            if (workStatusToggle) {
                workStatusToggle.addEventListener('change', function() {
                    const statusText = document.getElementById('workStatusText');
                    if (statusText) {
                        statusText.textContent = this.checked ? '✅ Открыт для работы' : '⏸️ Занят';
                    }
                });
            }

            const lvlContainer = document.getElementById('levelContainer');
            const countVal = document.getElementById('profileActiveCount');
            const statLabel2 = document.getElementById('statLabel2');

            // CRITICAL FIX: Reset counter before setting new value
            if (countVal) {
                countVal.innerText = '0'; // Reset first
            }
            
            // Calculate stats with reset counters
            const totalTasks = myTasks.length;
            const completedTasks = myTasks.filter(t => t.status === 'completed').length;
            
            statLabel2.innerText = 'Всего задач';
            if (countVal) {
                countVal.innerText = totalTasks;
            }

            if (user.role === 'Freelancer') {
                lvlContainer.style.display = 'block';
                document.getElementById('lvlCurrent').innerText = `Lvl ${user.level || 1}`;
                document.getElementById('xpText').innerText = `${user.xp || 0} XP`;
                const percent = Math.min(100, ((user.xp || 0) / ((user.level || 1) * 1000)) * 100);
                document.getElementById('xpBar').style.width = `${percent}%`;
            } else {
                lvlContainer.style.display = 'none';
            }
        } catch (e) {
            console.error('Profile History Error:', e);
            console.error('Error details:', {
                message: e.message,
                stack: e.stack,
                user: user,
                userId: user._id || user.id
            });
            contentGrid.innerHTML = settingsHtml + `
                <div style="padding:40px 20px; text-align:center;">
                    <div style="font-size:3rem; margin-bottom:15px; opacity:0.5;">⚠️</div>
                    <div style="color:#ef4444; font-size:1rem; font-weight:500; margin-bottom:8px;">Ошибка загрузки истории</div>
                    <div style="color:#94a3b8; font-size:0.85rem;">${e.message || 'Проверьте консоль для деталей'}</div>
                </div>
            `;
        }
    },

    saveProfileData: async function () {
        const payload = {
            photoUrl: document.getElementById('profAvatarUrl').value,
            bio: document.getElementById('profBio').value,
            tg: document.getElementById('profTg').value,
            wa: document.getElementById('profWa').value
        };

        // Add work status toggle for freelancers
        if (this.data.currentUser && this.data.currentUser.role === 'Freelancer') {
            const workStatusToggle = document.getElementById('workStatusToggle');
            if (workStatusToggle) {
                payload.openForWork = workStatusToggle.checked;
            }
        }

        try {
            await API.updateProfile(payload);
            this.data.currentUser = await API.getCurrentUser();
            this.renderProfile();
            this.toast('💾 Профиль сохранён');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка сохранения профиля');
        }
    },

    verifyUser: async function () {
        try {
            await API.updateProfile({ isVerified: true });
            this.data.currentUser = await API.getCurrentUser();
            this.renderProfile();
            this.toast('✅ Верификация пройдена!');
        } catch (e) {
            console.error(e);
            this.toast('Ошибка верификации');
        }
    },

    buyPro: async function () {
        try {
            await API.buyPro();
            this.data.currentUser = await API.getCurrentUser();
            this.renderProfile();
            this.toast('👑 PRO статус получен!');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка покупки PRO');
        }
    },

    // ================== 7. CHAT ==================
    toggleChat: function () {
        const chat = document.getElementById('chatWidget');
        chat.style.display = chat.style.display === 'flex' ? 'none' : 'flex';
        if (chat.style.display === 'none') this.data.chatTarget = null;
    },

    openChat: async function (userId, name) {
        if (!this.data.currentUser) return this.toast('Сначала войдите');

        this.data.chatTarget = userId;
        const chat = document.getElementById('chatWidget');
        chat.style.display = 'flex';

        document.getElementById('chatTitle').innerText = name || 'User';

        try {
            const messages = await API.getMessages(userId);
            this.displayChatHistory(messages);
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка загрузки чата');
        }
    },

    displayChatHistory: function (messages) {
        const body = document.getElementById('chatBody');
        body.innerHTML = '';

        if (!messages || !messages.length) {
            body.innerHTML = `<div style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:20px;">Напишите первое сообщение...</div>`;
            return;
        }

        const myId = this.data.currentUser._id || this.data.currentUser.id;

        messages.forEach(m => {
            const fromId = m.fromId || m.from;
            const type = String(fromId) === String(myId) ? 'out' : 'in';
            this.renderOneMsg(m.text, type);
        });

        body.scrollTop = body.scrollHeight;
    },

    renderOneMsg: function (txt, type) {
        const body = document.getElementById('chatBody');
        const style = type === 'center'
            ? 'text-align:center;color:#94a3b8;font-size:0.75rem;margin:10px 0;'
            : `background:${type === 'out' ? 'var(--primary-grad)' : 'white'}; color:${type === 'out' ? 'white' : '#334155'}; padding:10px 14px; border-radius:14px; max-width:85%; align-self:${type === 'out' ? 'flex-end' : 'flex-start'}; box-shadow:0 2px 8px rgba(0,0,0,0.05); font-size:0.9rem; margin-bottom:8px; border:${type === 'in' ? '1px solid #f1f5f9' : 'none'};`;

        const finalStyle = style.replace('var(--primary-grad)', 'linear-gradient(135deg, #6366f1, #ec4899)');
        body.innerHTML += `<div style="${finalStyle}">${txt}</div>`;
    },

    sendMessage: function () {
        const inp = document.getElementById('chatInput');
        const txt = inp.value.trim();
        if (!txt || !this.data.chatTarget) return;

        try {
            API.sendMessage(this.data.chatTarget, txt);
            this.renderOneMsg(txt, 'out');
            const body = document.getElementById('chatBody');
            body.scrollTop = body.scrollHeight;
            inp.value = '';
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка отправки');
        }
    },

handleNewMessage: function (message) {
    if (!this.data.currentUser) return;

    const myId   = String(this.data.currentUser._id || this.data.currentUser.id);
    const fromId = String(message.fromId || message.from || '');
    const toId   = String(message.toId   || message.to   || '');

    // 1) Если это МОЁ сообщение (echo от сервера) — выходим.
    // sendMessage уже отрисовал "out", уведомление мне не нужно.
    if (fromId === myId) {
        return;
    }

    const currentTarget = this.data.chatTarget
        ? String(this.data.chatTarget)
        : null;

    // 2) Если сейчас открыт чат с отправителем — сразу рисуем входящее сообщение
    if (currentTarget && currentTarget === fromId) {
        this.renderOneMsg(message.text, 'in');
        const body = document.getElementById('chatBody');
        if (body) body.scrollTop = body.scrollHeight;
    }

    // 3) Вешаем уведомление ТОЛЬКО получателю
    const fromName =
        message.fromName ||
        message.senderName ||
        (message.fromUser && message.fromUser.name) ||
        'Сообщение';

    this.addNotification(myId, `💬 ${fromName}: ${message.text}`);
},





    // ================== 8. СОЗДАНИЕ ПОСТА ==================
    handleCreate: async function (e) {
        e.preventDefault();
        if (!this.data.currentUser) return this.toast('Нужна авторизация');

        const title = document.getElementById('createTitle').value;
        const cat = document.getElementById('createCat').value;
        const price = parseInt(document.getElementById('createPrice').value);
        const desc = document.getElementById('createDesc').value;
        const type = document.getElementById('createType').value;
        const fileInput = document.getElementById('createFileInput');

        if (!title || !desc || !price || isNaN(price)) {
            return this.toast('Заполните все поля');
        }

        // Mock file attachment (just show notification, don't actually upload)
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const fileName = fileInput.files[0].name;
            console.log('File attached (mock):', fileName);
            // In production, you would upload the file here
        }

        try {
            await API.createPost({ title, cat, price, desc, type });
            // Reset form
            document.getElementById('createTitle').value = '';
            document.getElementById('createPrice').value = '';
            document.getElementById('createDesc').value = '';
            if (fileInput) fileInput.value = '';
            
            this.router('feed');
            this.toast('✨ Опубликовано в базе!');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка создания');
        }
    },

    setPostType: function (type) {
        document.getElementById('createType').value = type;
        const btnJ = document.getElementById('typeJobBtn');
        const btnG = document.getElementById('typeGigBtn');
        if (type === 'job') {
            btnJ.classList.add('btn-primary'); btnJ.classList.remove('btn-secondary');
            btnG.classList.remove('btn-primary'); btnG.classList.add('btn-secondary');
        } else {
            btnG.classList.add('btn-primary'); btnG.classList.remove('btn-secondary');
            btnJ.classList.remove('btn-primary'); btnJ.classList.add('btn-secondary');
        }
    },

    // ================== 9. AUTH ==================
    handleLogin: async function (e) {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPass').value;

        try {
            const { user } = await API.login(email, password);
            this.data.currentUser = user;
            this.updateNav();
            this.router('home');
            this.toast(`Рады видеть, ${user.name}!`);
            // Initialize chat and notifications
            API.initChat(
                (msg) => this.handleNewMessage(msg),
                (notif) => this.handleNewNotification(notif)
            );
            // Load notifications
            await this.loadNotifications();
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка входа');
        }
    },

    handleRegister: async function (e) {
        e.preventDefault();

        const name = document.getElementById('regName').value;
        const email = document.getElementById('regEmail').value;
        const pass = document.getElementById('regPass').value;
        const role = document.getElementById('regRole').value;

        if (!name || !email || !pass) {
            return this.toast('Заполните все поля');
        }

        try {
            const { user } = await API.register({ name, email, password: pass, role });
            this.data.currentUser = user;
            this.updateNav();
            this.router('home');
            this.toast('🚀 Аккаунт создан!');
            // Initialize chat and notifications
            API.initChat(
                (msg) => this.handleNewMessage(msg),
                (notif) => this.handleNewNotification(notif)
            );
            // Load notifications
            await this.loadNotifications();
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка регистрации');
        }
    },

    logout: function () {
        API.logout();
        this.data.currentUser = null;
        this.updateNav();
        this.router('home');
        this.toast('Выход выполнен');
    },

    updateNav: function () {
        const user = this.data.currentUser;
        const navUser = document.getElementById('navUser');
        const navGuest = document.getElementById('navGuest');
        
        if (user) {
            // User is logged in - show user nav, hide guest nav
            if (navUser) {
                navUser.style.display = 'flex';
                navUser.style.visibility = 'visible';
            }
            if (navGuest) {
                navGuest.style.display = 'none';
                navGuest.style.visibility = 'hidden';
            }
            
            // Update user info
            const navName = document.getElementById('navName');
            if (navName) navName.innerText = user.name;
            
            const navAv = document.getElementById('navAvatar');
            if (navAv) {
                if (user.photoUrl) {
                    navAv.innerHTML = `<img src="${user.photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                    navAv.style.background = 'none';
                } else {
                    navAv.innerText = user.name[0];
                    navAv.style.background = '';
                }
            }
            
            // Show/hide admin button
            const adminBtn = document.getElementById('navBtnAdmin');
            if (adminBtn) {
                adminBtn.style.display = user.role === 'Admin' ? 'flex' : 'none';
            }
        } else {
            // User is not logged in - show guest nav, hide user nav
            if (navUser) {
                navUser.style.display = 'none';
                navUser.style.visibility = 'hidden';
            }
            if (navGuest) {
                navGuest.style.display = 'flex';
                navGuest.style.visibility = 'visible';
            }
            
            const adminBtn = document.getElementById('navBtnAdmin');
            if (adminBtn) adminBtn.style.display = 'none';
        }
    },

    // ================== 10. ПРОЧЕЕ ==================
    toast: function (msg) {
        // Backward compatibility - default to 'info' type
        this.showToast(msg, 'info');
    },

    // Modern toast notification system with types
    showToast: function(message, type = 'info') {
        // Remove existing toast if any
        const existingToast = document.getElementById('toast');
        if (existingToast) {
            existingToast.remove();
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = `toast toast-${type}`;

        // Icons for different types
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            info: 'fas fa-info-circle'
        };

        // Colors for different types
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            info: '#3b82f6'
        };

        toast.innerHTML = `
            <i class="${icons[type] || icons.info}" style="color: ${colors[type] || colors.info};"></i>
            <span id="toastMsg">${message}</span>
        `;

        // Add to body
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }, 3000);
    },

   toggleNotifications: function () {
    const drop = document.getElementById('notifDropdown');
    const badge = document.getElementById('notifBadge');
    const notifBtn = document.getElementById('navBtnNotif');
    if (!drop) return;

    const isHidden = !drop.style.display || drop.style.display === 'none';

    if (isHidden) {
        this.renderNotifications();
        drop.style.display = 'block';
        if (badge) badge.style.display = 'none';   // при открытии прячем огонёк
    } else {
        drop.style.display = 'none';
    }
},

initClickOutsideNotifications: function() {
    // Click outside to close notifications
    document.addEventListener('click', (e) => {
        const drop = document.getElementById('notifDropdown');
        const notifBtn = document.getElementById('navBtnNotif');
        if (!drop || !notifBtn) return;
        
        // If dropdown is visible and click is outside both button and dropdown
        if (drop.style.display === 'block' && 
            !drop.contains(e.target) && 
            !notifBtn.contains(e.target)) {
            drop.style.display = 'none';
        }
    });
},


// ================== NOTIFICATION SYSTEM ==================

loadNotifications: async function() {
    if (!this.data.currentUser) return;
    
    try {
        const notifications = await API.getNotifications(50, false);
        this.data.notifications = notifications;
        this.updateNotificationBadge();
    } catch (e) {
        console.error('Error loading notifications:', e);
    }
},

handleNewNotification: function(notification) {
    // Check if notification already exists (prevent duplicates)
    const exists = this.data.notifications.find(n => 
        n._id && notification._id && String(n._id) === String(notification._id)
    );
    
    if (!exists) {
        this.data.notifications.unshift(notification);
    }
    
    // Update badge
    this.updateNotificationBadge();
    
    // Show toast if notification is for current user
    const user = this.data.currentUser;
    if (user && notification.userId && String(notification.userId) === String(user._id || user.id)) {
        this.toast(`🔔 ${notification.title}`);
    }
},

updateNotificationBadge: function() {
    if (!this.data.currentUser) return;
    
    const unreadCount = this.data.notifications.filter(n => !n.read).length;
    const badge = document.getElementById('notifBadge');
    
    if (badge) {
        if (unreadCount > 0) {
            badge.style.display = 'block';
            badge.innerText = unreadCount > 99 ? '99+' : unreadCount.toString();
        } else {
            badge.style.display = 'none';
        }
    }
},

getNotificationIcon: function(type) {
    const icons = {
        'task_assigned': 'fas fa-hand-paper',
        'task_submitted': 'fas fa-file-upload',
        'task_approved': 'fas fa-check-circle',
        'task_cancelled': 'fas fa-times-circle',
        'cancellation_requested': 'fas fa-exclamation-triangle',
        'cancellation_approved': 'fas fa-check',
        'message_received': 'fas fa-comment',
        'payment_received': 'fas fa-money-bill-wave',
        'review_received': 'fas fa-star',
        'dispute_opened': 'fas fa-gavel',
        'system': 'fas fa-info-circle'
    };
    return icons[type] || 'fas fa-bell';
},

handleNotificationClick: async function(notificationId, actionUrl) {
    // Mark as read
    try {
        await API.markNotificationRead(notificationId);
        // Update local state
        const notif = this.data.notifications.find(n => String(n._id) === String(notificationId));
        if (notif) {
            notif.read = true;
            this.updateNotificationBadge();
        }
    } catch (e) {
        console.error('Error marking notification as read:', e);
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

markAllNotificationsRead: async function() {
    try {
        await API.markAllNotificationsRead();
        // Update local state
        this.data.notifications.forEach(n => n.read = true);
        this.updateNotificationBadge();
        this.renderNotifications();
    } catch (e) {
        console.error('Error marking all as read:', e);
        this.toast('Ошибка при обновлении уведомлений');
    }
},

    


    renderNotifications: async function () {
        const list = document.getElementById('notifList');
        const user = this.data.currentUser;
        if (!user) {
            list.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8;">Нет уведомлений</div>`;
            return;
        }

        try {
            // Reload from API to get latest
            const notifications = await API.getNotifications(50, false);
            this.data.notifications = notifications;

            if (!notifications.length) {
                list.innerHTML = `<div style="padding:20px; text-align:center; color:#94a3b8;">Нет уведомлений</div>`;
                return;
            }

            list.innerHTML = '';
            notifications.forEach(n => {
                const icon = this.getNotificationIcon(n.type);
                const date = new Date(n.createdAt);
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
                            ${date.toLocaleString('ru-RU')}
                        </div>
                    </div>
                </div>`;
                list.innerHTML += html;
            });

            this.updateNotificationBadge();
        } catch (e) {
            console.error('Error rendering notifications:', e);
            list.innerHTML = `<div style="padding:20px; color:#ef4444;">Ошибка загрузки уведомлений</div>`;
        }
    },

    clearNotifs: function () {
        this.data.notifications = [];
        this.updateNotificationBadge();
        this.renderNotifications();
    },

    // ================== CANCELLATION & DISPUTE ==================

    openCancelModal: function(postId) {
        this.data.tempCancelPostId = postId;
        const modal = document.getElementById('cancelModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
            // Reset form
            document.getElementById('cancelReason').value = '';
            document.getElementById('cancelDescription').value = '';
        }
    },

    closeCancelModal: function() {
        const modal = document.getElementById('cancelModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 150);
        }
    },

    handleCancel: async function() {
        const postId = this.data.tempCancelPostId;
        const reason = document.getElementById('cancelReason').value;
        const description = document.getElementById('cancelDescription').value;

        if (!reason) {
            this.toast('Укажите причину отмены');
            return;
        }

        try {
            const result = await API.cancelPost(postId, reason, description);
            this.closeCancelModal();
            
            if (result.autoApproved) {
                this.toast('✅ Задача отменена. Возврат средств выполнен автоматически.');
            } else {
                this.toast('📨 Запрос на отмену отправлен. Ожидайте подтверждения.');
            }
            
            await this.renderFeed();
        } catch (e) {
            console.error('Cancel error:', e);
            this.toast(e.message || 'Ошибка при отмене задачи');
        }
    },

    approveCancellation: async function(postId) {
        if (!confirm('Вы уверены, что хотите одобрить отмену? Средства будут возвращены клиенту.')) {
            return;
        }

        try {
            await API.approveCancellation(postId, 100);
            this.toast('✅ Отмена одобрена. Средства возвращены.');
            await this.renderFeed();
        } catch (e) {
            console.error('Approve cancellation error:', e);
            this.toast(e.message || 'Ошибка при одобрении отмены');
        }
    },

    rejectCancellation: async function(postId) {
        if (!confirm('Вы уверены, что хотите отклонить запрос на отмену?')) {
            return;
        }

        try {
            await API.rejectCancellation(postId);
            this.toast('❌ Запрос на отмену отклонен.');
            await this.renderFeed();
        } catch (e) {
            console.error('Reject cancellation error:', e);
            this.toast(e.message || 'Ошибка при отклонении отмены');
        }
    },

    openDisputeModal: function(postId) {
        this.data.tempDisputePostId = postId;
        const modal = document.getElementById('disputeModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
            // Reset form
            document.getElementById('disputeReason').value = '';
            document.getElementById('disputeDescription').value = '';
            document.getElementById('disputeAttachments').value = '';
        }
    },

    closeDisputeModal: function() {
        const modal = document.getElementById('disputeModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.style.display = 'none', 150);
        }
    },

    handleDispute: async function() {
        const postId = this.data.tempDisputePostId;
        const reason = document.getElementById('disputeReason').value;
        const description = document.getElementById('disputeDescription').value;
        const fileInput = document.getElementById('disputeAttachments');

        if (!reason || !description) {
            this.toast('Заполните все обязательные поля');
            return;
        }

        const attachments = fileInput && fileInput.files ? Array.from(fileInput.files) : [];

        try {
            await API.openDispute(postId, reason, description, attachments);
            this.closeDisputeModal();
            this.toast('⚖️ Спор открыт. Администрация рассмотрит ваш запрос.');
            await this.renderFeed();
        } catch (e) {
            console.error('Dispute error:', e);
            this.toast(e.message || 'Ошибка при открытии спора');
        }
    },

    // ================== ADMIN DASHBOARD ==================

    adminData: {
        stats: null,
        users: { data: [], pagination: {} },
        posts: { data: [], pagination: {} },
        disputes: { data: [], pagination: {} },
        transactions: { data: [], pagination: {} },
        currentTab: 'overview',
        tempBanUserId: null,
        tempDisputeId: null
    },

    renderAdmin: async function() {
        if (!this.data.currentUser || this.data.currentUser.role !== 'Admin') {
            this.toast('Access denied');
            return this.router('home');
        }

        await this.loadAdminStats();
        this.renderAdminOverview();
        this.initAdminSearchListeners();
    },

    initAdminSearchListeners: function() {
        // Debounced user search
        const userSearch = document.getElementById('userSearchInput');
        if (userSearch && !userSearch.dataset.initialized) {
            userSearch.dataset.initialized = 'true';
            let userSearchTimeout;
            userSearch.addEventListener('input', () => {
                clearTimeout(userSearchTimeout);
                userSearchTimeout = setTimeout(() => this.loadAdminUsers(), 300);
            });
        }

        // Debounced post search
        const postSearch = document.getElementById('postSearchInput');
        if (postSearch && !postSearch.dataset.initialized) {
            postSearch.dataset.initialized = 'true';
            let postSearchTimeout;
            postSearch.addEventListener('input', () => {
                clearTimeout(postSearchTimeout);
                postSearchTimeout = setTimeout(() => this.loadAdminPosts(), 300);
            });
        }
    },

    refreshAdminData: async function() {
        const refreshBtn = document.querySelector('.admin-header-right .btn-admin-secondary i');
        if (refreshBtn) refreshBtn.classList.add('fa-spin');
        
        await this.loadAdminStats();
        
        // Refresh current tab data
        switch (this.adminData.currentTab) {
            case 'users': await this.loadAdminUsers(); break;
            case 'posts': await this.loadAdminPosts(); break;
            case 'disputes': await this.loadAdminDisputes(); break;
            case 'financials': await this.loadAdminTransactions(); break;
        }
        
        if (refreshBtn) {
            setTimeout(() => refreshBtn.classList.remove('fa-spin'), 500);
        }
        this.toast('Data refreshed');
    },

    loadAdminStats: async function() {
        try {
            const stats = await API.getAdminStats();
            this.adminData.stats = stats;
            this.renderAdminStats(stats);
        } catch (e) {
            console.error('Error loading admin stats:', e);
            this.toast('Error loading statistics');
        }
    },

    renderAdminStats: function(stats) {
        // Main stats cards
        document.getElementById('statTotalUsers').innerText = stats.users.total.toLocaleString();
        document.getElementById('statUsersWeek').innerText = `+${stats.users.newThisWeek} this week`;
        
        document.getElementById('statTotalVolume').innerText = this.formatCurrency(stats.financials.totalVolume);
        document.getElementById('statCommission').innerText = `Commission: ${this.formatCurrency(stats.financials.platformCommission)}`;
        
        document.getElementById('statTotalPosts').innerText = stats.posts.total.toLocaleString();
        document.getElementById('statPostsWeek').innerText = `+${stats.posts.newThisWeek} this week`;
        
        document.getElementById('statActiveDisputes').innerText = stats.disputes.active.toLocaleString();
        document.getElementById('statTotalDisputes').innerText = `${stats.disputes.total} total`;

        // Financial mini stats
        const topupsEl = document.getElementById('statTopups');
        const withdrawalsEl = document.getElementById('statWithdrawals');
        const payoutsEl = document.getElementById('statPayouts');
        const refundsEl = document.getElementById('statRefunds');
        
        if (topupsEl) topupsEl.innerText = this.formatCurrency(stats.financials.totalTopups);
        if (withdrawalsEl) withdrawalsEl.innerText = this.formatCurrency(stats.financials.totalWithdrawals);
        if (payoutsEl) payoutsEl.innerText = this.formatCurrency(stats.financials.totalPayouts);
        if (refundsEl) refundsEl.innerText = this.formatCurrency(stats.financials.totalRefunds);
    },

    formatCurrency: function(amount) {
        if (amount >= 1000000) {
            return (amount / 1000000).toFixed(1) + 'M ₸';
        } else if (amount >= 1000) {
            return (amount / 1000).toFixed(1) + 'K ₸';
        }
        return amount.toLocaleString() + ' ₸';
    },

    renderAdminOverview: function() {
        const stats = this.adminData.stats;
        if (!stats) return;

        // Recent Users
        const recentUsersContainer = document.getElementById('recentUsersContainer');
        if (stats.recent.users && stats.recent.users.length > 0) {
            recentUsersContainer.innerHTML = stats.recent.users.map(user => `
                <div class="admin-list-item">
                    <div class="admin-list-avatar">${user.name[0]}</div>
                    <div class="admin-list-info">
                        <div class="admin-list-name">${user.name}</div>
                        <div class="admin-list-meta">${user.email} • ${user.role}</div>
                    </div>
                    <div class="admin-list-time">${this.timeAgo(user.createdAt)}</div>
                </div>
            `).join('');
        } else {
            recentUsersContainer.innerHTML = '<div class="admin-empty">No recent users</div>';
        }

        // Recent Posts
        const recentPostsContainer = document.getElementById('recentPostsContainer');
        if (stats.recent.posts && stats.recent.posts.length > 0) {
            recentPostsContainer.innerHTML = stats.recent.posts.map(post => `
                <div class="admin-list-item">
                    <div class="admin-list-icon ${post.type}">${post.type === 'job' ? '📋' : '💼'}</div>
                    <div class="admin-list-info">
                        <div class="admin-list-name">${post.title}</div>
                        <div class="admin-list-meta">${post.price.toLocaleString()} ₸ • ${this.getStatusBadge(post.status)}</div>
                    </div>
                    <div class="admin-list-time">${this.timeAgo(post.createdAt)}</div>
                </div>
            `).join('');
        } else {
            recentPostsContainer.innerHTML = '<div class="admin-empty">No recent posts</div>';
        }

        // Recent Transactions
        const recentTransContainer = document.getElementById('recentTransactionsContainer');
        if (stats.recent.transactions && stats.recent.transactions.length > 0) {
            recentTransContainer.innerHTML = `
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>Type</th>
                            <th>Amount</th>
                            <th>Description</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.recent.transactions.map(t => `
                            <tr>
                                <td><span class="admin-badge ${this.getTransactionClass(t.type)}">${t.type}</span></td>
                                <td class="${t.amount > 0 ? 'text-green' : 'text-red'}">${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()} ₸</td>
                                <td>${t.desc}</td>
                                <td>${this.timeAgo(t.createdAt)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        } else {
            recentTransContainer.innerHTML = '<div class="admin-empty">No recent transactions</div>';
        }
    },

    switchAdminTab: function(tabId) {
        this.adminData.currentTab = tabId;
        
        // Update tab buttons
        document.querySelectorAll('.admin-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });
        
        // Update tab content
        document.querySelectorAll('.admin-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabId}`);
        });

        // Load tab data
        switch (tabId) {
            case 'overview': this.renderAdminOverview(); break;
            case 'users': this.loadAdminUsers(); break;
            case 'posts': this.loadAdminPosts(); break;
            case 'disputes': this.loadAdminDisputes(); break;
            case 'financials': 
                this.loadAdminFinancials();
                this.loadAdminTransactions();
                break;
        }
    },

    // ===== USERS MANAGEMENT =====

    loadAdminUsers: async function(page = 1) {
        const container = document.getElementById('usersTableContainer');
        container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Loading users...</div>';

        try {
            const role = document.getElementById('userRoleFilter')?.value || 'all';
            const status = document.getElementById('userStatusFilter')?.value || 'all';
            const search = document.getElementById('userSearchInput')?.value || '';

            const result = await API.getAdminUsers({ page, limit: 20, role, status, search });
            this.adminData.users = { data: result.users, pagination: result.pagination };
            this.renderUsersTable();
        } catch (e) {
            console.error('Error loading users:', e);
            container.innerHTML = '<div class="admin-error">Error loading users</div>';
        }
    },

    renderUsersTable: function() {
        const container = document.getElementById('usersTableContainer');
        const { data: users, pagination } = this.adminData.users;

        if (!users || users.length === 0) {
            container.innerHTML = '<div class="admin-empty">No users found</div>';
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Balance</th>
                        <th>Status</th>
                        <th>Stats</th>
                        <th>Joined</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => `
                        <tr class="${user.isBanned ? 'row-banned' : ''}">
                            <td>
                                <div class="admin-user-cell">
                                    <div class="admin-user-avatar">${user.name[0]}</div>
                                    <div>
                                        <div class="admin-user-name">${user.name} ${user.isPro ? '<span class="pro-badge">PRO</span>' : ''}</div>
                                        <div class="admin-user-email">${user.email}</div>
                                    </div>
                                </div>
                            </td>
                            <td><span class="admin-badge role-${user.role.toLowerCase()}">${user.role}</span></td>
                            <td>${user.balance.toLocaleString()} ₸</td>
                            <td>
                                ${user.isBanned ? '<span class="admin-badge banned">Banned</span>' : '<span class="admin-badge active">Active</span>'}
                                ${user.isVerified ? '<span class="admin-badge verified">✓</span>' : ''}
                            </td>
                            <td>
                                <span class="text-muted">${user.stats?.postsCreated || 0} posts • ${user.stats?.postsCompleted || 0} completed</span>
                            </td>
                            <td>${this.formatDate(user.createdAt)}</td>
                            <td>
                                <div class="admin-actions">
                                    ${user.isBanned ? 
                                        `<button class="btn-action btn-success" onclick="app.unbanUser('${user._id}')" title="Unban"><i class="fas fa-unlock"></i></button>` :
                                        `<button class="btn-action btn-danger" onclick="app.openBanModal('${user._id}')" title="Ban"><i class="fas fa-ban"></i></button>`
                                    }
                                    ${!user.isVerified ? 
                                        `<button class="btn-action btn-info" onclick="app.verifyUserAdmin('${user._id}')" title="Verify"><i class="fas fa-check"></i></button>` :
                                        `<button class="btn-action btn-warning" onclick="app.unverifyUser('${user._id}')" title="Unverify"><i class="fas fa-times"></i></button>`
                                    }
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.renderPagination('usersPagination', pagination, 'loadAdminUsers');
    },

    openBanModal: function(userId) {
        this.adminData.tempBanUserId = userId;
        const modal = document.getElementById('banModal');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    },

    closeBanModal: function() {
        const modal = document.getElementById('banModal');
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 150);
    },

    confirmBanUser: async function() {
        const userId = this.adminData.tempBanUserId;
        const reasonSelect = document.getElementById('banReasonSelect').value;
        const reasonText = document.getElementById('banReasonText').value;
        const reason = reasonText ? `${reasonSelect}: ${reasonText}` : reasonSelect;

        try {
            await API.banUser(userId, reason);
            this.closeBanModal();
            this.toast('User banned successfully');
            await this.loadAdminUsers();
            await this.loadAdminStats();
        } catch (e) {
            this.toast(e.message || 'Error banning user');
        }
    },

    unbanUser: async function(userId) {
        if (!confirm('Are you sure you want to unban this user?')) return;

        try {
            await API.unbanUser(userId);
            this.toast('User unbanned successfully');
            await this.loadAdminUsers();
            await this.loadAdminStats();
        } catch (e) {
            this.toast(e.message || 'Error unbanning user');
        }
    },

    verifyUserAdmin: async function(userId) {
        try {
            await API.verifyUserAdmin(userId);
            this.toast('User verified successfully');
            await this.loadAdminUsers();
        } catch (e) {
            this.toast(e.message || 'Error verifying user');
        }
    },

    unverifyUser: async function(userId) {
        if (!confirm('Are you sure you want to remove verification?')) return;

        try {
            await API.unverifyUser(userId);
            this.toast('Verification removed');
            await this.loadAdminUsers();
        } catch (e) {
            this.toast(e.message || 'Error removing verification');
        }
    },

    // ===== POSTS MANAGEMENT =====

    loadAdminPosts: async function(page = 1) {
        const container = document.getElementById('postsTableContainer');
        container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Loading posts...</div>';

        try {
            const type = document.getElementById('postTypeFilter')?.value || 'all';
            const status = document.getElementById('postStatusFilter')?.value || 'all';
            const search = document.getElementById('postSearchInput')?.value || '';

            const result = await API.getAdminPosts({ page, limit: 20, type, status, search });
            this.adminData.posts = { data: result.posts, pagination: result.pagination };
            this.renderPostsTable();
        } catch (e) {
            console.error('Error loading posts:', e);
            container.innerHTML = '<div class="admin-error">Error loading posts</div>';
        }
    },

    renderPostsTable: function() {
        const container = document.getElementById('postsTableContainer');
        const { data: posts, pagination } = this.adminData.posts;

        if (!posts || posts.length === 0) {
            container.innerHTML = '<div class="admin-empty">No posts found</div>';
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Post</th>
                        <th>Type</th>
                        <th>Price</th>
                        <th>Status</th>
                        <th>Author</th>
                        <th>Assignee</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${posts.map(post => `
                        <tr>
                            <td>
                                <div class="admin-post-title">${post.title}</div>
                                <div class="admin-post-cat">${post.cat}</div>
                            </td>
                            <td><span class="admin-badge type-${post.type}">${post.type}</span></td>
                            <td>${post.price.toLocaleString()} ₸</td>
                            <td>${this.getStatusBadgeHtml(post.status)}</td>
                            <td>${post.authorId?.name || post.authorName || 'N/A'}</td>
                            <td>${post.assigneeId?.name || post.assigneeName || '-'}</td>
                            <td>${this.formatDate(post.createdAt)}</td>
                            <td>
                                <div class="admin-actions">
                                    <button class="btn-action btn-danger" onclick="app.deletePostAdmin('${post._id}')" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.renderPagination('postsPagination', pagination, 'loadAdminPosts');
    },

    deletePostAdmin: async function(postId) {
        if (!confirm('Are you sure you want to delete this post? This action cannot be undone. Any frozen funds will be refunded.')) return;

        try {
            await API.deletePost(postId);
            this.toast('Post deleted successfully');
            await this.loadAdminPosts();
            await this.loadAdminStats();
        } catch (e) {
            this.toast(e.message || 'Error deleting post');
        }
    },

    // ===== DISPUTES MANAGEMENT =====

    loadAdminDisputes: async function(page = 1) {
        const container = document.getElementById('disputesTableContainer');
        container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Loading disputes...</div>';

        try {
            const status = document.getElementById('disputeStatusFilter')?.value || 'all';

            const result = await API.getAdminDisputes({ page, limit: 20, status });
            this.adminData.disputes = { data: result.disputes, pagination: result.pagination };
            this.renderDisputesTable();
        } catch (e) {
            console.error('Error loading disputes:', e);
            container.innerHTML = '<div class="admin-error">Error loading disputes</div>';
        }
    },

    renderDisputesTable: function() {
        const container = document.getElementById('disputesTableContainer');
        const { data: disputes, pagination } = this.adminData.disputes;

        if (!disputes || disputes.length === 0) {
            container.innerHTML = '<div class="admin-empty">No disputes found</div>';
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Post</th>
                        <th>Opened By</th>
                        <th>Against</th>
                        <th>Reason</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${disputes.map(dispute => `
                        <tr class="${dispute.status === 'open' ? 'row-urgent' : ''}">
                            <td>
                                <div class="admin-post-title">${dispute.postId?.title || 'N/A'}</div>
                                <div class="admin-post-cat">${(dispute.postId?.price || 0).toLocaleString()} ₸</div>
                            </td>
                            <td>${dispute.openedBy?.name || 'N/A'}</td>
                            <td>${dispute.against?.name || 'N/A'}</td>
                            <td><span class="text-truncate">${dispute.reason}</span></td>
                            <td>${this.getDisputeStatusBadge(dispute.status)}</td>
                            <td>${this.formatDate(dispute.createdAt)}</td>
                            <td>
                                <div class="admin-actions">
                                    ${dispute.status === 'open' || dispute.status === 'under_review' ? `
                                        <button class="btn-action btn-primary" onclick="app.openResolveDisputeModal('${dispute._id}')" title="Resolve">
                                            <i class="fas fa-gavel"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.renderPagination('disputesPagination', pagination, 'loadAdminDisputes');
    },

    openResolveDisputeModal: function(disputeId) {
        this.adminData.tempDisputeId = disputeId;
        const dispute = this.adminData.disputes.data.find(d => d._id === disputeId);
        
        const detailsEl = document.getElementById('disputeDetails');
        if (dispute) {
            detailsEl.innerHTML = `
                <div class="dispute-detail-card">
                    <div class="dispute-info-row">
                        <strong>Post:</strong> ${dispute.postId?.title || 'N/A'}
                    </div>
                    <div class="dispute-info-row">
                        <strong>Opened by:</strong> ${dispute.openedBy?.name} (${dispute.openedBy?.email})
                    </div>
                    <div class="dispute-info-row">
                        <strong>Against:</strong> ${dispute.against?.name} (${dispute.against?.email})
                    </div>
                    <div class="dispute-info-row">
                        <strong>Reason:</strong> ${dispute.reason}
                    </div>
                    <div class="dispute-info-row">
                        <strong>Description:</strong> ${dispute.description}
                    </div>
                    ${dispute.attachments?.length > 0 ? `
                        <div class="dispute-info-row">
                            <strong>Attachments:</strong> ${dispute.attachments.map(a => `<a href="${a}" target="_blank">View</a>`).join(', ')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        const modal = document.getElementById('resolveDisputeModal');
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    },

    closeResolveDisputeModal: function() {
        const modal = document.getElementById('resolveDisputeModal');
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 150);
    },

    toggleRefundOptions: function() {
        const checkbox = document.getElementById('disputeRefundCheck');
        const options = document.getElementById('refundOptions');
        options.style.display = checkbox.checked ? 'block' : 'none';
    },

    confirmResolveDispute: async function() {
        const disputeId = this.adminData.tempDisputeId;
        const resolution = document.getElementById('disputeResolutionText').value;
        const refundToClient = document.getElementById('disputeRefundCheck').checked;
        const refundPercentage = parseInt(document.getElementById('disputeRefundPercent').value);

        if (!resolution) {
            this.toast('Please enter a resolution');
            return;
        }

        try {
            await API.resolveDispute(disputeId, resolution, refundToClient, refundPercentage);
            this.closeResolveDisputeModal();
            this.toast('Dispute resolved successfully');
            await this.loadAdminDisputes();
            await this.loadAdminStats();
        } catch (e) {
            this.toast(e.message || 'Error resolving dispute');
        }
    },

    // ===== TRANSACTIONS =====

    loadAdminTransactions: async function(page = 1) {
        const container = document.getElementById('transactionsTableContainer');
        container.innerHTML = '<div class="admin-loading"><i class="fas fa-spinner fa-spin"></i> Loading transactions...</div>';

        try {
            const type = document.getElementById('transTypeFilter')?.value || 'all';

            const result = await API.getAdminTransactions({ page, limit: 50, type });
            this.adminData.transactions = { data: result.transactions, pagination: result.pagination };
            this.renderTransactionsTable();
        } catch (e) {
            console.error('Error loading transactions:', e);
            container.innerHTML = '<div class="admin-error">Error loading transactions</div>';
        }
    },

    renderTransactionsTable: function() {
        const container = document.getElementById('transactionsTableContainer');
        const { data: transactions, pagination } = this.adminData.transactions;

        if (!transactions || transactions.length === 0) {
            container.innerHTML = '<div class="admin-empty">No transactions found</div>';
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>User</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Description</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions.map(t => `
                        <tr>
                            <td>${t.userId?.name || 'N/A'}</td>
                            <td><span class="admin-badge ${this.getTransactionClass(t.type)}">${t.type}</span></td>
                            <td class="${t.amount > 0 ? 'text-green' : 'text-red'}">${t.amount > 0 ? '+' : ''}${t.amount.toLocaleString()} ₸</td>
                            <td>${t.desc}</td>
                            <td>${this.formatDate(t.createdAt)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.renderPagination('transactionsPagination', pagination, 'loadAdminTransactions');
    },

    // ===== HELPER FUNCTIONS =====

    renderPagination: function(containerId, pagination, callbackName) {
        const container = document.getElementById(containerId);
        if (!container || pagination.pages <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let html = '';
        const { page, pages } = pagination;

        html += `<button class="admin-page-btn" ${page === 1 ? 'disabled' : ''} onclick="app.${callbackName}(${page - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>`;

        for (let i = 1; i <= pages; i++) {
            if (i === 1 || i === pages || (i >= page - 2 && i <= page + 2)) {
                html += `<button class="admin-page-btn ${i === page ? 'active' : ''}" onclick="app.${callbackName}(${i})">${i}</button>`;
            } else if (i === page - 3 || i === page + 3) {
                html += '<span class="admin-page-dots">...</span>';
            }
        }

        html += `<button class="admin-page-btn" ${page === pages ? 'disabled' : ''} onclick="app.${callbackName}(${page + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>`;

        container.innerHTML = html;
    },

    getStatusBadge: function(status) {
        const badges = {
            'open': '🟢 Open',
            'in_progress': '🔵 In Progress',
            'review': '🟡 Review',
            'completed': '✅ Completed',
            'cancelled': '❌ Cancelled'
        };
        return badges[status] || status;
    },

    getStatusBadgeHtml: function(status) {
        const classes = {
            'open': 'status-open',
            'in_progress': 'status-progress',
            'review': 'status-review',
            'completed': 'status-completed',
            'cancelled': 'status-cancelled'
        };
        return `<span class="admin-badge ${classes[status] || ''}">${status}</span>`;
    },

    getDisputeStatusBadge: function(status) {
        const badges = {
            'open': '<span class="admin-badge dispute-open">Open</span>',
            'under_review': '<span class="admin-badge dispute-review">Under Review</span>',
            'resolved': '<span class="admin-badge dispute-resolved">Resolved</span>',
            'rejected': '<span class="admin-badge dispute-rejected">Rejected</span>'
        };
        return badges[status] || status;
    },

    getTransactionClass: function(type) {
        const classes = {
            'topup': 'trans-topup',
            'pay_job': 'trans-pay',
            'pay_gig': 'trans-pay',
            'earn': 'trans-earn',
            'withdraw': 'trans-withdraw',
            'refund': 'trans-refund',
            'pay_pro': 'trans-pro',
            'commission_earn': 'trans-commission'
        };
        return classes[type] || '';
    },

    // ===== ADMIN FINANCIALS =====

    loadAdminFinancials: async function() {
        try {
            // Load admin balance
            const adminData = await API.getAdminBalance();
            document.getElementById('adminBalanceDisplay').innerText = `${adminData.balance.toLocaleString()} ₸`;

            // Load commission history
            const commissionHistory = await API.getAdminCommissionHistory();
            this.renderCommissionHistory(commissionHistory);
        } catch (e) {
            console.error('Error loading admin financials:', e);
            this.toast('Error loading financial data');
        }
    },

    renderCommissionHistory: function(commissions) {
        const container = document.getElementById('commissionHistoryContainer');
        if (!commissions || commissions.length === 0) {
            container.innerHTML = '<div class="admin-empty">No commission history</div>';
            return;
        }

        container.innerHTML = `
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Task</th>
                        <th>Freelancer</th>
                        <th>Amount</th>
                        <th>Date</th>
                    </tr>
                </thead>
                <tbody>
                    ${commissions.map(c => `
                        <tr>
                            <td>${c.desc || 'N/A'}</td>
                            <td>${c.freelancerName || 'N/A'}</td>
                            <td class="text-green">+${c.amount.toLocaleString()} ₸</td>
                            <td>${this.formatDate(c.createdAt)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    },

    adminWithdrawRevenue: async function() {
        if (!confirm('Are you sure you want to withdraw all revenue to your bank card? This will set your balance to 0.')) {
            return;
        }

        try {
            await API.adminWithdrawRevenue();
            this.toast('Revenue withdrawn successfully');
            await this.loadAdminFinancials();
            await this.loadAdminTransactions();
        } catch (e) {
            console.error('Error withdrawing revenue:', e);
            this.toast(e.message || 'Error withdrawing revenue');
        }
    },

    timeAgo: function(date) {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        const intervals = [
            { label: 'y', seconds: 31536000 },
            { label: 'mo', seconds: 2592000 },
            { label: 'd', seconds: 86400 },
            { label: 'h', seconds: 3600 },
            { label: 'm', seconds: 60 }
        ];
        
        for (const interval of intervals) {
            const count = Math.floor(seconds / interval.seconds);
            if (count > 0) return `${count}${interval.label} ago`;
        }
        return 'just now';
    },

    formatDate: function(date) {
        return new Date(date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
        });
    },

    // ================== SAVED POSTS ==================
    toggleSavePost: async function(postId) {
        if (!this.data.currentUser) {
            this.toast('Сначала войдите');
            return;
        }

        try {
            const result = await API.savePost(postId);
            // Update current user's savedPosts
            this.data.currentUser = await API.getCurrentUser();
            // Refresh feed to update heart icons
            this.renderFeed();
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка при сохранении');
        }
    },

    // ================== THEME TOGGLE ==================
    toggleTheme: function() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        this.updateThemeIcon(newTheme);
    },

    updateThemeIcon: function(theme) {
        const themeBtn = document.getElementById('themeToggle');
        if (themeBtn) {
            themeBtn.innerHTML = theme === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
        }
    },

    // ================== MOBILE DRAWER ==================
    toggleMobileDrawer: function() {
        const drawer = document.getElementById('mobileDrawer');
        const overlay = document.getElementById('mobileDrawerOverlay');
        
        if (!drawer || !overlay) return;
        
        const isOpen = drawer.classList.contains('open');
        
        if (isOpen) {
            drawer.classList.remove('open');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        } else {
            drawer.classList.add('open');
            overlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    },

    // ================== i18n SYSTEM ==================
    translations: {
        ru: {
            NAV_FEED: 'Лента',
            NAV_PROFILE: 'Профиль',
            NAV_WALLET: 'Кошелёк',
            NAV_LANGUAGE: 'Язык',
            NAV_LOGOUT: 'Выйти',
            BTN_LOGIN: 'Войти',
            BTN_START: 'Start',
            HERO_TITLE_1: 'Твой скилл',
            HERO_TITLE_2: 'твоя валюта',
            HERO_DESC: 'Платформа, где студенты находят исполнителей и зарабатывают на своих навыках. Безопасная сделка и мгновенные выплаты.',
            HERO_BTN_START: 'Начать зарабатывать',
            HERO_BTN_FIND: 'Найти помощь',
            FEED_TAB_JOBS: 'Заказы',
            FEED_TAB_GIGS: 'Услуги',
            FEED_TAB_SAVED: 'Избранное'
        },
        kz: {
            NAV_FEED: 'Жиынтық',
            NAV_PROFILE: 'Профиль',
            NAV_WALLET: 'Әмиян',
            NAV_LANGUAGE: 'Тіл',
            NAV_LOGOUT: 'Шығу',
            BTN_LOGIN: 'Кіру',
            BTN_START: 'Бастау',
            HERO_TITLE_1: 'Сіздің дағдыларыңыз',
            HERO_TITLE_2: 'сіздің валютаңыз',
            HERO_DESC: 'Студенттер орындаушыларды тауып, өз дағдылары бойынша табыс табатын платформа. Қауіпсіз мәміле және лезде төлемдер.',
            HERO_BTN_START: 'Табыс табуға бастау',
            HERO_BTN_FIND: 'Көмек табу',
            FEED_TAB_JOBS: 'Тапсырмалар',
            FEED_TAB_GIGS: 'Қызметтер',
            FEED_TAB_SAVED: 'Таңдаулы'
        },
        en: {
            NAV_FEED: 'Feed',
            NAV_PROFILE: 'Profile',
            NAV_WALLET: 'Wallet',
            NAV_LANGUAGE: 'Language',
            NAV_LOGOUT: 'Logout',
            BTN_LOGIN: 'Login',
            BTN_START: 'Start',
            HERO_TITLE_1: 'Your skills',
            HERO_TITLE_2: 'your currency',
            HERO_DESC: 'A platform where students find performers and earn on their skills. Safe deal and instant payouts.',
            HERO_BTN_START: 'Start earning',
            HERO_BTN_FIND: 'Find help',
            FEED_TAB_JOBS: 'Jobs',
            FEED_TAB_GIGS: 'Services',
            FEED_TAB_SAVED: 'Saved'
        }
    },

    toggleLangDropdown: function() {
        const dropdown = document.getElementById('langDropdown');
        if (dropdown) {
            dropdown.classList.toggle('show');
        }
    },

    selectLanguage: function(lang) {
        if (!this.translations[lang]) lang = 'ru';
        
        localStorage.setItem('language', lang);
        
        // Close dropdown
        const dropdown = document.getElementById('langDropdown');
        if (dropdown) dropdown.classList.remove('show');
        
        // Update current language code display
        const langCodes = { ru: 'RU', kz: 'KZ', en: 'EN' };
        const langCodeEl = document.getElementById('langCurrentCode');
        if (langCodeEl) langCodeEl.textContent = langCodes[lang];
        
        // Update mobile language buttons
        document.querySelectorAll('.mobile-lang-btn').forEach(btn => {
            if (btn.dataset.lang === lang) {
                btn.style.background = 'rgba(99, 102, 241, 0.15)';
                btn.style.color = 'var(--primary)';
            } else {
                btn.style.background = '';
                btn.style.color = '';
            }
        });
        
        // Apply translations
        this.changeLanguage(lang);
    },

    changeLanguage: function(lang) {
        if (!this.translations[lang]) lang = 'ru';
        
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (this.translations[lang][key]) {
                el.textContent = this.translations[lang][key];
            }
        });
        
        // Update feed tabs if they exist
        const feedTabs = document.getElementById('feedTypeTabs');
        if (feedTabs) {
            const jobTab = feedTabs.querySelector('button:first-child');
            const gigTab = feedTabs.querySelector('button:nth-child(2)');
            const savedTab = feedTabs.querySelector('button:last-child');
            
            if (jobTab) {
                const textDiv = jobTab.querySelector('div > div');
                if (textDiv) textDiv.textContent = this.translations[lang].FEED_TAB_JOBS;
            }
            if (gigTab) {
                const textDiv = gigTab.querySelector('div > div');
                if (textDiv) textDiv.textContent = this.translations[lang].FEED_TAB_GIGS;
            }
            if (savedTab) {
                const textDiv = savedTab.querySelector('div > div');
                if (textDiv) textDiv.textContent = this.translations[lang].FEED_TAB_SAVED;
            }
        }
    },

    // ================== PUBLIC PROFILE ==================
    viewPublicProfile: async function(userId) {
        if (!userId) return;
        
        // If viewing own profile, redirect to profile page
        if (this.data.currentUser && String(this.data.currentUser._id || this.data.currentUser.id) === String(userId)) {
            this.router('profile');
            return;
        }

        try {
            const profile = await API.getPublicProfile(userId);
            this.renderPublicProfile(profile);
            this.router('user-profile');
        } catch (e) {
            console.error(e);
            this.toast(e.message || 'Ошибка загрузки профиля');
        }
    },

    renderPublicProfile: function(profile) {
        const container = document.getElementById('publicProfileContent');
        if (!container) return;

        const memberSince = new Date(profile.createdAt).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long'
        });

        const avatarHtml = profile.photoUrl 
            ? `<img src="${profile.photoUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`
            : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:3rem; color:#475569;">${profile.name[0]}</div>`;

        let reviewsHtml = '';
        if (profile.reviews && profile.reviews.length > 0) {
            reviewsHtml = profile.reviews.map(r => `
                <div class="glass-card" style="padding:20px; margin-bottom:15px; border:1px solid #e5e7eb;">
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:10px;">
                        <div>
                            <div style="font-weight:700; color:#1e293b; margin-bottom:5px;">${r.reviewerName || 'Аноним'}</div>
                            <div style="font-size:0.85rem; color:#64748b;">${r.title}</div>
                        </div>
                        <div style="font-size:1.2rem;">
                            ${'⭐'.repeat(Math.min(5, Math.max(0, Math.round(r.rating || 0))))}${'☆'.repeat(Math.max(0, 5 - Math.min(5, Math.max(0, Math.round(r.rating || 0)))))}
                        </div>
                    </div>
                    <p style="color:#334155; font-size:0.9rem; line-height:1.5; margin:0;">${r.review || 'Без комментария'}</p>
                    <div style="font-size:0.75rem; color:#94a3b8; margin-top:10px;">
                        ${new Date(r.createdAt).toLocaleDateString('ru-RU')}
                    </div>
                </div>
            `).join('');
        } else {
            reviewsHtml = '<div style="text-align:center; padding:40px; color:#94a3b8; font-style:italic;">Пока нет отзывов</div>';
        }

        container.innerHTML = `
            <div style="text-align:center; margin-bottom:30px;">
                <div class="avatar" style="width:120px; height:120px; margin:0 auto 20px; border:4px solid var(--primary);">
                    ${avatarHtml}
                </div>
                <h2 style="font-family:'Outfit', sans-serif; font-size:2rem; margin-bottom:10px; color:#0f172a;">
                    ${profile.name}
                    ${profile.isPro ? '<span style="color:#d97706; font-size:1.2rem;">👑</span>' : ''}
                    ${profile.isVerified ? '<span style="color:#059669; font-size:1.2rem;">✓</span>' : ''}
                </h2>
                <div style="color:#64748b; font-size:0.9rem; margin-bottom:20px;">
                    ${profile.role} • Участник с ${memberSince}
                </div>
                ${profile.bio ? `<p style="color:#334155; max-width:600px; margin:0 auto 30px; line-height:1.6;">${profile.bio}</p>` : ''}
            </div>

            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:30px;">
                <div class="glass-card" style="padding:20px; text-align:center; border:1px solid #e5e7eb;">
                    <div style="font-size:2rem; font-weight:800; color:var(--primary); font-family:'Outfit', sans-serif;">
                        ${profile.completedJobs || 0}
                    </div>
                    <div style="color:#64748b; font-size:0.9rem; margin-top:5px;">Задач выполнено</div>
                </div>
                <div class="glass-card" style="padding:20px; text-align:center; border:1px solid #e5e7eb;">
                    <div style="font-size:2rem; font-weight:800; color:#f59e0b; font-family:'Outfit', sans-serif;">
                        ${profile.rating || 0}
                    </div>
                    <div style="color:#64748b; font-size:0.9rem; margin-top:5px;">
                        ${'⭐'.repeat(Math.min(5, Math.max(0, Math.round(profile.rating || 0))))}${'☆'.repeat(Math.max(0, 5 - Math.min(5, Math.max(0, Math.round(profile.rating || 0)))))}
                    </div>
                    <div style="color:#64748b; font-size:0.8rem; margin-top:5px;">
                        ${profile.ratingCount || 0} отзывов
                    </div>
                </div>
                ${profile.role === 'Freelancer' ? `
                <div class="glass-card" style="padding:20px; text-align:center; border:1px solid #e5e7eb;">
                    <div style="font-size:2rem; font-weight:800; color:#6366f1; font-family:'Outfit', sans-serif;">
                        Lvl ${profile.level || 1}
                    </div>
                    <div style="color:#64748b; font-size:0.9rem; margin-top:5px;">Уровень</div>
                    <div style="color:#64748b; font-size:0.8rem; margin-top:5px;">
                        ${profile.xp || 0} XP
                    </div>
                </div>
                ` : ''}
            </div>

            <div style="margin-top:40px;">
                <h3 style="font-family:'Outfit', sans-serif; font-size:1.5rem; margin-bottom:20px; color:#0f172a;">
                    Отзывы (${profile.reviews ? profile.reviews.length : 0})
                </h3>
                ${reviewsHtml}
            </div>
        `;
    }
};

window.onload = function () {
    app.init();
};
window.app = app;
