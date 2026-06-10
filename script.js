// URL of the word list (one word per line)
const WORDLIST_URL =
  "https://raw.githubusercontent.com/MagicOctopusUrn/wordListsByLength/refs/heads/master/unsorted.txt";

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const statusText = document.getElementById("statusText");
const resultsList = document.getElementById("resultsList");
const resultsCount = document.getElementById("resultsCount");

let words = [];
let loaded = false;
let loadFailed = false;

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

function renderResults(matches, query) {
  resultsList.innerHTML = "";

  if (!query) {
    resultsCount.textContent = "0 results";
    return;
  }

  resultsCount.textContent = `${matches.length} result${
    matches.length === 1 ? "" : "s"
  }`;

  const fragment = document.createDocumentFragment();
  matches.forEach(word => {
    const li = document.createElement("li");
    li.className = "result-item";
    li.textContent = word;
    fragment.appendChild(li);
  });

  resultsList.appendChild(fragment);
}

function search() {
  const query = searchInput.value.trim().toLowerCase();

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
    renderResults([], "");
    return;
  }

  const MAX_RESULTS = 50;
  const matches = [];

  // Simple linear search; this list is big but still fine for a one-off search
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w.toLowerCase().includes(query)) {
      matches.push(w);
      if (matches.length >= MAX_RESULTS) break;
    }
  }

  if (matches.length === 0) {
    statusText.textContent = `No words found containing "${query}".`;
  } else {
    statusText.textContent = `Showing first ${matches.length} word${
      matches.length === 1 ? "" : "s"
    } containing "${query}".`;
  }

  statusText.classList.remove("error");
  renderResults(matches, query);
}

// Wire up events
searchButton.addEventListener("click", search);

searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    search();
  }
});

// Kick off loading
loadWords();
