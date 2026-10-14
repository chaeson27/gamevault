/**
 * ============================================================================
 * FIREBASE CLOUD SDK & CONFIGURATION
 * ============================================================================
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// Your web app's Firebase configuration (using your keys)
const firebaseConfig = {
  apiKey: "AIzaSyC0AS14ZGb0c4vCDe2vl8asjfzG_unrnJA",
  authDomain: "gamevault-34c17.firebaseapp.com",
  databaseURL: "https://gamevault-34c17-default-rtdb.firebaseio.com/", // <--- Add your Realtime Database URL here if not automatically inferred, or let it connect to default
  projectId: "gamevault-34c17",
  storageBucket: "gamevault-34c17.firebasestorage.app",
  messagingSenderId: "695225864401",
  appId: "1:695225864401:web:ecc6725a27675f0a1db5f0",
  measurementId: "G-RD80JPR9BM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const SESSION_KEY = 'gv_session_v7';

const GAME_GENRES = [
  "Action", "Action-Adventure", "Action RPG", "Role-Playing (RPG)", 
  "First-Person Shooter (FPS)", "Third-Person Shooter", "Tactical Shooter", 
  "Strategy", "Simulation", "Sports & Racing", "Fighting", 
  "Survival Horror", "Metroidvania", "Platformer", "Sandbox & Open World"
];

const DEFAULT_INSTRUCTIONS = 
  "1. Download the game archive from the Google Drive link.\n" +
  "2. Once downloaded, extract the archive to your preferred installation folder.\n" +
  "3. Check your system security/antivirus settings if files are blocked, verify the folder contents, and run the executable to launch.";

// Application state synced from Firebase
let games = [];
let users = [{ username: "admin", password: "admin123", role: "admin" }];
let reviews = {};
let currentUser = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
let activeGameId = null;

/**
 * ============================================================================
 * CLOUD DATA SYNCHRONIZATION WITH FIREBASE
 * ============================================================================
 */
async function loadDataFromCloud() {
  try {
    const dbRef = ref(db);
    const snapshot = await get(dbRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // Load games
      if (data.games) {
        games = Array.isArray(data.games) ? data.games : Object.values(data.games);
      } else {
        games = [];
      }

      // Load users (ensures admin always exists)
      if (data.users) {
        const cloudUsers = Array.isArray(data.users) ? data.users : Object.values(data.users);
        if (!cloudUsers.some(u => u.username.toLowerCase() === 'admin')) {
          cloudUsers.push({ username: "admin", password: "admin123", role: "admin" });
        }
        users = cloudUsers;
      } else {
        users = [{ username: "admin", password: "admin123", role: "admin" }];
        await set(ref(db, 'users'), users);
      }

      // Load reviews
      reviews = data.reviews || {};
    } else {
      // First-time initialization on Firebase
      await set(ref(db, 'games'), []);
      await set(ref(db, 'users'), users);
      await set(ref(db, 'reviews'), {});
    }

    document.getElementById('user-status').textContent = currentUser ? `Logged in: ${currentUser.username}` : 'Guest Mode';
    populateGenreDropdowns();
    renderCatalog();
    if (activeGameId) openGameDetail(activeGameId);
  } catch (err) {
    console.error("Cloud sync error:", err);
    showNotification("Failed to connect to cloud database. Check your Realtime Database rules.", true);
  }
}

async function saveGamesToCloud() {
  await set(ref(db, 'games'), games);
}

async function saveUsersToCloud() {
  await set(ref(db, 'users'), users);
}

async function saveReviewsToCloud() {
  await set(ref(db, 'reviews'), reviews);
}

/**
 * ============================================================================
 * UTILITIES
 * ============================================================================
 */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function showNotification(message, isError = false) {
  const banner = document.getElementById('notification-banner');
  banner.textContent = message;
  banner.className = isError ? 'alert alert-error' : 'alert';
  banner.classList.remove('hidden');
  setTimeout(() => banner.classList.add('hidden'), 4000);
}

