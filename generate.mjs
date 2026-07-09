#!/usr/bin/env node

// Generates README.md from live GitHub data.
// Run: node generate.mjs
// Requires: GITHUB_TOKEN env var (or gh CLI auth token).

const USERNAME = "Saturate";
const DISPLAY_NAME = "Allan Kimmer Jensen";
const WEBSITE = "https://akj.io";
const LOCATION = "Copenhagen, Denmark";
const TWITTER = "allankjensen";
const LINKEDIN = "allankimmerjensen";

const FEATURED_REPOS = [
  { repo: "Saturate/HUSK", desc: "Observability meets context engineering for AI agents. OTel-native." },
  { repo: "Saturate/clync", desc: "Encrypted sync/backup for Claude Code sessions and memories." },
  { repo: "Saturate/agents", desc: "Skills, plugins, and config for AI coding agents." },
  { repo: "Saturate/ccbar", desc: "Fast, configurable statusline for Claude Code. Rust binary." },
  { repo: "Saturate/CVE-2025-55182-Scanner", desc: "Bash scanner for CVE-2025-55182 in Next.js apps." },
  { repo: "Saturate/CVE-2025-55183", desc: "CVE-2025-55183 secret miner." },
  { repo: "Saturate/PromptKiddie", desc: "You are an expert script kiddie, make no mistakes." },
  { repo: "Saturate/ip-enrichment", desc: "Multi-provider threat intel and geolocation service." },
  { repo: "Saturate/traefik-wordpress", desc: "Traefik reverse proxy with HTTPS for WordPress and more." },
  { repo: "Saturate/ridgeline", desc: "Cross-tenant pull request monitor for Azure DevOps." },
];

const PINNED_CONTRIBUTION_REPOS = [
  "pnpm/pnpm",
  "pnpm/pacquet",
  "puppeteer/puppeteer",
  "npm/npm",
  "jumbocontext/jumbo.cli",
];


async function ghFetch(path) {
  const token = process.env.GITHUB_TOKEN || await getGhToken();
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${path}`);
  return res.json();
}

async function getGhToken() {
  const { execSync } = await import("node:child_process");
  return execSync("gh auth token", { encoding: "utf-8" }).trim();
}

async function fetchProfile() {
  return ghFetch(`/users/${USERNAME}`);
}

async function fetchRepoData(fullName) {
  try {
    const repo = await ghFetch(`/repos/${fullName}`);
    return {
      name: repo.full_name,
      description: repo.description || "",
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      url: repo.html_url,
    };
  } catch {
    return null;
  }
}

async function fetchAllExternalPRs() {
  const allPRs = [];
  let page = 1;
  while (page <= 5) {
    try {
      const data = await ghFetch(
        `/search/issues?q=author:${USERNAME}+type:pr+-user:${USERNAME}&sort=created&order=desc&per_page=100&page=${page}`
      );
      for (const pr of data.items) {
        const repo = pr.repository_url.split("/").slice(-2).join("/");
        allPRs.push({
          title: pr.title,
          url: pr.html_url,
          date: pr.created_at.split("T")[0],
          repo,
        });
      }
      if (data.items.length < 100) break;
      page++;
    } catch {
      break;
    }
  }
  return allPRs;
}

async function fetchNpmDownloads(repoFullName) {
  try {
    const pkg = await ghFetch(`/repos/${repoFullName}/contents/package.json`);
    const json = JSON.parse(Buffer.from(pkg.content, "base64").toString());
    if (!json.name || json.private) return null;
    const res = await fetch(`https://api.npmjs.org/downloads/point/last-month/${json.name}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.downloads > 0 ? { name: json.name, downloads: data.downloads } : null;
  } catch {
    return null;
  }
}

function repoCard(repo, overrideDesc) {
  const desc = overrideDesc || repo.description;
  const lang = repo.language ? `\`${repo.language}\`` : "";
  return `| [${repo.name}](${repo.url}) | ${desc} | ${lang} |`;
}

async function contributionSection(allPRs) {
  const grouped = {};
  for (const pr of allPRs) {
    if (!grouped[pr.repo]) grouped[pr.repo] = [];
    grouped[pr.repo].push(pr);
  }

  const allRepos = [...new Set(Object.keys(grouped))];
  const pinnedSet = new Set(PINNED_CONTRIBUTION_REPOS);

  console.log(`Fetching star counts for ${allRepos.length} contributed repos...`);
  const repoData = await Promise.all(
    allRepos.map(async (name) => {
      try {
        const data = await ghFetch(`/repos/${name}`);
        return { name, stars: data.stargazers_count, description: data.description || "", pinned: pinnedSet.has(name) };
      } catch {
        return { name, stars: 0, description: "", pinned: pinnedSet.has(name) };
      }
    })
  );

  console.log(`Fetching npm download counts...`);
  const npmData = {};
  await Promise.all(
    allRepos.map(async (name) => {
      const result = await fetchNpmDownloads(name);
      if (result) npmData[name] = result;
    })
  );

  const pinnedOrder = PINNED_CONTRIBUTION_REPOS.filter((r) => allRepos.includes(r));
  const pinnedRows = pinnedOrder.map((name) => repoData.find((r) => r.name === name));
  const restRows = repoData.filter((r) => !r.pinned).sort((a, b) => b.stars - a.stars);
  const ordered = [...pinnedRows, ...restRows];

  const hasAnyDownloads = ordered.some((r) => npmData[r.name]);
  const dlHeader = hasAnyDownloads ? " Downloads/mo |" : "";
  const dlAlign = hasAnyDownloads ? " -----------:|" : "";

  let table = `| Repository | Description | Stars | PRs |${dlHeader}\n`;
  table += `|:-----------|:------------|------:|----:|${dlAlign}\n`;
  for (const repo of ordered) {
    const prCount = (grouped[repo.name] || []).length;
    const desc = repo.description.length > 80
      ? repo.description.slice(0, 77) + "..."
      : repo.description;
    const stars = repo.stars > 0 ? repo.stars.toLocaleString() : "";
    const dl = hasAnyDownloads
      ? ` ${npmData[repo.name] ? npmData[repo.name].downloads.toLocaleString() : ""} |`
      : "";
    table += `| [${repo.name}](https://github.com/${repo.name}) | ${desc} | ${stars} | ${prCount} |${dl}\n`;
  }
  const orderedNames = ordered.map((r) => r.name);

  let comment = "\n<!--\nContribution details:\n";
  for (const repo of orderedNames) {
    const prs = grouped[repo] || [];
    comment += `\n${repo}:\n`;
    for (const pr of prs.slice(0, 5)) {
      comment += `  - ${pr.title}: ${pr.url}\n`;
    }
  }
  comment += "-->\n";

  return `${table}\n${comment}`;
}

