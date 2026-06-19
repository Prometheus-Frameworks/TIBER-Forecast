import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { registerDecisionBoardRoutes } from './routes/decisionBoard.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerPointScenarioLabRoutes } from './routes/pointScenarioLab.js';
import { registerProjectScenarioRoutes } from './routes/projectScenarios.js';
import { registerScenarioRoutes } from './routes/scenarios.js';
import { registerScoringRoutes } from './routes/scoring.js';
import { registerTiberScoringRoutes } from './routes/tiberScoring.js';

const defaultAllowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGIN
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return configuredOrigins?.length ? configuredOrigins : defaultAllowedOrigins;
};

export const createApp = () => {
  const app = new Hono();
  const allowedOrigins = parseAllowedOrigins();

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) {
          return origin;
        }

        return allowedOrigins.includes(origin) ? origin : null;
      },
    }),
  );

  app.get('/', (c) =>
    c.json({
      ok: true,
      service: 'tiber-fantasy-scoring-engine',
      description: 'In-season fantasy scoring kernel (xFPG, replacement, VORP, ranges, confidence).',
      endpoints: {
        health: '/health',
        scoringWeeklyPlayer: '/api/scoring/weekly/player',
        scoringWeeklyBatch: '/api/scoring/weekly/batch',
        scoringReplacement: '/api/scoring/replacement',
        scoringWeeklyRankings: '/api/scoring/weekly/rankings',
        scoringRos: '/api/scoring/ros',
        tiberWeeklyPlayerCard: '/api/tiber/weekly/player-card',
        tiberWeeklyRankings: '/api/tiber/weekly/rankings',
        tiberRosPlayerCard: '/api/tiber/ros/player-card',
        tiberWeeklyCompare: '/api/tiber/weekly/compare',
        legacyScenarios: '/api/scenarios',
        legacyScenarioProjection: '/api/project/scenarios',
        pointScenarioLabCompat: '/api/point-scenarios/lab',
      },
    }),
  );

  registerHealthRoutes(app);
  registerDecisionBoardRoutes(app);
  registerScoringRoutes(app);
  registerTiberScoringRoutes(app);
  registerScenarioRoutes(app);
  registerProjectScenarioRoutes(app);
  registerPointScenarioLabRoutes(app);

  app.notFound((c) => c.json({ ok: false, error: 'Not found' }, 404));

  return app;
};
