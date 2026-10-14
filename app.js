/**
 * ============================================================================
 * APPLICATION DATA & STATE MANAGEMENT
 * ============================================================================
 */
// Automatically purge old localStorage versions that contained the 5 pre-loaded games
try {
  localStorage.removeItem('gv_games_v1');
  localStorage.removeItem('gv_games_v2');
  localStorage.removeItem('gv_games_v3');
} catch (e) {}

const STORAGE_KEYS = {
  GAMES: 'gv_games_empty_v4',
  USERS: 'gv_users_v4',
  SESSION: 'gv_session_v4',
  REVIEWS: 'gv_reviews_v4'
};

// Fixed list of 15 Video Game Genres for adding/editing and filtering games
const GAME_GENRES = [
  "Action",
  "Action-Adventure",
  "Action RPG",
  "Role-Playing (RPG)",
  "First-Person Shooter (FPS)",
  "Third-Person Shooter",
  "Tactical Shooter",
  "Strategy",
  "Simulation",
  "Sports & Racing",
  "Fighting",
  "Survival Horror",
  "Metroidvania",
  "Platformer",
  "Sandbox & Open World"
];

// Default installation instructions pre-filled when the admin adds a new game
const DEFAULT_INSTRUCTIONS = 
  "1. Download the game archive from the Google Drive link.\n" +
  "2. Once downloaded, extract the archive to your preferred installation folder.\n" +
  "3. Check your system security/antivirus settings if files are blocked, verify the folder contents, and run the executable to launch.";

// Empty initial array so the developer/admin can manually add games from scratch
const INITIAL_GAMES = [];

// Initial accounts: includes the Developer/Admin account.
// You can also hardcode customer accounts here if desired.
const INITIAL_USERS = [
  { username: "admin", password: "admin123", role: "admin" }
];

// Safe localStorage wrapper with error handling
const Storage = {
  get(key, fallback) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : fallback;
    } catch (err) {
      console.error(`Error reading ${key} from localStorage:`, err);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      console.error(`Error saving ${key} to localStorage:`, err);
      showNotification("Storage error: Changes may not persist in private browsing.", true);
    }
  }
};

// Application state initialization
let games = Storage.get(STORAGE_KEYS.GAMES, null);
if (!Array.isArray(games)) {
  games = INITIAL_GAMES;
  Storage.set(STORAGE_KEYS.GAMES, games);
}

let users = Storage.get(STORAGE_KEYS.USERS, null);
if (!Array.isArray(users)) {
  users = INITIAL_USERS;
  Storage.set(STORAGE_KEYS.USERS, users);
}

let currentUser = Storage.get(STORAGE_KEYS.SESSION, null);
let reviews = Storage.get(STORAGE_KEYS.REVIEWS, {});
let activeGameId = null;

/**
 * ============================================================================
 * UTILITY FUNCTIONS (XSS SANITIZATION & DEBOUNCE)
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

/**
 * ============================================================================
 * VIEW NAVIGATION
 * ============================================================================
 */
const views = ['view-catalog', 'view-detail', 'view-auth', 'view-admin', 'view-users'];

