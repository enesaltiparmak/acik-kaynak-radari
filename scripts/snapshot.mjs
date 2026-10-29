#!/usr/bin/env node
// Günlük snapshot: GitHub GraphQL API'den Türkiye kaynaklı popüler depoları çeker,
// latest.json ve history.json dosyalarını günceller.
//
// Kullanım: GH_TOKEN=... node scripts/snapshot.mjs --out <klasör>
// Token yalnızca ortam değişkeninden okunur; hiçbir dosyaya ya da log'a yazılmaz.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { dayKey, mergeSnapshot } from './lib.mjs';

const API = 'https://api.github.com/graphql';
const LOCATIONS = [
  'Turkey', 'Türkiye', 'Turkiye', 'Istanbul', 'İstanbul', 'Ankara', 'Izmir', 'İzmir',
  'Bursa', 'Antalya', 'Eskisehir', 'Kocaeli', 'Konya', 'Trabzon', 'Manisa',
];
const GFI_LABELS = ['good first issue', 'good-first-issue', 'Good First Issue', 'first-timers-only'];
const MAX_REPOS = 500;
const MIN_STARS = 30;
const REPOS_PER_OWNER = 6;

const args = process.argv.slice(2);
const outDir = argValue('--out') ?? 'public/data';

function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables, attempt = 1) {
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('GH_TOKEN ortam değişkeni tanımlı değil');
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'acik-kaynak-radari',
    },
    body: JSON.stringify({ query, variables }),
  });
  // 403/429: ikincil hız sınırı; 5xx: geçici hata. Üstel bekleme ile en fazla 4 deneme.
  if ([403, 429, 500, 502, 503, 504].includes(res.status) && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after')) || 2 ** attempt * 5;
    console.warn(`HTTP ${res.status}, ${retryAfter} sn sonra tekrar denenecek (${attempt}/3)`);
    await sleep(retryAfter * 1000);
    return gql(query, variables, attempt + 1);
  }
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length && !body.data) {
    throw new Error(`GraphQL hatası: ${body.errors.map((e) => e.message).join('; ')}`);
  }
  if (body.errors?.length) console.warn(`Kısmi GraphQL hatası: ${body.errors[0].message}`);
  const rl = body.data?.rateLimit;
  if (rl && rl.remaining < 100) {
    const wait = Date.parse(rl.resetAt) - Date.now();
    console.warn(`Hız sınırına yaklaşıldı (kalan ${rl.remaining}); ${Math.ceil(wait / 1000)} sn bekleniyor`);
    await sleep(Math.max(wait, 0) + 1000);
  }
  return body.data;
}

const REPO_FIELDS = `
  nameWithOwner url description stargazerCount forkCount isArchived isFork
  pushedAt createdAt
  primaryLanguage { name }
  licenseInfo { spdxId }
  repositoryTopics(first: 5) { nodes { topic { name } } }
  issues(states: OPEN) { totalCount }
  gfi: issues(states: OPEN, labels: ${JSON.stringify(GFI_LABELS)}) { totalCount }
`;

const OWNER_QUERY = `
query($q: String!, $cursor: String) {
  rateLimit { remaining resetAt cost }
  search(query: $q, type: USER, first: 20, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on User {
        repositories(first: ${REPOS_PER_OWNER}, orderBy: {field: STARGAZERS, direction: DESC},
                     ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { nodes { ${REPO_FIELDS} } }
      }
      ... on Organization {
        repositories(first: ${REPOS_PER_OWNER}, orderBy: {field: STARGAZERS, direction: DESC},
                     isFork: false, privacy: PUBLIC) { nodes { ${REPO_FIELDS} } }
      }
    }
  }
}`;

function toRepo(n) {
  return {
    id: n.nameWithOwner,
    url: n.url,
    desc: (n.description ?? '').slice(0, 200),
    lang: n.primaryLanguage?.name ?? null,
    license: n.licenseInfo?.spdxId ?? null,
    topics: (n.repositoryTopics?.nodes ?? []).map((t) => t.topic.name),
    stars: n.stargazerCount,
    forks: n.forkCount,
    issues: n.issues?.totalCount ?? 0,
    gfi: n.gfi?.totalCount ?? 0,
    pushedAt: n.pushedAt,
    createdAt: n.createdAt,
  };
}

async function collectRepos() {
  // Konum bilgisi yalnızca aramada kullanılır; kullanıcı profili veya konum yayımlanmaz.
  const byId = new Map();
  for (const loc of LOCATIONS) {
    let cursor = null;
    for (let page = 0; page < 5; page++) {
      const q = `location:"${loc}" repos:>2 followers:>20 sort:followers-desc`;
      const data = await gql(OWNER_QUERY, { q, cursor });
      for (const owner of data.search.nodes) {
        for (const n of owner?.repositories?.nodes ?? []) {
          if (!n || n.isArchived || n.isFork || n.stargazerCount < MIN_STARS) continue;
          byId.set(n.nameWithOwner, toRepo(n));
        }
      }
      console.log(`${loc} s${page + 1}: toplam ${byId.size} depo`);
      if (!data.search.pageInfo.hasNextPage) break;
      cursor = data.search.pageInfo.endCursor;
      await sleep(1000);
    }
  }
  return [...byId.values()].sort((a, b) => b.stars - a.stars).slice(0, MAX_REPOS);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const latestPath = join(outDir, 'latest.json');
  const historyPath = join(outDir, 'history.json');
  const previous = await readJson(latestPath, null);
  let history = await readJson(historyPath, { version: 1, repos: {} });
  const now = new Date().toISOString();
  const today = dayKey(now);

  try {
    const repos = await collectRepos();
    if (repos.length < 50) throw new Error(`Beklenenden az depo döndü (${repos.length})`);
    history = mergeSnapshot(history, today, repos);

    const latest = {
      version: 1,
      generatedAt: now,
      lastAttemptAt: now,
      status: 'ok',
      source: { name: 'GitHub GraphQL API', url: 'https://docs.github.com/graphql', terms: 'https://docs.github.com/site-policy/github-terms/github-terms-of-service' },
      method: `Konumu Türkiye veya bir Türkiye şehri olan, 20+ takipçili hesap ve kuruluşların en çok yıldızlı ${REPOS_PER_OWNER} deposu; arşivlenmemiş, fork olmayan, ${MIN_STARS}+ yıldızlı ilk ${MAX_REPOS} depo.`,
      repos,
    };
    await writeFile(latestPath, JSON.stringify(latest));
    await writeFile(historyPath, JSON.stringify(history));
    console.log(`Tamam: ${repos.length} depo, ${today}`);
  } catch (err) {
    // Kaynak çalışmazsa son başarılı veri korunur, yalnızca deneme durumu güncellenir.
    console.error(`Snapshot başarısız: ${err.message}`);
    if (previous) {
      await writeFile(latestPath, JSON.stringify({ ...previous, lastAttemptAt: now, status: 'error', error: err.message }));
    }
    process.exitCode = 1;
  }
}

main();
