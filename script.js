// DATA SOURCES
const SOURCES = {
  magic: {
    id: "magic",
    label: "MagicOctopus (ENABLE-derived)",
    url:
      "https://raw.githubusercontent.com/MagicOctopusUrn/wordListsByLength/refs/heads/master/unsorted.txt"
  },
  dwyl: {
    id: "dwyl",
    label: "dwyl words.txt",
    url: "https://raw.githubusercontent.com/dwyl/english-words/master/words.txt"
  }
};

// Default source: "magic" or "dwyl"
let currentSourceKey = "magic";

// DOM ELEMENTS
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const statusText = document.getElementById("statusText");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
const sortButtons = document.querySelectorAll(".sort-button");
const sourceStatusEl = document.getElementById("sourceStatus");
const sourceButtons = document.querySelectorAll(".source-button");

// STATE
let words = [];
let loaded = false;
let loadFailed = false;

const MAX_RESULTS = 5000; // global cap for displayed results
let currentMatches = [];  // filtered+sorted list actually rendered
let baseMatches = [];     // full set of matches for current query (before per-mode sampling)
let currentQuery = "";
let currentSortMode = "alpha"; // "alpha" | "length" | "rarity"

// Extra words you can maintain directly here (not via the UI)
const EXTRA_WORDS = [
  // "robloxian",
  // "photon",
  // "overwatch",
];

// Per-result-set data (computed from baseMatches)
let currentLetterFreq = null;
let currentLetterWeight = null;
let currentRarityScores = null;

// Build letter frequency for a list of words. [web:31][web:32][web:35]
function buildLetterFrequency(wordsList) {
  const counts = {};
  let total = 0;

  for (const word of wordsList) {
    const lower = word.toLowerCase();
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i];
      if (ch < "a" || ch > "z") continue;
      counts[ch] = (counts[ch] || 0) + 1;
      total++;
    }
  }

  const freq = {};
  if (total === 0) return freq;

  for (const ch in counts) {
    freq[ch] = counts[ch] / total;
  }
  return freq;
}

// Convert frequencies to rarity weights (rarer => higher). [web:45]
function buildLetterWeights(freq) {
  const weights = {};
  let maxInv = 0;

  for (const ch in freq) {
    const f = freq[ch];
    if (f <= 0) continue;
    const inv = 1 / f;
    weights[ch] = inv;
    if (inv > maxInv) maxInv = inv;
  }

  if (maxInv === 0) return weights;

  // Normalize to 0–1
  for (const ch in weights) {
    weights[ch] = weights[ch] / maxInv;
  }

  return weights;
}

// Raw rarity score (0–1-ish) for a word using currentLetterWeight.
function rarityScoreRaw(word) {
  if (!currentLetterWeight) return 0;

  let score = 0;
  const lower = word.toLowerCase();
  let counted = 0;

  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    if (ch < "a" || ch > "z") continue;
    const w = currentLetterWeight[ch];
    if (w != null) {
      score += w;
    } else {
      score += 0.5;
    }
    counted++;
  }

  if (counted === 0) return 0;
  return score / counted;
}

// Build 0–10 rarity scores from raw values within THIS result set. [web:102][web:105][web:108]
function buildRarityScores(wordsList) {
  const rawScores = wordsList.map(w => rarityScoreRaw(w));
  const min = Math.min(...rawScores);
  const max = Math.max(...rawScores);

  const scoresMap = new Map();

  if (max === min) {
    wordsList.forEach(w => scoresMap.set(w, 5));
    return scoresMap;
  }

  for (let i = 0; i < wordsList.length; i++) {
    const raw = rawScores[i];
    const normalized = (raw - min) / (max - min); // 0–1
    const scaled = normalized * 10; // 0–10
    const rounded = Math.round(scaled * 10) / 10;
    scoresMap.set(wordsList[i], rounded);
  }

  return scoresMap;
}

// Helper: filter dwyl entries to lowercase-only, no punctuation. [web:46][web:69][web:72]
function filterDwylWords(list) {
  const regex = /^[a-z]+$/;
  return list.filter(w => regex.test(w));
}

