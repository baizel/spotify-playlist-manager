const FEATURE_CACHE_PREFIX = 'spm_feat_v1_';
const FEATURE_CACHE_MAX = 5000;

function getCachedFeatures(trackIds) {
    const cached = {}, missing = [];
    for (const id of trackIds) {
        const val = localStorage.getItem(FEATURE_CACHE_PREFIX + id);
        if (val) {
            try { cached[id] = JSON.parse(val); } catch { missing.push(id); }
        } else {
            missing.push(id);
        }
    }
    return { cached, missing };
}

function setCachedFeatures(featureMap) {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(FEATURE_CACHE_PREFIX));
    if (keys.length > FEATURE_CACHE_MAX) {
        keys.slice(0, Math.floor(FEATURE_CACHE_MAX * 0.2)).forEach(k => localStorage.removeItem(k));
    }
    for (const [id, features] of Object.entries(featureMap)) {
        try {
            localStorage.setItem(FEATURE_CACHE_PREFIX + id, JSON.stringify(features));
        } catch (e) {
            // QuotaExceededError — clear all feature cache entries and retry once
            Object.keys(localStorage)
                .filter(k => k.startsWith(FEATURE_CACHE_PREFIX))
                .forEach(k => localStorage.removeItem(k));
            try { localStorage.setItem(FEATURE_CACHE_PREFIX + id, JSON.stringify(features)); } catch {}
        }
    }
}

async function fetchAndCacheFeatures(trackIds) {
    if (!trackIds || !trackIds.length) return {};
    const { cached, missing } = getCachedFeatures(trackIds);
    if (!missing.length) return cached;
    try {
        const resp = await fetch('/api/sp/features', {
            method: 'POST',
            body: JSON.stringify(missing)
        });
        if (!resp.ok) return cached;
        const fetched = await resp.json();
        setCachedFeatures(fetched);
        return { ...cached, ...fetched };
    } catch (e) {
        console.warn('Feature fetch failed, using cache only', e);
        return cached;
    }
}
