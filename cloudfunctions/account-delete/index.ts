import { OWNED_COLLECTIONS, type AccountDeleteRepository } from './service';
const cloudbase = require('@cloudbase/node-sdk') as { SYMBOL_CURRENT_ENV: string; getCloudbaseContext(context: unknown): { WX_OPENID?: string }; init(options: { env: string }): { database(): any } };
const { deleteOwnedAccount, AccountDeleteError } = require('./service') as typeof import('./service');
const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const database = app.database();
export {};
function repository(): AccountDeleteRepository {
  const ownedCollections = new Set(OWNED_COLLECTIONS);
  return {
    async deleteOwned(collection, openid) { if (!ownedCollections.has(collection)) throw new Error('unknown collection'); await database.collection(collection).where({ _openid: openid }).remove(); },
    async audit(event) { await database.collection('deletion_audits').add({ ...event }); },
  };
}
exports.main = async (_event: unknown, context: unknown) => {
  const openid = cloudbase.getCloudbaseContext(context).WX_OPENID;
  try { return { ok: true, result: await deleteOwnedAccount(openid ?? '', repository(), () => new Date()) }; }
  catch (error) { return { ok: false, code: error instanceof AccountDeleteError ? error.code : 'INTERNAL_ERROR' }; }
};
