import { config } from './config.js'
import { buildApp } from './app.js'

// ─── Start (standart server) ─────────────────────────────────────
// Vercel serverless uchun buildApp() `api/[...all].ts` da ishlatiladi.
const start = async () => {
  try {
    const app = await buildApp()
    await app.listen({ port: config.server.port, host: config.server.host })
    app.log.info(`
╔══════════════════════════════════════════════╗
║  🚀 Attestatsiya API Server                 ║
║  ─────────────────────────────               ║
║  Port:    ${String(config.server.port).padEnd(33)}║
║  Host:    ${config.server.host.padEnd(33)}║
║  Mode:    ${config.server.nodeEnv.padEnd(33)}║
║                                              ║
║  Endpoints:                                  ║
║  • GET  /api/health                          ║
║  • POST /api/auth/register                   ║
║  • POST /api/auth/login                      ║
║  • POST /api/auth/refresh                    ║
║  • POST /api/auth/logout                     ║
║  • POST /api/auth/reset-password             ║
║  • POST /api/auth/update-password            ║
║  • POST /api/auth/resend-confirmation        ║
║  • GET  /api/auth/me                         ║
║  • PATCH /api/auth/profile                   ║
║  • POST /api/exam/start                      ║
║  • POST /api/exam/submit                     ║
║  • POST /api/exam/finish                     ║
║  • GET  /api/exam/:id/review                 ║
║  • GET  /api/exam/due-reviews                ║
║  • POST /api/progress/sync                   ║
║  • GET  /api/progress/modules                ║
║  • GET  /api/content/modules                 ║
║  • GET  /api/content/modules/:id             ║
║  • GET  /api/content/lessons/:id             ║
║  • GET  /api/content/constructs              ║
║  • GET  /api/admin/attempts                   ║
║  • GET  /api/admin/attempts/:id               ║
╚══════════════════════════════════════════════╝
`)
  } catch (err) {
    console.error('❌ Server failed to start:', err)
    process.exit(1)
  }
}

start()
