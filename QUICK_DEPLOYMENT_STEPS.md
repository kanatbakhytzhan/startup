# 🚀 Quick Deployment Steps - Copy & Paste

## 1️⃣ MongoDB Atlas Setup

1. Create account at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Create FREE cluster
3. Click "Connect" → "Connect your application"
4. Copy connection string
5. Replace `<password>` with your password
6. Add `/stulink` before `?retryWrites=true`
7. **Save this string** - you'll paste it in Vercel!

---

## 2️⃣ Git & GitHub Commands

```bash
git init
git add .
git commit -m "Initial commit: StuLink ready for deployment"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git branch -M main
git push -u origin main
```

**First time?** Create repo at [github.com/new](https://github.com/new) first!

---

## 3️⃣ Vercel Deployment

### Via Dashboard (Easiest):

1. Go to [vercel.com](https://vercel.com) → "Add New Project"
2. Import your GitHub repo
3. **Add Environment Variables:**
   - `MONGODB_URI` = (paste your MongoDB Atlas connection string)
   - `JWT_SECRET` = (run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
   - `NODE_ENV` = `production`
4. Click "Deploy"
5. Done! 🎉

### Via CLI:

```bash
npm install -g vercel
vercel login
vercel
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add NODE_ENV
vercel --prod
```

---

## 4️⃣ MongoDB Atlas Network Access

1. MongoDB Atlas Dashboard → "Network Access"
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere"
4. Confirm

---

## ✅ Files Created/Updated

- ✅ `vercel.json` - Vercel configuration
- ✅ `.gitignore` - Updated (excludes .env, node_modules)
- ✅ `package.json` - Added engines and vercel-build script
- ✅ `server.js` - Updated to use `process.env.MONGODB_URI`
- ✅ `api.js` - Auto-detects production/development URLs

---

## 🔗 Your Site Will Be Live At:

`https://your-project-name.vercel.app`

---

**That's it!** Your StuLink app is now live! 🚀

