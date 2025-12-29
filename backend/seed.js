/**
 * StuLink Database Seeding Script
 * Populates MongoDB with realistic test data
 * 
 * Usage: npm run seed
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/stulink';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Import models (same as server.js)
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['Client', 'Freelancer', 'Admin'], required: true },
  balance: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  completedJobs: { type: Number, default: 0 },
  ratingSum: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  isPro: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  bio: { type: String, default: '' },
  photoUrl: { type: String, default: '' },
  tg: { type: String, default: '' },
  wa: { type: String, default: '' },
  avatar: { type: String },
  openForWork: { type: Boolean, default: true } // New field for work status
}, { timestamps: true });

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  desc: { type: String, required: true },
  cat: { type: String, required: true },
  price: { type: Number, required: true },
  type: { type: String, enum: ['job', 'gig'], required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: String,
  authorRole: String,
  assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigneeName: String,
  status: { type: String, enum: ['open', 'in_progress', 'review', 'completed', 'cancelled'], default: 'open' },
  parentGigId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  clientReview: String,
  rating: Number,
  isPro: { type: Boolean, default: false },
  submissionFileUrl: String,
  submissionFileName: String,
  submissionAt: Date,
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
  type: { type: String, enum: ['topup', 'pay_gig', 'pay_job', 'earn', 'withdraw', 'pay_pro', 'refund'], required: true },
  amount: { type: Number, required: true },
  desc: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Post = mongoose.model('Post', PostSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Seed data arrays
const clientNames = ['Алибек', 'Диана', 'Санжар', 'Айсулу', 'Макс'];
const freelancerNames = ['Елена', 'Тимур', 'Анель', 'Борис', 'Жанна', 'Данияр', 'Амина', 'Артур', 'Сабина', 'Руслан'];
const jobTitles = [
  'Сверстать лендинг для стартапа',
  'Решить задачи по математическому анализу',
  'Создать логотип для кофейни',
  'Перевести статью с английского на русский',
  'Настроить сервер на Ubuntu',
  'Написать курсовую по экономике',
  'Разработать мобильное приложение',
  'Создать презентацию для защиты диплома',
  'Написать скрипт для автоматизации',
  'Сверстать адаптивный сайт',
  'Решить задачи по программированию',
  'Создать дизайн для мобильного приложения',
  'Перевести документы с казахского',
  'Написать научную статью',
  'Разработать базу данных'
];
const gigTitles = [
  'Репетитор по Python и JavaScript',
  'Делаю логотипы и брендинг',
  'Пишу курсовые и дипломные работы',
  'Разработка Telegram ботов',
  'Решение задач по физике и математике',
  'Веб-разработка на React и Node.js',
  'Графический дизайн и иллюстрации',
  'Переводы с английского, казахского',
  'Мобильная разработка (iOS/Android)',
  'Настройка и администрирование серверов',
  'Копирайтинг и SEO-тексты',
  '3D моделирование и визуализация',
  'Видеомонтаж и анимация',
  'Консультации по программированию',
  'Разработка игр на Unity'
];
const categories = ['dev', 'design', 'text', 'study'];
const descriptions = [
  'Нужно сделать качественно и в срок. Готов обсудить детали.',
  'Требуется ответственный исполнитель с опытом работы.',
  'Важна аккуратность и внимание к деталям.',
  'Готов заплатить за качественную работу.',
  'Срочно! Нужно выполнить в ближайшее время.',
  'Ищу долгосрочное сотрудничество.',
  'Проект интересный, есть возможность расширения.',
  'Требуется профессионал высокого уровня.',
  'Готов рассмотреть различные варианты решения.',
  'Важна коммуникация и регулярные обновления.'
];

// Helper functions
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function seedDatabase() {
  try {
    console.log('🌱 Starting database seeding...\n');

    // Clear existing data (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing data...');
    await User.deleteMany({});
    await Post.deleteMany({});
    await Transaction.deleteMany({});
    console.log('✅ Database cleared\n');

    // 1. Create Super Admin
    console.log('👤 Creating Super Admin...');
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@stulink.com',
      password: adminPassword,
      role: 'Admin',
      isVerified: true,
      balance: 0,
      avatar: 'A'
    });
    console.log(`✅ Admin created: ${admin.email} / admin123\n`);

    // 2. Create 5 Clients with 50,000+ balance
    console.log('👥 Creating Clients...');
    const clients = [];
    for (let i = 0; i < 5; i++) {
      const password = await bcrypt.hash('client123', 10);
      const balance = randomInt(50000, 150000);
      const client = await User.create({
        name: clientNames[i],
        email: `client${i + 1}@stulink.com`,
        password: password,
        role: 'Client',
        balance: balance,
        isVerified: Math.random() > 0.3,
        avatar: clientNames[i][0],
        bio: `Клиент ${i + 1}. Ищу качественных исполнителей для своих проектов.`,
        openForWork: false // Clients don't need this
      });
      clients.push(client);

      // Create topup transaction
      await Transaction.create({
        userId: client._id,
        type: 'topup',
        amount: balance,
        desc: 'Пополнение баланса (seed)',
        createdAt: randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date())
      });
    }
    console.log(`✅ Created ${clients.length} clients\n`);

    // 3. Create 10 Freelancers with diverse skills
    console.log('💼 Creating Freelancers...');
    const freelancers = [];
    for (let i = 0; i < 10; i++) {
      const password = await bcrypt.hash('freelancer123', 10);
      const xp = randomInt(500, 5000);
      const level = Math.floor(xp / 1000) + 1;
      const completedJobs = randomInt(5, 50);
      const ratingCount = randomInt(3, 20);
      const ratingSum = ratingCount * randomInt(35, 50); // 3.5-5.0 average
      
      const freelancer = await User.create({
        name: freelancerNames[i],
        email: `freelancer${i + 1}@stulink.com`,
        password: password,
        role: 'Freelancer',
        balance: randomInt(10000, 80000),
        xp: xp,
        level: level,
        completedJobs: completedJobs,
        ratingSum: ratingSum,
        ratingCount: ratingCount,
        isVerified: Math.random() > 0.4,
        isPro: Math.random() > 0.7, // 30% are PRO
        avatar: freelancerNames[i][0],
        bio: `Фрилансер ${i + 1}. Специализируюсь на ${randomElement(categories)}. Опыт работы ${completedJobs} проектов.`,
        openForWork: Math.random() > 0.2, // 80% open for work
        tg: `@freelancer${i + 1}`,
        wa: `+7${randomInt(7000000000, 7999999999)}`
      });
      freelancers.push(freelancer);
    }
    console.log(`✅ Created ${freelancers.length} freelancers\n`);

    // 4. Create 50+ Posts (Jobs & Gigs) with mixed statuses
    console.log('📝 Creating Posts...');
    const posts = [];
    const statuses = ['open', 'open', 'open', 'in_progress', 'review', 'completed', 'completed', 'cancelled']; // Weighted distribution
    
    // Create Jobs (from Clients)
    for (let i = 0; i < 30; i++) {
      const client = randomElement(clients);
      const status = randomElement(statuses);
      const price = randomInt(3000, 50000);
      
      const post = await Post.create({
        title: randomElement(jobTitles),
        desc: randomElement(descriptions),
        cat: randomElement(categories),
        price: price,
        type: 'job',
        authorId: client._id,
        authorName: client.name,
        authorRole: client.role,
        status: status,
        createdAt: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date())
      });

      // If in progress or completed, assign a freelancer
      if (status === 'in_progress' || status === 'review' || status === 'completed') {
        const freelancer = randomElement(freelancers);
        post.assigneeId = freelancer._id;
        post.assigneeName = freelancer.name;
        
        if (status === 'review' || status === 'completed') {
          post.submissionFileUrl = '/uploads/sample-file.pdf';
          post.submissionFileName = 'work-submission.pdf';
          post.submissionAt = randomDate(post.createdAt, new Date());
        }
        
        if (status === 'completed') {
          post.rating = randomInt(4, 5);
          post.clientReview = 'Отличная работа! Всё выполнено качественно и в срок.';
        }
        
        await post.save();
      }

      posts.push(post);

      // Create transaction for job creation
      if (status === 'open' || status === 'in_progress' || status === 'review') {
        await Transaction.create({
          userId: client._id,
          type: 'pay_job',
          amount: -price,
          desc: `Создание задания: ${post.title}`,
          createdAt: post.createdAt
        });
      }
    }

    // Create Gigs (from Freelancers)
    for (let i = 0; i < 25; i++) {
      const freelancer = randomElement(freelancers);
      const price = randomInt(2000, 30000);
      const status = randomElement(['open', 'open', 'open', 'in_progress', 'completed']); // Gigs are mostly open
      
      const post = await Post.create({
        title: randomElement(gigTitles),
        desc: randomElement(descriptions),
        cat: randomElement(categories),
        price: price,
        type: 'gig',
        authorId: freelancer._id,
        authorName: freelancer.name,
        authorRole: freelancer.role,
        status: status,
        isPro: freelancer.isPro,
        createdAt: randomDate(new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), new Date())
      });

      // If in progress or completed, assign a client
      if (status === 'in_progress' || status === 'completed') {
        const client = randomElement(clients);
        post.assigneeId = client._id;
        post.assigneeName = client.name;
        
        if (status === 'completed') {
          post.rating = randomInt(4, 5);
          post.clientReview = 'Прекрасная услуга! Рекомендую.';
        }
        
        await post.save();

        // Create transaction for gig order
        await Transaction.create({
          userId: client._id,
          type: 'pay_gig',
          amount: -price,
          desc: `Заказ услуги: ${post.title}`,
          createdAt: post.createdAt
        });
      }

      posts.push(post);
    }

    console.log(`✅ Created ${posts.length} posts\n`);

    // 5. Create transaction history and reviews
    console.log('💰 Creating Transaction History...');
    let transactionCount = 0;

    // Add earnings for completed jobs
    for (const post of posts) {
      if (post.status === 'completed' && post.assigneeId) {
        const worker = await User.findById(post.assigneeId);
        if (worker) {
          const commission = worker.isPro ? 0 : Math.round(post.price * 0.05);
          const payout = post.price - commission;
          
          await Transaction.create({
            userId: worker._id,
            type: 'earn',
            amount: payout,
            desc: `Оплата: ${post.title} ${commission > 0 ? `(Комиссия: ${commission})` : '(PRO: 0%)'}`,
            createdAt: randomDate(post.createdAt, new Date())
          });
          transactionCount++;
        }
      }
    }

    // Add some random transactions
    const allUsers = [...clients, ...freelancers];
    for (let i = 0; i < 20; i++) {
      const user = randomElement(allUsers);
      const types = ['topup', 'withdraw'];
      const type = randomElement(types);
      const amount = type === 'topup' ? randomInt(5000, 50000) : randomInt(1000, 20000);
      
      await Transaction.create({
        userId: user._id,
        type: type,
        amount: type === 'topup' ? amount : -amount,
        desc: type === 'topup' ? 'Пополнение баланса' : 'Вывод на карту',
        createdAt: randomDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), new Date())
      });
      transactionCount++;
    }

    console.log(`✅ Created ${transactionCount} additional transactions\n`);

    // Summary
    console.log('📊 Seeding Summary:');
    console.log(`   👤 Users: ${await User.countDocuments()}`);
    console.log(`      - Admin: ${await User.countDocuments({ role: 'Admin' })}`);
    console.log(`      - Clients: ${await User.countDocuments({ role: 'Client' })}`);
    console.log(`      - Freelancers: ${await User.countDocuments({ role: 'Freelancer' })}`);
    console.log(`   📝 Posts: ${await Post.countDocuments()}`);
    console.log(`      - Jobs: ${await Post.countDocuments({ type: 'job' })}`);
    console.log(`      - Gigs: ${await Post.countDocuments({ type: 'gig' })}`);
    console.log(`   💰 Transactions: ${await Transaction.countDocuments()}`);
    console.log('\n✅ Database seeding completed successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Admin: admin@stulink.com / admin123');
    console.log('   Client: client1@stulink.com / client123');
    console.log('   Freelancer: freelancer1@stulink.com / freelancer123\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

// Run seeding
seedDatabase();

