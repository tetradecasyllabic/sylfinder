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

const MAX_RESULTS = 50;
let currentMatches = [];
let currentQuery = "";
let currentSortMode = "alpha"; // "alpha" | "length" | "rarity"

// Extra words you can maintain directly here (not via the UI)
const EXTRA_WORDS = [
  // "robloxian",
  // "photon",
  // "overwatch",
];

// Per-result-set data
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

// Build 0–10 rarity scores from raw values. [web:39][web:45]
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
  // keep only words that are all lowercase letters a–z
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

    // If using dwyl, drop any words with periods, uppercase, or other symbols
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

    li.textContent = `${word}   ·   len ${lengthVal}   ·   rare ${rarityDisplay}/10`;

    fragment.appendChild(li);
  });

  resultsList.appendChild(fragment);
}

function applySort() {
  const matchesCopy = currentMatches.slice();

  if (currentSortMode === "alpha") {
    // A–Z ascending
    matchesCopy.sort((a, b) => a.localeCompare(b));
  } else if (currentSortMode === "length") {
    // Length descending (longest first)
    matchesCopy.sort((a, b) => b.length - a.length || a.localeCompare(b));
  } else if (currentSortMode === "rarity") {
    // Rarest first (highest rarity), then longer, then A–Z.
    matchesCopy.sort((a, b) => {
      const scoreA = currentRarityScores?.get(a) ?? 0;
      const scoreB = currentRarityScores?.get(b) ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.length !== a.length) return b.length - a.length;
      return a.localeCompare(b);
    });
  }

  currentMatches = matchesCopy;
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
    currentMatches = [];
    currentLetterFreq = null;
    currentLetterWeight = null;
    currentRarityScores = null;
    renderResults();
    return;
  }

  const matches = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.toLowerCase().includes(query)) {
      matches.push(w);
      if (matches.length >= MAX_RESULTS) break;
    }
  }

  currentMatches = matches;

  if (matches.length === 0) {
    statusText.textContent = `No words found containing "${query}".`;
    currentLetterFreq = null;
    currentLetterWeight = null;
    currentRarityScores = null;
  } else {
    statusText.textContent = `Showing first ${matches.length} word${
      matches.length === 1 ? "" : "s"
    } containing "${query}".`;

    currentLetterFreq = buildLetterFrequency(currentMatches);
    currentLetterWeight = buildLetterWeights(currentLetterFreq);
    currentRarityScores = buildRarityScores(currentMatches);
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

  if (currentMatches.length > 0) {
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
