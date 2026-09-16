/* 云端共享层：实验手册与批次数据全员共享。
   数据存云端数据库（匿名可读写），本地 IndexedDB 作为缓存与离线缓冲；
   启动时拉取云端增量合并进本地，写入后即时推送云端。 */
(function () {
  const PUBLIC_CONFIG = {
    endpoint: 'https://lab-notebook.app.workbuddy.host',
    publishableKey: 'wbpk_F0LmuklhyrrKIe6CXL6XNq_75LK646zimDbPeszeTVf1sCL6xPDkRVm'
  };
  let cloud = null;
  let ready = false;
  let dbRef = null;

  function init() {
    try {
      if (!window.WorkBuddyCloud) { console.warn('云端 SDK 未加载，本次以本机模式运行'); return; }
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: PUBLIC_CONFIG.endpoint,
        publishableKey: PUBLIC_CONFIG.publishableKey
      });
      ready = true;
    } catch (e) { console.warn('云端初始化失败，本次以本机模式运行', e); }
  }
  init();

  function say(msg) {
    try { if (typeof window.toast === 'function') window.toast(msg); else console.warn(msg); } catch (e) { console.warn(msg); }
  }
  function unwrap(res, what) {
    if (res && res.error) throw new Error((what || '云端操作') + '失败：' + (res.error.message || '未知错误'));
    return res ? res.data : null;
  }
  async function idbGet(key) {
    if (!dbRef) return undefined;
    return await new Promise((resolve) => {
      const rq = dbRef.transaction('state', 'readonly').objectStore('state').get(key);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => resolve(undefined);
    });
  }
  async function idbPut(key, value) {
    if (!dbRef) return;
    await new Promise((resolve, reject) => {
      const tx = dbRef.transaction('state', 'readwrite');
      tx.objectStore('state').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function pullRows(table) {
    if (!ready) return null;
    try {
      const rows = unwrap(await cloud.database.from(table).select('id,data,updated_at').limit(1000), '云端读取');
      const map = {};
      (rows || []).forEach(r => { map[r.id] = { data: r.data, updated_at: r.updated_at }; });
      return map;
    } catch (e) { console.warn('云端读取失败(' + table + ')', e); return null; }
  }
  async function upsertRow(table, id, data) {
    const res = await cloud.database.from(table).upsert({ id: String(id), data: data, updated_at: new Date().toISOString() });
    if (res && res.error) throw new Error(table + ' 写入失败：' + (res.error.message || '未知错误'));
  }
  async function deleteRow(table, id) {
    const res = await cloud.database.from(table).delete().eq('id', String(id));
    if (res && res.error) throw new Error(table + ' 删除失败：' + (res.error.message || '未知错误'));
  }
  async function markTombstone(kind, id) {
    const tomb = (await idbGet('tombstones')) || { runs: [], templates: [] };
    if (!tomb[kind]) tomb[kind] = [];
    if (tomb[kind].indexOf(id) < 0) { tomb[kind].push(id); await idbPut('tombstones', tomb); }
    await pushMeta();
  }

  /* ---------- 启动：拉取云端 → 与本地合并 → 推送本地独有行 ---------- */
  async function boot(db) {
    dbRef = db;
    if (!ready) return;
    let cloudExp, cloudRuns, cloudMeta;
    try {
      [cloudExp, cloudRuns, cloudMeta] = await Promise.all([
        pullRows('experiments'), pullRows('runs'), pullRows('meta')
      ]);
      if (cloudExp === null && cloudRuns === null && cloudMeta === null) return; // 云端不可达：本机模式
    } catch (e) { console.warn('云端启动失败，本次以本机模式运行', e); return; }

    const localRuns = await idbGet('runs'), localTpls = await idbGet('templates'),
      localEdits = await idbGet('templateEdits'), localNames = await idbGet('templateNames'),
      localTombRaw = await idbGet('tombstones');
    const localRunsArr = Array.isArray(localRuns) ? localRuns : [];
    const localTplArr = Array.isArray(localTpls) ? localTpls : [];
    cloudExp = cloudExp || {}; cloudRuns = cloudRuns || {}; cloudMeta = cloudMeta || {};
    const cloudMetaRow = cloudMeta['meta'] ? (cloudMeta['meta'].data || {}) : {};
    const cloudTomb = cloudMetaRow.tombstones || { runs: [], templates: [] };
    const localTomb = localTombRaw || { runs: [], templates: [] };
    const tomb = {
      runs: [...new Set([...(cloudTomb.runs || []), ...(localTomb.runs || [])])],
      templates: [...new Set([...(cloudTomb.templates || []), ...(localTomb.templates || [])])]
    };

    /* 合并 runs：同 id 取 updatedAt 较新者；云端独有补入；墓碑剔除 */
    const runMap = {};
    localRunsArr.forEach(r => { runMap[r.id] = r; });
    Object.keys(cloudRuns).forEach(id => {
      if (tomb.runs.indexOf(id) >= 0) { delete runMap[id]; return; }
      const c = cloudRuns[id].data, l = runMap[id];
      if (!l) runMap[id] = c;
      else if (String((c && c.updatedAt) || '') > String(l.updatedAt || '')) runMap[id] = c;
    });
    tomb.runs.forEach(id => { delete runMap[id]; });
    const mergedRuns = Object.keys(runMap).map(id => runMap[id]);

    /* 合并 templates：同 id 云端优先；墓碑剔除 */
    const tplMap = {};
    localTplArr.forEach(t => { tplMap[t.id] = t; });
    Object.keys(cloudExp).forEach(id => {
      if (tomb.templates.indexOf(id) >= 0) { delete tplMap[id]; return; }
      tplMap[id] = cloudExp[id].data;
    });
    tomb.templates.forEach(id => { delete tplMap[id]; });
    const mergedTpls = Object.keys(tplMap).map(id => tplMap[id]);

    /* 合并 meta：逐键云端优先（本地独有键保留） */
    const mergedEdits = Object.assign({}, localEdits || {}, cloudMetaRow.templateEdits || {});
    const mergedNames = Object.assign({}, localNames || {}, cloudMetaRow.templateNames || {});

    await idbPut('runs', mergedRuns);
    await idbPut('templates', mergedTpls);
    await idbPut('templateEdits', mergedEdits);
    await idbPut('templateNames', mergedNames);
    await idbPut('tombstones', tomb);

    /* 推送本地独有行（云端缺失的 id） */
    const push = [];
    mergedRuns.forEach(r => { if (!cloudRuns[r.id]) push.push(upsertRow('runs', r.id, r).catch(e => { throw new Error('批次推送失败：' + e.message); })); });
    mergedTpls.forEach(t => { if (!cloudExp[t.id]) push.push(upsertRow('experiments', t.id, t).catch(e => { throw new Error('手册推送失败：' + e.message); })); });
    const cloudMetaSig = JSON.stringify([cloudMetaRow.templateEdits || {}, cloudMetaRow.templateNames || {}, cloudTomb]);
    const localMetaSig = JSON.stringify([mergedEdits, mergedNames, tomb]);
    if (cloudMetaSig !== localMetaSig) push.push(upsertRow('meta', 'meta', { templateEdits: mergedEdits, templateNames: mergedNames, tombstones: tomb }));
    const results = await Promise.allSettled(push);
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length) say('云端同步部分失败：' + (failed[0].reason && failed[0].reason.message || '未知错误'));
  }

  /* ---------- 写入钩子：本地保存后即时推送 ---------- */
  async function pushRunsChanged(prevArr, nextArr) {
    if (!ready) return;
    try {
      const prevMap = {};
      (prevArr || []).forEach(r => { prevMap[r.id] = JSON.stringify(r); });
      const nextIds = {};
      for (const r of (nextArr || [])) {
        nextIds[r.id] = 1;
        if (prevMap[r.id] !== JSON.stringify(r)) await upsertRow('runs', r.id, r);
      }
      for (const id of Object.keys(prevMap)) {
        if (!nextIds[id]) { await deleteRow('runs', id); await markTombstone('runs', id); }
      }
    } catch (e) { say('云端同步失败，下次保存会自动重试：' + e.message); }
  }
  async function pushTemplatesChanged(prevArr, nextArr) {
    if (!ready) return;
    try {
      const prevMap = {};
      (prevArr || []).forEach(t => { prevMap[t.id] = JSON.stringify(t); });
      const nextIds = {};
      for (const t of (nextArr || [])) {
        nextIds[t.id] = 1;
        if (prevMap[t.id] !== JSON.stringify(t)) await upsertRow('experiments', t.id, t);
      }
      for (const id of Object.keys(prevMap)) {
        if (!nextIds[id]) { await deleteRow('experiments', id); await markTombstone('templates', id); }
      }
    } catch (e) { say('云端同步失败，下次保存会自动重试：' + e.message); }
  }
  async function pushMeta() {
    if (!ready) return;
    try {
      const edits = await idbGet('templateEdits'), names = await idbGet('templateNames'), tomb = await idbGet('tombstones');
      await upsertRow('meta', 'meta', { templateEdits: edits || {}, templateNames: names || {}, tombstones: tomb || { runs: [], templates: [] } });
    } catch (e) { say('云端同步失败：' + e.message); }
  }

  window.cloudSync = { boot, pushRunsChanged, pushTemplatesChanged, pushMeta };
})();