// Fetch words for the current source and merge EXTRA_WORDS. [web:2][web:46][web:67]
async function loadWordsForCurrentSource() {
  const source = SOURCES[currentSourceKey];

  try {
    loaded = false;
    loadFailed = false;
    words = [];
    baseMatches = [];
    currentMatches = [];
    currentLetterFreq = null;
    currentLetterWeight = null;
    currentRarityScores = null;
    renderResults();

    statusText.textContent = `Loading word list from ${source.label}…`;

    const res = await fetch(source.url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const text = await res.text();
    let fetched = text
      .split(/\r?\n/)
      .map(w => w.trim())
      .filter(Boolean);

    if (source.id === "dwyl") {
      fetched = filterDwylWords(fetched);
    }

    words = fetched.concat(EXTRA_WORDS);
    loaded = true;

    statusText.textContent = `Loaded ${words.length.toLocaleString()} words from ${source.label}. Type a syllable and press Enter.`;
    statusText.classList.add("ready");

    if (sourceStatusEl) {
      sourceStatusEl.textContent = `Using source: ${source.label}`;
    }
  } catch (err) {
    console.error("Failed to load word list:", err);
    loadFailed = true;
    statusText.textContent =
      "Failed to load word list. Refresh the page to try again.";
    statusText.classList.add("error");
    if (sourceStatusEl) {
      sourceStatusEl.textContent = "";
    }
  }
}

function renderResults() {
  resultsList.innerHTML = "";

  if (!currentQuery) {
    resultsCount.textContent = "0 results";
    return;
  }

  resultsCount.textContent = `${currentMatches.length} result${
    currentMatches.length === 1 ? "" : "s"
  }`;

  const fragment = document.createDocumentFragment();
  currentMatches.forEach(word => {
    const li = document.createElement("li");
    li.className = "result-item";

    const rarity = currentRarityScores?.get(word);
    const rarityDisplay =
      typeof rarity === "number" ? rarity.toFixed(1).replace(/\.0$/, "") : "–";

    const lengthVal = word.length;

    li.innerHTML = `
      <div class="result-word">${word}</div>
      <div class="result-meta">len ${lengthVal} · rare ${rarityDisplay}/10</div>
    `;

    fragment.appendChild(li);
  });

  resultsList.appendChild(fragment);
}

// --- Sampling strategies per sort mode ---

// Alphabetic: distribute up to MAX_RESULTS across first letters roughly evenly.
function buildAlphaSample(wordsList) {
  const buckets = new Map();

  for (const w of wordsList) {
    const ch = w[0]?.toLowerCase();
    const key = ch && ch >= "a" && ch <= "z" ? ch : "#";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(w);
  }

  // Sort each bucket alphabetically
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.localeCompare(b));
  }

  const letters = Array.from(buckets.keys()).sort((a, b) => {
    if (a === "#") return 1;
    if (b === "#") return -1;
    return a.localeCompare(b);
  });

  const total = wordsList.length;
  const limit = Math.min(MAX_RESULTS, total);
  const perBucketBase = Math.floor(limit / letters.length) || 1;
  let remaining = limit;

  const result = [];

  // First pass: equal-ish distribution
  for (const key of letters) {
    if (remaining <= 0) break;
    const bucket = buckets.get(key);
    const take = Math.min(perBucketBase, bucket.length, remaining);
    for (let i = 0; i < take; i++) {
      result.push(bucket[i]);
    }
    remaining -= take;
  }

  if (remaining <= 0) {
    return result;
  }

  // Second pass: fill remaining slots by cycling buckets
  let idx = 0;
  while (remaining > 0) {
    const key = letters[idx % letters.length];
    const bucket = buckets.get(key);
    const alreadyTaken = result.filter(w => (w[0]?.toLowerCase() || "#") === key)
      .length;

    if (alreadyTaken < bucket.length) {
      result.push(bucket[alreadyTaken]);
      remaining--;
    }

    idx++;
    if (idx > letters.length * 10 && remaining > 0) break;
  }

  return result;
}

