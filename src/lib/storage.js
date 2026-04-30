import { get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from 'idb-keyval';

export const storage = {
  async get(key) {
    const value = await idbGet(key);
    if (value === undefined) return null;
    return { key, value, shared: false };
  },
  async set(key, value, shared = false) {
    await idbSet(key, value);
    return { key, value, shared };
  },
  async delete(key, shared = false) {
    await idbDel(key);
    return { key, deleted: true, shared };
  },
  async list(prefix = '', shared = false) {
    const allKeys = await idbKeys();
    const filtered = prefix
      ? allKeys.filter(k => typeof k === 'string' && k.startsWith(prefix))
      : allKeys;
    return { keys: filtered, prefix, shared };
  },
};