const views = ['view-catalog', 'view-detail', 'view-auth', 'view-admin', 'view-users'];
function switchView(targetId) {
  views.forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== targetId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * ============================================================================
 * CATALOG & RENDERING
 * ============================================================================
 */
function populateGenreDropdowns() {
  const filterSelect = document.getElementById('filter-genre');
  const formSelect = document.getElementById('game-genre');
  const currentFilterVal = filterSelect.value;

  filterSelect.innerHTML = '<option value="ALL">All Genres</option>';
  GAME_GENRES.forEach(genre => {
    const opt = document.createElement('option');
    opt.value = genre;
    opt.textContent = genre;
    filterSelect.appendChild(opt);
  });
  if (GAME_GENRES.includes(currentFilterVal)) filterSelect.value = currentFilterVal;

  formSelect.innerHTML = '';
  GAME_GENRES.forEach(genre => {
    const opt = document.createElement('option');
    opt.value = genre;
    opt.textContent = genre;
    formSelect.appendChild(opt);
  });
}

function renderCatalog() {
  const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  const selectedGenre = document.getElementById('filter-genre').value;
  const selectedCompat = document.getElementById('filter-compat').value;
  const sortBy = document.getElementById('sort-by').value;

  const container = document.getElementById('games-container');
  container.innerHTML = '';
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (!games || games.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Games in Catalog Yet</h3>
        <p style="margin-bottom: 1.25rem;">
          ${isAdmin ? "Click below to add your first game to the cloud store!" : "The developer hasn't uploaded any games yet."}
        </p>
        ${isAdmin ? `<button onclick="openAdminForm(null)">+ Add Your First Game</button>` : ``}
      </div>
    `;
    return;
  }

  let filtered = games.filter(game => {
    const matchesSearch = game.title.toLowerCase().includes(searchQuery) || game.developer.toLowerCase().includes(searchQuery);
    const matchesGenre = selectedGenre === 'ALL' || game.genre === selectedGenre;
    const matchesCompat = selectedCompat === 'ALL' || game.compatibility === selectedCompat;
    return matchesSearch && matchesGenre && matchesCompat;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
    if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
    if (sortBy === 'size-asc') return a.sizeGB - b.sizeGB;
    if (sortBy === 'size-desc') return b.sizeGB - a.sizeGB;
    return 0;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No games match your search criteria.</p></div>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  filtered.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameDetail(game.id);

    const adminCardButtons = isAdmin ? `
      <div class="card-admin-actions">
        <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); openAdminForm('${game.id}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="event.stopPropagation(); deleteGame('${game.id}')">Delete</button>
      </div>
    ` : '';

    card.innerHTML = `
      <div>
        <h3 style="margin-bottom: 0.5rem;">${escapeHTML(game.title)}</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">Developer: <strong>${escapeHTML(game.developer)}</strong></p>
        <div style="margin-top: 0.75rem;">
          <span class="badge">${escapeHTML(game.genre)}</span>
          <span class="badge">${Number(game.sizeGB).toFixed(1)} GB</span>
          <span class="badge">${escapeHTML(game.compatibility)}</span>
        </div>
      </div>
      <div>
        <div style="margin-top: 1.25rem; color: var(--accent); font-weight: 600; font-size: 0.9rem;">View Details & Download &rarr;</div>
        ${adminCardButtons}
      </div>
    `;
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

/**
 * ============================================================================
 * GAME DETAIL & REVIEWS
 * ============================================================================
 */
function openGameDetail(gameId) {
  const game = games.find(g => g.id === gameId);
  if (!game) {
    showNotification("Game not found.", true);
    return;
  }

  activeGameId = gameId;
  const detailContainer = document.getElementById('detail-content');

  let downloadHTML = currentUser 
    ? `<a href="${escapeHTML(game.driveLink)}" target="_blank" rel="noopener noreferrer" class="btn">Download from Google Drive (${Number(game.sizeGB).toFixed(1)} GB)</a>`
    : `<div class="alert">You must be logged in with a customer account to download. <button onclick="switchView('view-auth')" style="margin-left: 1rem;">Login Now</button></div>`;

  let adminControlsHTML = (currentUser && currentUser.role === 'admin') 
    ? `<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #334155; display: flex; gap: 0.5rem;"><button class="btn-secondary" onclick="openAdminForm('${game.id}')">Edit Game</button><button class="btn-danger" onclick="deleteGame('${game.id}')">Delete Game</button></div>`
    : '';

  detailContainer.innerHTML = `
    <h2>${escapeHTML(game.title)}</h2>
    <div style="margin: 0.5rem 0 1.5rem;">
      <span class="badge">Developer: ${escapeHTML(game.developer)}</span>
      <span class="badge">Genre: ${escapeHTML(game.genre)}</span>
      <span class="badge">Size: ${Number(game.sizeGB).toFixed(1)} GB</span>
      <span class="badge">OS: ${escapeHTML(game.compatibility)}</span>
    </div>
    <div class="instructions-box">
      <h4>Installation Instructions:</h4>
      <p style="white-space: pre-line; margin-top: 0.5rem; color: var(--text-muted);">${escapeHTML(game.instructions)}</p>
    </div>
    ${downloadHTML}
    ${adminControlsHTML}
  `;

  renderReviews(gameId);
  switchView('view-detail');
}

function renderReviews(gameId) {
  const formContainer = document.getElementById('review-form-container');
  const listContainer = document.getElementById('reviews-list');

  if (currentUser) {
    formContainer.innerHTML = `
      <form id="review-form" style="display: grid; gap: 0.75rem;">
        <div style="display: flex; gap: 1rem; align-items: center;">
          <label for="review-rating">Rating:</label>
          <select id="review-rating" style="width: auto;" required>
            <option value="5">5 - Excellent</option><option value="4">4 - Good</option>
            <option value="3">3 - Average</option><option value="2">2 - Fair</option><option value="1">1 - Poor</option>
          </select>
        </div>
        <textarea id="review-text" rows="3" placeholder="Share your experience..." required></textarea>
        <button type="submit" style="justify-self: start;">Post Review</button>
      </form>
    `;

    document.getElementById('review-form').onsubmit = async (e) => {
      e.preventDefault();
      const rating = Number(document.getElementById('review-rating').value);
      const comment = document.getElementById('review-text').value.trim();
      if (!comment) return;

      if (!reviews[gameId]) reviews[gameId] = [];
      reviews[gameId].unshift({ username: currentUser.username, rating, comment, date: new Date().toLocaleDateString() });

      await saveReviewsToCloud();
      renderReviews(gameId);
      showNotification("Review saved to cloud!");
    };
  } else {
    formContainer.innerHTML = `<p style="color: var(--text-muted);">Please log in to leave a review.</p>`;
  }

  const gameReviews = reviews[gameId] || [];
  if (gameReviews.length === 0) {
    listContainer.innerHTML = `<p style="color: var(--text-muted);">No reviews yet. Be the first!</p>`;
    return;
  }

  listContainer.innerHTML = gameReviews.map(r => `
    <div class="review-card">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.4rem;">
        <strong>${escapeHTML(r.username)}</strong>
        <span style="color: #facc15;">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
      </div>
      <p>${escapeHTML(r.comment)}</p>
      <small style="color: var(--text-muted);">${escapeHTML(r.date)}</small>
    </div>
  `).join('');
}

/**
 * ============================================================================
 * AUTHENTICATION & MANAGEMENT
 * ============================================================================
 */
function updateAuthUI() {
  const statusEl = document.getElementById('user-status');
  const btnAuth = document.getElementById('btn-auth-toggle');
  const btnLogout = document.getElementById('btn-logout');
  const btnAdminGame = document.getElementById('btn-admin-panel');
  const btnAdminUsers = document.getElementById('btn-admin-users');

  if (currentUser) {
    const isAdmin = currentUser.role === 'admin';
    statusEl.textContent = `Logged in: ${currentUser.username} (${isAdmin ? 'Admin' : 'Customer'})`;
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    btnAdminGame.classList.toggle('hidden', !isAdmin);
    btnAdminUsers.classList.toggle('hidden', !isAdmin);
  } else {
    statusEl.textContent = 'Guest Mode';
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    btnAdminGame.classList.add('hidden');
    btnAdminUsers.classList.add('hidden');
  }
}

document.getElementById('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;

  const found = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === password);
  if (!found) {
    showNotification("Invalid credentials.", true);
    return;
  }

  currentUser = { username: found.username, role: found.role };
  localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  showNotification(`Welcome, ${currentUser.username}!`);

  document.getElementById('auth-form').reset();
  updateAuthUI();
  renderCatalog();
  if (activeGameId) openGameDetail(activeGameId);
  else switchView('view-catalog');
});