function statsCards() {
  const theme = "transparent";
  const textColor = "c9d1d9";
  const titleColor = "58a6ff";
  const iconColor = "58a6ff";
  const borderColor = "30363d";
  const params = `theme=${theme}&text_color=${textColor}&title_color=${titleColor}&icon_color=${iconColor}&border_color=${borderColor}&hide_border=false`;

  const statsUrl = `https://github-readme-stats.vercel.app/api?username=${USERNAME}&show_icons=true&count_private=true&include_all_commits=true&${params}`;
  const langsUrl = `https://github-readme-stats.vercel.app/api/top-langs/?username=${USERNAME}&layout=compact&langs_count=10&hide=coffeescript&${params}`;
  const streakUrl = `https://github-readme-streak-stats.herokuapp.com/?user=${USERNAME}&theme=transparent&ring=${titleColor}&fire=${titleColor}&currStreakLabel=${textColor}&sideLabels=${textColor}&dates=${textColor}&stroke=${borderColor}&border=${borderColor}&currStreakNum=${textColor}&sideNums=${textColor}`;

  return `<p>
  <img src="${statsUrl}" height="170" alt="GitHub stats" />
  <img src="${langsUrl}" height="170" alt="Top languages" />
</p>
<p>
  <img src="${streakUrl}" height="170" alt="GitHub streak" />
</p>`;
}

async function generate() {
  console.log("Fetching profile...");
  const profile = await fetchProfile();

  console.log("Fetching featured repos...");
  const repoResults = await Promise.all(
    FEATURED_REPOS.map((f) => fetchRepoData(f.repo))
  );
  const repos = repoResults.filter(Boolean);

  console.log("Fetching contribution PRs...");
  const allPRs = await fetchAllExternalPRs();

  const memberSince = new Date(profile.created_at).getFullYear();
  const now = new Date();
  const years = now.getFullYear() - memberSince;

  const featuredByCategory = {
    "Security Research": FEATURED_REPOS.filter((f) =>
      ["CVE-", "PromptKiddie", "ip-enrichment"].some((n) => f.repo.includes(n))
    ),
    "DevOps & Infrastructure": FEATURED_REPOS.filter((f) =>
      ["traefik", "ridgeline"].some((n) => f.repo.includes(n))
    ),
    "AI Agent Tooling": FEATURED_REPOS.filter((f) =>
      ["HUSK", "clync", "agents", "ccbar"].some((n) => f.repo.includes(n))
    ),
  };

  let featuredTable = "";
  for (const [category, items] of Object.entries(featuredByCategory)) {
    featuredTable += `\n**${category}**\n\n`;
    featuredTable += "| Repository | Description | Info |\n";
    featuredTable += "|:-----------|:------------|:-----|\n";
    for (const item of items) {
      const repo = repos.find((r) => r.name === item.repo);
      if (repo) {
        featuredTable += repoCard(repo, item.desc) + "\n";
      }
    }
  }

  const md = `# ${DISPLAY_NAME}

Full-stack builder from ${LOCATION}. I split my time between security research and AI agent tooling, with a long history of shipping DevOps infrastructure, browser extensions, game mods, and whatever else catches my interest.

${years}+ years on GitHub. ${profile.public_repos} public repos. Building at [Remmik](https://github.com/Remmik) & [NORRIQ](https://norriq.com).

[![Website](https://img.shields.io/badge/akj.io-000?style=flat-square&logo=safari&logoColor=white)](${WEBSITE})
[![Twitter](https://img.shields.io/badge/@${TWITTER}-000?style=flat-square&logo=x&logoColor=white)](https://x.com/${TWITTER})
[![LinkedIn](https://img.shields.io/badge/LinkedIn-000?style=flat-square&logo=linkedin&logoColor=white)](https://linkedin.com/in/${LINKEDIN})
[![CV](https://img.shields.io/badge/CV-000?style=flat-square&logo=readthedocs&logoColor=white)](https://akj.io/cv)
[![Email](https://img.shields.io/badge/Email-000?style=flat-square&logo=maildotru&logoColor=white)](mailto:hello@akj.io)

---

## Featured projects

${featuredTable}

## Open source contributions

${await contributionSection(allPRs)}

## Stats

${statsCards()}

---

<sub>This README is generated by [generate.mjs](./generate.mjs) and updated daily via GitHub Actions.</sub>
`;

  const { writeFileSync } = await import("node:fs");
  writeFileSync("README.md", md);
  console.log("README.md generated.");
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});