function switchView(targetId) {
  views.forEach(id => {
    document.getElementById(id).classList.toggle('hidden', id !== targetId);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * ============================================================================
 * GENRE DROPDOWNS, CATALOG RENDERING, FILTERING & SORTING
 * ============================================================================
 */
// Populates both the Catalog Filter dropdown and the Admin Form Genre dropdown with the 15 fixed genres
function populateGenreDropdowns() {
  const filterSelect = document.getElementById('filter-genre');
  const formSelect = document.getElementById('game-genre');
  const currentFilterVal = filterSelect.value;

  // 1. Populate Catalog Filter Dropdown
  filterSelect.innerHTML = '<option value="ALL">All Genres</option>';
  GAME_GENRES.forEach(genre => {
    const opt = document.createElement('option');
    opt.value = genre;
    opt.textContent = genre;
    filterSelect.appendChild(opt);
  });

  if (GAME_GENRES.includes(currentFilterVal)) {
    filterSelect.value = currentFilterVal;
  }

  // 2. Populate Admin Add/Edit Game Form Dropdown
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

  // Edge Case 1: No games have been added by the admin yet
  if (games.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3 style="color: var(--text-primary); margin-bottom: 0.5rem;">No Games in Catalog Yet</h3>
        <p style="margin-bottom: 1.25rem;">
          ${isAdmin 
            ? "You are logged in as Admin. Click below to add your first game to the store!" 
            : "The developer hasn't uploaded any games yet. Please check back soon or log in."}
        </p>
        ${isAdmin 
          ? `<button onclick="openAdminForm(null)">+ Add Your First Game</button>` 
          : `<button class="btn-secondary" onclick="switchView('view-auth')">Account Login</button>`}
      </div>
    `;
    return;
  }

  // 1. Filter games
  let filtered = games.filter(game => {
    const matchesSearch =
      game.title.toLowerCase().includes(searchQuery) ||
      game.developer.toLowerCase().includes(searchQuery);
    const matchesGenre = selectedGenre === 'ALL' || game.genre === selectedGenre;
    const matchesCompat = selectedCompat === 'ALL' || game.compatibility === selectedCompat;
    return matchesSearch && matchesGenre && matchesCompat;
  });

  // 2. Sort games
  filtered.sort((a, b) => {
    if (sortBy === 'title-asc') return a.title.localeCompare(b.title);
    if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
    if (sortBy === 'size-asc') return a.sizeGB - b.sizeGB;
    if (sortBy === 'size-desc') return b.sizeGB - a.sizeGB;
    return 0;
  });

  // Edge Case 2: Games exist, but none match the current search/filter
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No games match your current search or filter criteria.</p>
      </div>
    `;
    return;
  }

  // 3. Render efficiently using DocumentFragment
  const fragment = document.createDocumentFragment();

  filtered.forEach(game => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.onclick = () => openGameDetail(game.id);

    // Quick Edit/Delete buttons right on the card for Admin users
    const adminCardButtons = isAdmin ? `
      <div class="card-admin-actions">
        <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); openAdminForm('${game.id}')">Edit Game</button>
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
        <div style="margin-top: 1.25rem; color: var(--accent); font-weight: 600; font-size: 0.9rem;">
          View Details & Download &rarr;
        </div>
        ${adminCardButtons}
      </div>
    `;
    fragment.appendChild(card);
  });

  container.appendChild(fragment);
}

/**
 * ============================================================================
 * GAME DETAIL & REVIEWS VIEW
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

  let downloadHTML = '';
  if (currentUser) {
    downloadHTML = `
      <a href="${escapeHTML(game.driveLink)}" target="_blank" rel="noopener noreferrer" class="btn">
        Download from Google Drive (${Number(game.sizeGB).toFixed(1)} GB)
      </a>
    `;
  } else {
    downloadHTML = `
      <div class="alert">
        You must be logged in with a customer account to download this game.
        <button onclick="switchView('view-auth')" style="margin-left: 1rem;">Login Now</button>
      </div>
    `;
  }

  let adminControlsHTML = '';
  if (currentUser && currentUser.role === 'admin') {
    adminControlsHTML = `
      <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #334155; display: flex; gap: 0.5rem;">
        <button class="btn-secondary" onclick="openAdminForm('${game.id}')">Edit Game (Admin)</button>
        <button class="btn-danger" onclick="deleteGame('${game.id}')">Delete Game</button>
      </div>
    `;
  }

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
            <option value="5">5 - Excellent</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Average</option>
            <option value="2">2 - Fair</option>
            <option value="1">1 - Poor</option>
          </select>
        </div>
        <textarea id="review-text" rows="3" placeholder="Share your experience with this game..." required></textarea>
        <button type="submit" style="justify-self: start;">Post Review</button>
      </form>
    `;

    document.getElementById('review-form').onsubmit = (e) => {
      e.preventDefault();
      const rating = Number(document.getElementById('review-rating').value);
      const comment = document.getElementById('review-text').value.trim();

      if (!comment) return;

      if (!reviews[gameId]) reviews[gameId] = [];
      reviews[gameId].unshift({
        username: currentUser.username,
        rating,
        comment,
        date: new Date().toLocaleDateString()
      });

      Storage.set(STORAGE_KEYS.REVIEWS, reviews);
      renderReviews(gameId);
      showNotification("Review submitted!");
    };
  } else {
    formContainer.innerHTML = `<p style="color: var(--text-muted);">Please log in with your customer account to leave a review.</p>`;
  }

  const gameReviews = reviews[gameId] || [];
  if (gameReviews.length === 0) {
    listContainer.innerHTML = `<p style="color: var(--text-muted);">No reviews yet. Be the first to review!</p>`;
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
 * AUTHENTICATION (LOGIN ONLY) & ADMIN ACCOUNT MANAGEMENT
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
    statusEl.textContent = `Logged in: ${currentUser.username} (${isAdmin ? 'Developer' : 'Customer'})`;
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

// Login Form Handler (Customers and Admin log in here; self-registration is disabled)
document.getElementById('auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;

  const found = users.find(
    u => u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );

  if (!found) {
    showNotification("Invalid username or password. Please contact the developer if you need an account.", true);
    return;
  }

  currentUser = { username: found.username, role: found.role };
  Storage.set(STORAGE_KEYS.SESSION, currentUser);
  showNotification(`Welcome, ${currentUser.username}!`);

  document.getElementById('auth-form').reset();
  updateAuthUI();
  renderCatalog();

  if (activeGameId) {
    openGameDetail(activeGameId);
  } else {
    switchView('view-catalog');
  }
});

// Opens the Admin Customer Account Management View
function openUsersPanel() {
  if (!currentUser || currentUser.role !== 'admin') return;
  renderUsersList();
  switchView('view-users');
}

// Renders all accounts so the Developer/Admin can view credentials or revoke access
function renderUsersList() {
  if (!currentUser || currentUser.role !== 'admin') return;
  const listContainer = document.getElementById('users-list-container');

  listContainer.innerHTML = users.map(u => {
    const isSelfAdmin = u.role === 'admin';
    return `
      <div class="user-row">
        <div>
          <strong>${escapeHTML(u.username)}</strong>
          <span class="badge">${isSelfAdmin ? 'Developer / Admin' : 'Customer'}</span>
          <div style="color: var(--text-muted); font-size: 0.85rem; margin-top: 0.25rem;">
            Password: <code>${escapeHTML(u.password)}</code>
          </div>
        </div>
        <div>
          ${isSelfAdmin 
            ? `<span style="color: var(--text-muted); font-size: 0.85rem;">Protected Account</span>` 
            : `<button class="btn-danger btn-sm" onclick="deleteCustomerAccount('${escapeHTML(u.username)}')">Delete Account</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

// Admin Form Handler: Create a new Customer Account
document.getElementById('admin-user-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentUser || currentUser.role !== 'admin') return;

  const username = document.getElementById('new-customer-username').value.trim();
  const password = document.getElementById('new-customer-password').value.trim();

  if (!username || !password) return;

  const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) {
    showNotification(`Username "${username}" already exists. Choose another username.`, true);
    return;
  }

  users.push({ username, password, role: 'user' });
  Storage.set(STORAGE_KEYS.USERS, users);

  document.getElementById('admin-user-form').reset();
  renderUsersList();
  showNotification(`Customer account "${username}" created! You can now give them their login details.`);
});

// Admin Action: Delete/Revoke a Customer Account
function deleteCustomerAccount(username) {
  if (!currentUser || currentUser.role !== 'admin') return;
  if (username.toLowerCase() === 'admin') {
    showNotification("Cannot delete the primary admin account.", true);
    return;
  }

  users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  Storage.set(STORAGE_KEYS.USERS, users);
  renderUsersList();
  showNotification(`Customer account "${username}" has been deleted.`);
}

/**
 * ============================================================================
 * ADMIN GAME ADD / EDIT / DELETE MANAGEMENT
 * ============================================================================
 */
function openAdminForm(gameId = null) {
  if (!currentUser || currentUser.role !== 'admin') return;

  const form = document.getElementById('admin-game-form');
  form.reset();
  populateGenreDropdowns();

  if (gameId) {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      showNotification("Could not find game to edit.", true);
      return;
    }
    document.getElementById('admin-form-title').textContent = `Edit Saved Game: ${game.title}`;
    document.getElementById('edit-game-id').value = game.id;
    document.getElementById('game-title').value = game.title;
    document.getElementById('game-size').value = game.sizeGB;
    document.getElementById('game-compat').value = game.compatibility;
    document.getElementById('game-dev').value = game.developer;

    const genreSelect = document.getElementById('game-genre');
    if (!GAME_GENRES.includes(game.genre)) {
      const customOpt = document.createElement('option');
      customOpt.value = game.genre;
      customOpt.textContent = `${game.genre} (Custom)`;
      genreSelect.appendChild(customOpt);
    }
    genreSelect.value = game.genre;

    document.getElementById('game-link').value = game.driveLink;
    document.getElementById('game-instructions').value = game.instructions;
  } else {
    document.getElementById('admin-form-title').textContent = "Add New Game";
    document.getElementById('edit-game-id').value = "";
    document.getElementById('game-genre').value = GAME_GENRES[0];
    document.getElementById('game-instructions').value = DEFAULT_INSTRUCTIONS;
  }

  switchView('view-admin');
}

document.getElementById('admin-game-form').addEventListener('submit', (e) => {
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
    showNotification(`"${gameData.title}" updated successfully!`);
  } else {
    games.push(gameData);
    showNotification(`"${gameData.title}" added to catalog!`);
  }

  Storage.set(STORAGE_KEYS.GAMES, games);
  renderCatalog();
  openGameDetail(gameData.id);
});