function openUsersPanel() {
  if (!currentUser || currentUser.role !== 'admin') return;
  renderUsersList();
  switchView('view-users');
}

function renderUsersList() {
  const listContainer = document.getElementById('users-list-container');
  listContainer.innerHTML = users.map(u => `
    <div class="user-row">
      <div>
        <strong>${escapeHTML(u.username)}</strong> <span class="badge">${u.role === 'admin' ? 'Admin' : 'Customer'}</span>
        <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">Password: <code>${escapeHTML(u.password)}</code></div>
      </div>
      <div>
        ${u.role === 'admin' ? '' : `<button class="btn-danger btn-sm" onclick="deleteCustomerAccount('${escapeHTML(u.username)}')">Delete</button>`}
      </div>
    </div>
  `).join('');
}

document.getElementById('admin-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') return;

  const username = document.getElementById('new-customer-username').value.trim();
  const password = document.getElementById('new-customer-password').value.trim();

  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    showNotification("Username already exists.", true);
    return;
  }

  users.push({ username, password, role: 'user' });
  await saveUsersToCloud();
  document.getElementById('admin-user-form').reset();
  renderUsersList();
  showNotification(`Customer account "${username}" created in cloud!`);
});

window.deleteCustomerAccount = async function(username) {
  if (!currentUser || currentUser.role !== 'admin') return;
  users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  await saveUsersToCloud();
  renderUsersList();
  showNotification(`Account "${username}" deleted.`);
};

