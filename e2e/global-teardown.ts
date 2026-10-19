import { dropDatabase } from './support/database.js';

export default async function globalTeardown() {
  await dropDatabase();
}
