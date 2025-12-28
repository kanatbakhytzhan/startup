/**
 * SIMULATED DATABASE
 * This file handles initial data generation for users and posts.
 */

const DB = {
    users: [],
    posts: []
};

// --- DATA GENERATOR ---
function initDatabase() {
    // 1. Generate Users (Clients & Freelancers)
    const names = ["Алибек", "Диана", "Санжар", "Айсулу", "Макс", "Елена", "Тимур", "Анель", "Борис", "Жанна"];
    
    for(let i=0; i<names.length; i++) {
        DB.users.push({
            id: 100 + i,
            name: names[i],
            email: `user${i}@mail.com`,
            password: "123", // Demo password
            balance: Math.floor(Math.random() * 50000) + 5000,
            role: i % 2 === 0 ? 'Freelancer' : 'Client',
            avatar: names[i][0],
            // Freelancer specific fields
            xp: i % 2 === 0 ? Math.floor(Math.random() * 5000) : 0,
            level: i % 2 === 0 ? Math.floor(Math.random() * 5) + 1 : 1,
            completedJobs: Math.floor(Math.random() * 20)
        });
    }

    // 2. Generate Posts (Jobs & Gigs)
    const templates = [
        { t: "Сверстать лендинг", c: "dev", p: 25000, type: "job" },
        { t: "Решить 5 задач по матану", c: "study", p: 3000, type: "job" },
        { t: "Логотип для кофейни", c: "design", p: 15000, type: "job" },
        { t: "Перевод статьи (En-Ru)", c: "text", p: 5000, type: "job" },
        { t: "Установить Windows", c: "dev", p: 4000, type: "job" },
        { t: "Репетитор по Python", c: "dev", p: 3000, type: "gig" },
        { t: "Делаю аватарки", c: "design", p: 2000, type: "gig" },
        { t: "Пишу курсовые", c: "text", p: 15000, type: "gig" },
        { t: "Бот для Телеграм", c: "dev", p: 20000, type: "gig" },
        { t: "Решение задач по физике", c: "study", p: 1500, type: "gig" }
    ];

    // Create 30 items mixing templates
    for(let i=0; i<30; i++) {
        const template = templates[i % templates.length];
        const userIndex = Math.floor(Math.random() * DB.users.length);
        const user = DB.users[userIndex];
        
        // Ensure Freelancers post Gigs, Clients post Jobs usually (but we mix for demo)
        const type = user.role === 'Freelancer' ? 'gig' : 'job';
        
        DB.posts.push({
            id: 200 + i,
            title: template.t,
            cat: template.c,
            price: template.p + Math.floor(Math.random() * 2000),
            type: type, // Override based on user role
            desc: "Подробное описание задачи. Нужно сделать качественно и в срок. Пишите, обсудим детали.",
            authorId: user.id,
            authorName: user.name,
            authorRole: user.role,
            status: 'open'
        });
    }
}

// Initialize on load if empty
if (!localStorage.getItem('sl_users_v8')) {
    initDatabase();
    localStorage.setItem('sl_users_v8', JSON.stringify(DB.users));
    localStorage.setItem('sl_posts_v8', JSON.stringify(DB.posts));
}