function deleteGame(gameId) {
  if (!currentUser || currentUser.role !== 'admin') return;
  const target = games.find(g => g.id === gameId);
  if (!target) return;

  games = games.filter(g => g.id !== gameId);
  Storage.set(STORAGE_KEYS.GAMES, games);
  if (activeGameId === gameId) activeGameId = null;

  renderCatalog();
  switchView('view-catalog');
  showNotification(`"${target.title}" removed from catalog.`);
}

/**
 * ============================================================================
 * EVENT LISTENERS & INITIALIZATION
 * ============================================================================
 */
document.getElementById('nav-home').onclick = () => {
  activeGameId = null;
  switchView('view-catalog');
};
document.getElementById('btn-back').onclick = () => {
  activeGameId = null;
  switchView('view-catalog');
};
document.getElementById('btn-users-back').onclick = () => {
  activeGameId = null;
  switchView('view-catalog');
};
document.getElementById('btn-auth-toggle').onclick = () => switchView('view-auth');
document.getElementById('btn-auth-cancel').onclick = () => switchView('view-catalog');
document.getElementById('btn-admin-panel').onclick = () => openAdminForm(null);
document.getElementById('btn-admin-users').onclick = () => openUsersPanel();
document.getElementById('btn-admin-cancel').onclick = () => {
  if (activeGameId) {
    openGameDetail(activeGameId);
  } else {
    switchView('view-catalog');
  }
};

document.getElementById('btn-logout').onclick = () => {
  currentUser = null;
  Storage.set(STORAGE_KEYS.SESSION, null);
  updateAuthUI();
  renderCatalog();
  if (activeGameId) openGameDetail(activeGameId);
  else switchView('view-catalog');
  showNotification("You have been logged out.");
};

document.getElementById('search-input').addEventListener('input', debounce(renderCatalog, 200));
document.getElementById('filter-genre').addEventListener('change', renderCatalog);
document.getElementById('filter-compat').addEventListener('change', renderCatalog);
document.getElementById('sort-by').addEventListener('change', renderCatalog);

// Initialize Application
updateAuthUI();
populateGenreDropdowns();
renderCatalog();