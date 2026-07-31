# Attestatsiya Backend

Informatika attestatsiya platformasi backend API (Fastify + Supabase, Vercel serverless).

- **Production:** https://attestatsiya-backend.vercel.app
- **Avtomatik deploy:** `main` branch'ga push'da Vercel GitHub integratsiya orqali
- **Endpointlar:** `/api/health`, `/api/auth/*`, `/api/exam/*`, `/api/progress/*`, `/api/content/*`, `/api/admin/*`
- **Lokal ishga tushirish:** `npm install && npm run dev` (http://localhost:3001)

Env o'zgaruvchilari uchun `.env.example` faylini `.env` ga copy qiling:
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `AUTH_REDIRECT_URL`.
