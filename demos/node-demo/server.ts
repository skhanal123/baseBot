import './src/bootstrap/load-repo-dotenv.js';
import { createDemoApplication } from './src/bootstrap/create-demo-application.js';

const { app, redis, onShutdown, port, durableStore, toolsMode } = await createDemoApplication();

process.on('SIGINT', () => {
  void (async () => {
    await app.close();
    await redis.quit();
    await onShutdown();
    process.exit(0);
  })();
});

await app.listen({ port, host: '0.0.0.0' });
console.log(
  `Telecom agent demo on http://localhost:${String(port)} (store: ${durableStore}, tools: ${toolsMode})`,
);
