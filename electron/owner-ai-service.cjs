// Optional owner-only provisioning. No credential input or retrieval is exposed to the renderer.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');
const {createManagedAIService} = require('./managed-ai-service.cjs');

async function createOwnerAIService({directory, safeStorage, getState, appendTasks, fetchImpl = fetch, now}) {
  const file = path.join(directory, 'owner-ai.enc');
  if (!fs.existsSync(file)) return null;
  if (!safeStorage.isEncryptionAvailable()) throw Error('Windows encryption is unavailable.');
  let secret;
  try { secret = JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); }
  catch { throw Error('Owner AI setup cannot be unlocked on this Windows account.'); }
  if (secret.version !== 1 || typeof secret.key !== 'string' || !/^sk-[A-Za-z0-9_-]{20,512}$/.test(secret.key))
    throw Error('Owner AI setup is invalid.');
  const {DatabaseSync} = require('node:sqlite');
  const {createManagedPlanner} = await import(pathToFileURL(path.join(__dirname, '../server/ai-planner.mjs')).href);
  const db = new DatabaseSync(path.join(directory, 'owner-ai-usage.sqlite'));
  db.exec('PRAGMA journal_mode=WAL');
  let planner;
  try { planner = createManagedPlanner({db, apiKey:secret.key, fetchImpl, now, globalDailyLimit:3}); }
  catch (error) { db.close(); throw error; }
  secret = null;
  const token = randomUUID(), url = 'https://owner.munka.invalid';
  // Internal transport only: no listening port, public registration or network account.
  const service = createManagedAIService({url, getState, appendTasks, now,
    getSession:()=>({url, token, user:{id:'owner'}}),
    saveSession:()=>{throw Error('Owner AI does not use online sign-in.');}, clearSession:()=>{},
    fetchImpl:async (target, options)=> {
      if (options.headers.Authorization !== 'Bearer '+token) return Response.json({error:'Unauthorized'},{status:401});
      try {
        if (target===url+'/ai/status') return Response.json(planner.status('owner'));
        if (target===url+'/ai/plan') return Response.json(await planner.propose('owner', JSON.parse(options.body), options.signal));
        return Response.json({error:'Not found'},{status:404});
      } catch (error) { return Response.json({code:error.code,error:error.status?error.message:'AI is unavailable.'},{status:error.status||500}); }
    },
  });
  return {...service, status:async()=>({...await service.status(), ownerManaged:true}),
    signIn:async()=>{throw Error('This PC is already connected by its owner.');},
    disconnect:async()=>{throw Error('Use the owner setup utility to remove this PC’s AI connection.');},
  };
}
module.exports = {createOwnerAIService};
