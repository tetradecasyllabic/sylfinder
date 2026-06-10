// URL of the word list (one word per line)
const WORDLIST_URL =
  "https://raw.githubusercontent.com/MagicOctopusUrn/wordListsByLength/refs/heads/master/unsorted.txt";

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const statusText = document.getElementById("statusText");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");
const sortButtons = document.querySelectorAll(".sort-button");

let words = [];
let loaded = false;
let loadFailed = false;

const MAX_RESULTS = 50;
let currentMatches = [];
let currentQuery = "";
let currentSortMode = "alpha"; // "alpha" | "length" | "rarity"

// These are recomputed each search for the current result set
let currentLetterFreq = null;   // { letter: fraction }
let currentLetterWeight = null; // { letter: rarity weight }

// Build letter frequency map for a list of words, normalized to 0–1 by count.
// We only care about a–z, and we ignore everything else. [web:31][web:32][web:35]
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
  if (total === 0) {
    return freq;
  }

  for (const ch in counts) {
    freq[ch] = counts[ch] / total;
  }
  return freq;
}

// Turn frequencies into rarity weights for the current group.
// rarer letter => higher weight. We invert frequency so low-frequency letters
// in THIS result set get bigger weights. [web:30]
function buildLetterWeights(freq) {
  const weights = {};
  let maxInv = 0;

  // First compute inverse frequencies and track max
  for (const ch in freq) {
    const f = freq[ch];
    if (f <= 0) continue;
    const inv = 1 / f;
    weights[ch] = inv;
    if (inv > maxInv) maxInv = inv;
  }

  if (maxInv === 0) {
    return weights;
  }

  // Normalize to roughly 0–1 so scores don't explode for tiny groups
  for (const ch in weights) {
    weights[ch] = weights[ch] / maxInv;
  }

  return weights;
}

// Rarity score for a word based on group-local weights.
// If a letter has no weight (didn't appear at all in this group), we treat it
// as average (0.5) so it doesn't break when filters get very small.
function rarityScore(word) {
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

  // Normalize by word length so scores are more comparable
  if (counted === 0) return 0;
  return score / counted;
}

// Fetch the word list on load
async function loadWords() {
  try {
    statusText.textContent = "Loading word list…";
    const res = await fetch(WORDLIST_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const text = await res.text();
    words = text
      .split(/\r?\n/)
      .map(w => w.trim())
      .filter(Boolean);

    loaded = true;
    statusText.textContent = `Loaded ${words.length.toLocaleString()} words. Type a syllable and press Enter.`;
    statusText.classList.add("ready");
  } catch (err) {
    console.error("Failed to load word list:", err);
    loadFailed = true;
    statusText.textContent =
      "Failed to load word list. Refresh the page to try again.";
    statusText.classList.add("error");
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
    li.textContent = word;
    fragment.appendChild(li);
  });

  resultsList.appendChild(fragment);
}

function applySort() {
  const matchesCopy = currentMatches.slice();

  if (currentSortMode === "alpha") {
    matchesCopy.sort((a, b) => a.localeCompare(b));
  } else if (currentSortMode === "length") {
    matchesCopy.sort((a, b) => a.length - b.length || a.localeCompare(b));
  } else if (currentSortMode === "rarity") {
    matchesCopy.sort((a, b) => {
      const scoreA = rarityScore(a);
      const scoreB = rarityScore(b);
      if (scoreB !== scoreA) return scoreB - scoreA; // rarer first
      return a.length - b.length || a.localeCompare(b);
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
  } else {
    statusText.textContent = `Showing first ${matches.length} word${
      matches.length === 1 ? "" : "s"
    } containing "${query}".`;

    // Build per-group frequencies and weights from this match set
    currentLetterFreq = buildLetterFrequency(currentMatches);
    currentLetterWeight = buildLetterWeights(currentLetterFreq);
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

// Wire up events
searchButton.addEventListener("click", search);

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    search();
  }
});

sortButtons.forEach(btn => {
  btn.addEventListener("click", handleSortButtonClick);
});

// Kick off loading
loadWords();