function openAdminForm(gameId = null) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const form = document.getElementById('admin-game-form');
  form.reset();
  populateGenreDropdowns();

  if (gameId) {
    const game = games.find(g => g.id === gameId);
    if (!game) return;
    document.getElementById('admin-form-title').textContent = `Edit Game: ${game.title}`;
    document.getElementById('edit-game-id').value = game.id;
    document.getElementById('game-title').value = game.title;
    document.getElementById('game-size').value = game.sizeGB;
    document.getElementById('game-compat').value = game.compatibility;
    document.getElementById('game-dev').value = game.developer;
    document.getElementById('game-genre').value = game.genre;
    document.getElementById('game-link').value = game.driveLink;
    document.getElementById('game-instructions').value = game.instructions;
  } else {
    document.getElementById('admin-form-title').textContent = "Add New Game";
    document.getElementById('edit-game-id').value = "";
    document.getElementById('game-instructions').value = DEFAULT_INSTRUCTIONS;
  }
  switchView('view-admin');
}

document.getElementById('admin-game-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') return;

  const id = document.getElementById('edit-game-id').value;
  const gameData = {
    id: id || 'g_' + Date.now(),
    title: document.getElementById('game-title').value.trim(),
    sizeGB: parseFloat(document.getElementById('game-size').value),
    compatibility: document.getElementById('game-compat').value,
    developer: document.getElementById('game-dev').value.trim(),
    genre: document.getElementById('game-genre').value,
    driveLink: document.getElementById('game-link').value.trim(),
    instructions: document.getElementById('game-instructions').value.trim()
  };

  if (id) {
    const idx = games.findIndex(g => g.id === id);
    if (idx !== -1) games[idx] = gameData;
    showNotification("Game updated in cloud!");
  } else {
    games.push(gameData);
    showNotification("Game added to cloud!");
  }

  await saveGamesToCloud();
  renderCatalog();
  openGameDetail(gameData.id);
});

window.deleteGame = async function(gameId) {
  if (!currentUser || currentUser.role !== 'admin') return;
  games = games.filter(g => g.id !== gameId);
  await saveGamesToCloud();
  if (activeGameId === gameId) activeGameId = null;
  renderCatalog();
  switchView('view-catalog');
  showNotification("Game deleted from cloud.");
};

/**
 * ============================================================================
 * EVENT LISTENERS & INITIALIZATION
 * ============================================================================
 */
document.getElementById('nav-home').onclick = () => { activeGameId = null; switchView('view-catalog'); };
document.getElementById('btn-back').onclick = () => { activeGameId = null; switchView('view-catalog'); };
document.getElementById('btn-users-back').onclick = () => { activeGameId = null; switchView('view-catalog'); };
document.getElementById('btn-auth-toggle').onclick = () => switchView('view-auth');
document.getElementById('btn-auth-cancel').onclick = () => switchView('view-catalog');
document.getElementById('btn-admin-panel').onclick = () => openAdminForm(null);
document.getElementById('btn-admin-users').onclick = () => openUsersPanel();
document.getElementById('btn-admin-cancel').onclick = () => {
  if (activeGameId) openGameDetail(activeGameId);
  else switchView('view-catalog');
};

document.getElementById('btn-logout').onclick = () => {
  currentUser = null;
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
  renderCatalog();
  if (activeGameId) openGameDetail(activeGameId);
  else switchView('view-catalog');
  showNotification("Logged out.");
};

document.getElementById('search-input').addEventListener('input', debounce(renderCatalog, 200));
document.getElementById('filter-genre').addEventListener('change', renderCatalog);
document.getElementById('filter-compat').addEventListener('change', renderCatalog);
document.getElementById('sort-by').addEventListener('change', renderCatalog);

// Boot up app and fetch cloud data
updateAuthUI();
loadDataFromCloud();