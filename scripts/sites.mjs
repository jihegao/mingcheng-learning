import { assets as rocketAssets } from '../sites/rocket/scripts/assets.mjs';

export const sites = [
  { name: 'mc', origin: 'https://mc.gaojihe.cn', directory: 'sites/mc/site', assets: ['index.html', 'submissions/index.html', 'vibe-coding/index.html'] },
  { name: 'rocket', origin: 'https://rocket.gaojihe.cn', directory: 'sites/rocket', assets: rocketAssets },
  { name: 'apcsp', origin: 'https://apcsp.gaojihe.cn', directory: 'sites/apcsp/site', assets: ['index.html', '404.html', 'assets/style.css', 'lectures/2-1/index.html', 'lectures/2-2/index.html', 'lectures/2-3/index.html', 'lectures/2-4/index.html', 'practice/cli-diary/index.html', 'practice/cli-diary/diary.py', 'data/W09_博客文章_清洗前.csv', 'data/W09_博客文章_已清洗.csv'] },
];

export function assetUrl(site, file) {
  const route = file.endsWith('index.html') ? file.slice(0, -10) : file;
  return new URL(route, `${site.origin}/`).href;
}