// Length: just sort by length desc and take first MAX_RESULTS. [web:103][web:106]
function buildLengthSample(wordsList) {
  const sorted = wordsList.slice().sort((a, b) => {
    const lenDiff = b.length - a.length;
    if (lenDiff !== 0) return lenDiff;
    return a.localeCompare(b);
  });

  return sorted.slice(0, MAX_RESULTS);
}

// Rarity: sort by rarity desc, no distribution cap per score.
function buildRaritySample(wordsList) {
  const sorted = wordsList.slice().sort((a, b) => {
    const scoreA = currentRarityScores?.get(a) ?? 0;
    const scoreB = currentRarityScores?.get(b) ?? 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    const lenDiff = b.length - a.length;
    if (lenDiff !== 0) return lenDiff;
    return a.localeCompare(b);
  });

  return sorted.slice(0, MAX_RESULTS);
}

function applySort() {
  let sample = [];

  if (currentSortMode === "alpha") {
    // Sample with bucketed distribution by first letter, then sort the sample A–Z
    const rawSample = buildAlphaSample(baseMatches);
    sample = rawSample.sort((a, b) => a.localeCompare(b));
  } else if (currentSortMode === "length") {
    sample = buildLengthSample(baseMatches);
  } else if (currentSortMode === "rarity") {
    sample = buildRaritySample(baseMatches);
  }

  currentMatches = sample;
  renderResults();
}

function search() {
  const query = searchInput.value.trim().toLowerCase();
  currentQuery = query;

  if (!loaded) {
    if (loadFailed) {
      statusText.textContent =
        "Word list not available yet. Check your connection and refresh.";
      statusText.classList.add("error");
    }
    return;
  }

  if (!query) {
    statusText.textContent = "Enter a syllable to search.";
    statusText.classList.remove("error");
    baseMatches = [];
    currentMatches = [];
    currentLetterFreq = null;
    currentLetterWeight = null;
    currentRarityScores = null;
    renderResults();
    return;
  }

  // Collect ALL matches for this query (no MAX_RESULTS cap here)
  const matches = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.toLowerCase().includes(query)) {
      matches.push(w);
    }
  }

  baseMatches = matches;

  if (matches.length === 0) {
    statusText.textContent = `No words found containing "${query}".`;
    currentLetterFreq = null;
    currentLetterWeight = null;
    currentRarityScores = null;
    currentMatches = [];
  } else {
    const used = Math.min(matches.length, MAX_RESULTS);
    statusText.textContent = `Found ${matches.length} words containing "${query}". Showing up to ${used} based on sort mode.`;

    // Build rarity stats from the full match set, then we sample. [web:102][web:105]
    currentLetterFreq = buildLetterFrequency(baseMatches);
    currentLetterWeight = buildLetterWeights(currentLetterFreq);
    currentRarityScores = buildRarityScores(baseMatches);
  }

  statusText.classList.remove("error");
  applySort();
}

function handleSortButtonClick(e) {
  const btn = e.currentTarget;
  const mode = btn.getAttribute("data-sort");
  if (!mode || mode === currentSortMode) return;

  currentSortMode = mode;

  sortButtons.forEach(b => b.classList.remove("sort-button-active"));
  btn.classList.add("sort-button-active");

  if (baseMatches.length > 0) {
    applySort();
  }
}

async function switchSource(newKey) {
  if (!SOURCES[newKey] || newKey === currentSourceKey) return;
  currentSourceKey = newKey;

  sourceButtons.forEach(b => {
    const key = b.getAttribute("data-source");
    if (key === newKey) {
      b.classList.add("source-button-active");
    } else {
      b.classList.remove("source-button-active");
    }
  });

  await loadWordsForCurrentSource();
  if (currentQuery) {
    search();
  }
}

// Event wiring
searchButton.addEventListener("click", search);

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    search();
  }
});

sortButtons.forEach(btn => {
  btn.addEventListener("click", handleSortButtonClick);
});

sourceButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-source");
    switchSource(key);
  });
});

// Initial load
loadWordsForCurrentSource();
