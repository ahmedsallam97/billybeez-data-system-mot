const test = require('node:test');
const assert = require('node:assert/strict');
const { hasGeneratedModels, sqliteClientReady } = require('../scripts/ensure-prisma-clients');

test('a default.js placeholder without generated schema models does not pass client readiness', () => {
  const placeholder = { Prisma: { prismaVersion: { client: '6.19.3' } }, PrismaClient: class { constructor() { throw new Error('Client did not initialize yet'); } } };
  assert.equal(hasGeneratedModels(placeholder), false);
  assert.equal(hasGeneratedModels({ Prisma: { dmmf: { datamodel: { models: [] } } } }), false);
  assert.equal(hasGeneratedModels(undefined), false);
});

test('the generated project client exposes models without connecting to a workplace database', () => {
  assert.equal(hasGeneratedModels(require('@prisma/client')), true);
  assert.equal(sqliteClientReady(), true);
});
