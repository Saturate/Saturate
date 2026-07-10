#!/usr/bin/env node

// Fetches TryHackMe public profile stats via headless Chrome.
// Needed because THM's API is behind Vercel's WAF.
// Writes result to thm-stats.json for the main generator to read.

import puppeteer from "puppeteer";
import { writeFileSync } from "node:fs";

const USERNAME = process.env.THM_USERNAME || "LANGSOMT";
const OUT = "thm-stats.json";

async function fetchTHM() {
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();

  await page.goto(`https://tryhackme.com/p/${USERNAME}`, { waitUntil: "networkidle2", timeout: 30000 });

  const data = await page.evaluate(async (username) => {
    const res = await fetch(`/api/v2/public-profile?username=${username}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  }, USERNAME);

  await browser.close();

  if (!data) {
    console.log("Failed to fetch THM profile");
    process.exit(1);
  }

  const stats = {
    username: data.username,
    level: data.capabilityScore?.value || data.level,
    totalPoints: data.totalPoints,
    rank: data.rank,
    topPercentage: data.topPercentage,
    badges: data.badgesNumber,
    completedRooms: data.completedRoomsNumber,
    streak: data.streak,
  };

  writeFileSync(OUT, JSON.stringify(stats, null, 2));
  console.log(`THM stats written to ${OUT}:`, stats);
}

fetchTHM().catch((err) => {
  console.error(err);
  process.exit(1);
});
