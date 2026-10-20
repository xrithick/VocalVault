// ========================================================
// VocalVault – Pure HTML, CSS, JavaScript Application
// Directly connected to Supabase PostgreSQL Database
// ========================================================

let currentUser = null;
let supabaseClient = null;
let currentPracticeChart = null;

const STORAGE_KEYS = {
    SESSION: 'vocalvault_user_session',
    CONFIG: 'vocalvault_supabase_config'
};

// --------------------------------------------------------
// 1. Toast Notification Helper
// --------------------------------------------------------
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// --------------------------------------------------------
// 2. Supabase Connection Manager
// --------------------------------------------------------
const db = {
    getSavedConfig() {
        // First check localStorage for credentials entered in the UI
        let saved = {};
        try {
            saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
        } catch (e) {
            saved = {};
        }

        // If not in localStorage, check config.js
        const fileUrl = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.url) ? SUPABASE_CONFIG.url : '';
        const fileKey = (typeof SUPABASE_CONFIG !== 'undefined' && SUPABASE_CONFIG.key) ? SUPABASE_CONFIG.key : '';

        const url = (saved.url && saved.url.trim() && !saved.url.includes('your-project-id')) ? saved.url.trim() : fileUrl.trim();
        const key = (saved.key && saved.key.trim() && !saved.key.includes('your-key-here')) ? saved.key.trim() : fileKey.trim();

        return { url, key };
    },

    async init() {
        const { url, key } = this.getSavedConfig();

        if (url && key && url.startsWith('http') && !url.includes('your-project-id') && !key.includes('your-key-here')) {
            try {
                if (window.supabase && window.supabase.createClient) {
                    supabaseClient = window.supabase.createClient(url, key);
                    
                    // Verify connection by testing query on 'users' table
                    const { error } = await supabaseClient.from('users').select('id').limit(1);
                    if (error) {
                        console.error('Supabase query test error:', error);
                        this.updateStatus(false, `Supabase Error: ${error.message}. Did you run schema.sql in Supabase SQL editor?`);
                        return false;
                    }

                    this.updateStatus(true, 'Connected to Supabase PostgreSQL cloud database.');
                    return true;
                } else {
                    this.updateStatus(false, 'Supabase JS library is loading or blocked by your browser.');
                    return false;
                }
            } catch (err) {
                console.error('Supabase init exception:', err);
                this.updateStatus(false, `Connection failed: ${err.message}`);
                return false;
            }
        } else {
            supabaseClient = null;
            this.updateStatus(false, 'Supabase database is NOT connected. Click "Connect Supabase" to set up.');
            return false;
        }
    },

    isReady() {
        return supabaseClient !== null;
    },

    updateStatus(connected, message) {
        const pill = document.getElementById('db-status-pill');
        const text = document.getElementById('db-status-text');
        const alertBanner = document.getElementById('db-warning-banner');

        if (pill) {
            pill.className = `db-pill ${connected ? 'supabase' : 'disconnected'}`;
            pill.innerHTML = connected ? '⚡ Supabase Connected' : '⚠️ Supabase Disconnected';
        }
        if (text) {
            text.textContent = message;
        }
        if (alertBanner) {
            alertBanner.style.display = connected ? 'none' : 'flex';
        }
    },

    requireConnection() {
        if (!this.isReady()) {
            openDbModal();
            showToast('Please connect your Supabase database first before continuing.', 'warning');
            return false;
        }
        return true;
    },

    // ----------------------------------------------------
    // User Authentication Queries
    // ----------------------------------------------------
    async findUserByEmail(email) {
        if (!this.requireConnection()) return null;
        email = email.toLowerCase().trim();

        const { data, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1);

        if (error) {
            console.error('findUserByEmail error:', error);
            throw new Error(`Database error: ${error.message}`);
        }

        return data && data.length > 0 ? data[0] : null;
    },

    async registerUser(name, email, passwordHash) {
        if (!this.requireConnection()) throw new Error('Database not connected');
        email = email.toLowerCase().trim();

        const { data, error } = await supabaseClient
            .from('users')
            .insert([{
                name: name,
                email: email,
                password_hash: passwordHash
            }])
            .select();

        if (error) {
            console.error('registerUser error:', error);
            throw new Error(error.message);
        }

        if (!data || data.length === 0) {
            throw new Error('Registration failed: no record returned from Supabase.');
        }

        return data[0];
    },

    // ----------------------------------------------------
    // Song Queries
    // ----------------------------------------------------
    async getSongs(userId) {
        if (!this.isReady()) return [];

        const { data, error } = await supabaseClient
            .from('songs')
            .select('*')
            .eq('user_id', userId)
            .order('id', { ascending: false });

        if (error) {
            console.error('getSongs error:', error);
            showToast(`Error fetching songs: ${error.message}`, 'danger');
            return [];
        }

        return data || [];
    },

    async addSong(userId, song) {
        if (!this.requireConnection()) throw new Error('Database not connected');

        const { data, error } = await supabaseClient
            .from('songs')
            .insert([{
                user_id: userId,
                song_name: song.name,
                artist: song.artist,
                language: song.language,
                difficulty: song.difficulty
            }])
            .select();

        if (error) {
            console.error('addSong error:', error);
            throw new Error(error.message);
        }

        return data && data[0] ? data[0] : null;
    },

    async updateSong(userId, songId, updatedData) {
        if (!this.requireConnection()) throw new Error('Database not connected');

        const { error } = await supabaseClient
            .from('songs')
            .update({
                song_name: updatedData.name,
                artist: updatedData.artist,
                language: updatedData.language,
                difficulty: updatedData.difficulty
            })
            .eq('id', songId)
            .eq('user_id', userId);

        if (error) {
            console.error('updateSong error:', error);
            throw new Error(error.message);
        }

        return true;
    },

    async deleteSong(userId, songId) {
        if (!this.requireConnection()) throw new Error('Database not connected');

        // Delete associated practice records first
        await supabaseClient.from('practice').delete().eq('song_id', songId).eq('user_id', userId);

        const { error } = await supabaseClient
            .from('songs')
            .delete()
            .eq('id', songId)
            .eq('user_id', userId);

        if (error) {
            console.error('deleteSong error:', error);
            throw new Error(error.message);
        }

        return true;
    },

    // ----------------------------------------------------
    // Practice Session Queries
    // ----------------------------------------------------
    async getPractice(userId) {
        if (!this.isReady()) return [];

        const { data, error } = await supabaseClient
            .from('practice')
            .select('*')
            .eq('user_id', userId)
            .order('date', { ascending: false })
            .order('id', { ascending: false });

        if (error) {
            console.error('getPractice error:', error);
            showToast(`Error fetching practice logs: ${error.message}`, 'danger');
            return [];
        }

        return data || [];
    },

    async addPractice(userId, practiceData) {
        if (!this.requireConnection()) throw new Error('Database not connected');

        const { data, error } = await supabaseClient
            .from('practice')
            .insert([{
                user_id: userId,
                song_id: parseInt(practiceData.song_id),
                date: practiceData.date,
                minutes: parseInt(practiceData.minutes),
                rating: parseInt(practiceData.rating),
                notes: practiceData.notes || ''
            }])
            .select();

        if (error) {
            console.error('addPractice error:', error);
            throw new Error(error.message);
        }

        return data && data[0] ? data[0] : null;
    },

    async deletePractice(userId, practiceId) {
        if (!this.requireConnection()) throw new Error('Database not connected');

        const { error } = await supabaseClient
            .from('practice')
            .delete()
            .eq('id', practiceId)
            .eq('user_id', userId);

        if (error) {
            console.error('deletePractice error:', error);
            throw new Error(error.message);
        }

        return true;
    }
};

// --------------------------------------------------------
// 3. Router & Navigation
// --------------------------------------------------------
const router = {
    currentRoute: 'home',

    init() {
        window.addEventListener('hashchange', () => this.handleHashChange());
        this.handleHashChange();
    },

    navigate(route) {
        window.location.hash = route;
    },

    handleHashChange() {
        let hash = window.location.hash.slice(1) || 'home';
        let queryParams = {};

        if (hash.includes('?')) {
            const [path, query] = hash.split('?');
            hash = path;
            const params = new URLSearchParams(query);
            for (const [k, v] of params.entries()) {
                queryParams[k] = v;
            }
        }

        const protectedRoutes = ['dashboard', 'songs', 'practice', 'progress'];

        if (protectedRoutes.includes(hash) && !currentUser) {
            showToast('Please sign in to access your vault.', 'warning');
            this.navigate('login');
            return;
        }

        if ((hash === 'login' || hash === 'register') && currentUser) {
            this.navigate('dashboard');
            return;
        }

        this.currentRoute = hash;
        this.renderView(hash, queryParams);
        this.updateNav();
    },

    renderView(route, params = {}) {
        document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

        const targetView = document.getElementById(`view-${route}`);
        if (targetView) {
            targetView.classList.add('active');
        } else {
            const homeView = document.getElementById('view-home');
            if (homeView) homeView.classList.add('active');
        }

        // View loaders
        if (route === 'dashboard') loadDashboard();
        if (route === 'songs') loadSongs();
        if (route === 'practice') loadPractice(params.song_id);
        if (route === 'progress') loadProgress();
    },

    updateNav() {
        const authLinks = document.querySelectorAll('.nav-auth');
        const guestLinks = document.querySelectorAll('.nav-guest');

        if (currentUser) {
            authLinks.forEach(el => el.style.display = 'block');
            guestLinks.forEach(el => el.style.display = 'none');
        } else {
            authLinks.forEach(el => el.style.display = 'none');
            guestLinks.forEach(el => el.style.display = 'block');
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            const href = link.getAttribute('href');
            if (href === `#${this.currentRoute}`) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }
};

// --------------------------------------------------------
// 4. Authentication (Bcrypt + Supabase)
// --------------------------------------------------------
async function registerUser(name, email, password) {
    if (!name || !email || !password) {
        showToast('Please fill in all fields.', 'danger');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'danger');
        return;
    }

    if (!db.requireConnection()) return;

    const submitBtn = document.getElementById('btn-submit-register');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving to Supabase...';
    }

    try {
        // 1. Check if user already exists in Supabase users table
        const existing = await db.findUserByEmail(email);
        if (existing) {
            showToast('An account with this email already exists in Supabase. Please sign in.', 'warning');
            router.navigate('login');
            return;
        }

        // 2. Hash password using bcrypt
        const salt = dcodeIO.bcrypt.genSaltSync(10);
        const passwordHash = dcodeIO.bcrypt.hashSync(password, salt);

        // 3. Save into Supabase users table
        const newUser = await db.registerUser(name, email, passwordHash);

        showToast(`Account successfully created in Supabase! Welcome, ${newUser.name}.`, 'success');
        document.getElementById('form-register').reset();
        router.navigate('login');

    } catch (err) {
        console.error('Registration failed:', err);
        showToast(`Registration failed: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    }
}

async function loginUser(email, password) {
    if (!email || !password) {
        showToast('Please enter both email and password.', 'danger');
        return;
    }

    if (!db.requireConnection()) return;

    const submitBtn = document.getElementById('btn-submit-login');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying with Supabase...';
    }

    try {
        // Query user from Supabase
        const user = await db.findUserByEmail(email);
        if (!user) {
            showToast('Invalid email or password.', 'danger');
            return;
        }

        // Verify password using bcrypt
        const isMatch = dcodeIO.bcrypt.compareSync(password, user.password_hash);
        if (!isMatch) {
            showToast('Invalid email or password.', 'danger');
            return;
        }

        // Store active session
        currentUser = {
            id: user.id,
            name: user.name,
            email: user.email
        };
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        
        showToast(`Welcome back, ${currentUser.name}!`, 'success');
        document.getElementById('form-login').reset();
        router.navigate('dashboard');

    } catch (err) {
        console.error('Login error:', err);
        showToast(`Login failed: ${err.message}`, 'danger');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign In';
        }
    }
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    showToast('Signed out successfully.', 'info');
    router.navigate('login');
}

// --------------------------------------------------------
// 5. Dashboard View
// --------------------------------------------------------
async function loadDashboard() {
    if (!currentUser) return;
    document.getElementById('dash-welcome-name').textContent = currentUser.name;

    try {
        const [songs, practices] = await Promise.all([
            db.getSongs(currentUser.id),
            db.getPractice(currentUser.id)
        ]);

        const songsMap = {};
        songs.forEach(s => songsMap[s.id] = s);

        const totalSongs = songs.length;
        const totalSessions = practices.length;
        const totalMinutes = practices.reduce((acc, p) => acc + (p.minutes || 0), 0);
        const avgRating = totalSessions > 0
            ? (practices.reduce((acc, p) => acc + (p.rating || 0), 0) / totalSessions).toFixed(1)
            : '—';

        document.getElementById('dash-total-songs').textContent = totalSongs;
        document.getElementById('dash-total-sessions').textContent = totalSessions;
        document.getElementById('dash-total-minutes').textContent = totalMinutes;
        document.getElementById('dash-avg-rating').innerHTML = totalSessions > 0
            ? `${avgRating} <span style="font-size: 1.1rem; color: #fbbf24;">/ 5</span>`
            : '—';

        const recentBody = document.getElementById('dash-recent-table-body');
        const emptyState = document.getElementById('dash-recent-empty');
        const tableContainer = document.getElementById('dash-recent-table-container');

        if (practices.length === 0) {
            tableContainer.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            tableContainer.style.display = 'block';
            emptyState.style.display = 'none';
            recentBody.innerHTML = practices.slice(0, 5).map(p => {
                const song = songsMap[p.song_id] || { song_name: 'Unknown Song', artist: '' };
                const stars = '★'.repeat(p.rating) + '☆'.repeat(5 - p.rating);
                return `
                    <tr>
                        <td style="color: var(--text-muted);">${p.date}</td>
                        <td>
                            <strong>${escapeHtml(song.song_name)}</strong>
                            <span style="color: var(--text-muted); font-size: 0.85rem; display: block;">${escapeHtml(song.artist)}</span>
                        </td>
                        <td>${p.minutes} mins</td>
                        <td><span class="star-rating">${stars}</span></td>
                        <td style="color: var(--text-muted); max-width: 250px;">${escapeHtml(p.notes || '—')}</td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        showToast(`Error loading dashboard: ${err.message}`, 'danger');
    }
}

// --------------------------------------------------------
// 6. Songs View (My Songs)
// --------------------------------------------------------
async function loadSongs() {
    if (!currentUser) return;
    try {
        const songs = await db.getSongs(currentUser.id);
        const countSpan = document.getElementById('songs-count');
        const tableBody = document.getElementById('songs-table-body');
        const emptyState = document.getElementById('songs-empty');
        const tableContainer = document.getElementById('songs-table-container');

        countSpan.textContent = songs.length;

        if (songs.length === 0) {
            tableContainer.style.display = 'none';
            emptyState.style.display = 'block';
        } else {
            tableContainer.style.display = 'block';
            emptyState.style.display = 'none';

            tableBody.innerHTML = songs.map(song => {
                const badgeClass = song.difficulty === 'Easy' ? 'badge-easy' : (song.difficulty === 'Hard' ? 'badge-hard' : 'badge-medium');
                return `
                    <tr>
                        <td><strong style="font-size: 1.05rem; color: #fff;">${escapeHtml(song.song_name)}</strong></td>
                        <td>${escapeHtml(song.artist)}</td>
                        <td><span style="color: var(--text-muted); font-size: 0.9rem;">${escapeHtml(song.language)}</span></td>
                        <td><span class="badge ${badgeClass}">${song.difficulty}</span></td>
                        <td style="text-align: right;">
                            <div class="action-buttons" style="justify-content: flex-end;">
                                <button class="btn btn-primary btn-sm" onclick="router.navigate('practice?song_id=${song.id}')">⏱️ Practice</button>
                                <button class="btn btn-secondary btn-sm" onclick="openEditSongModal(${song.id}, '${escapeAttr(song.song_name)}', '${escapeAttr(song.artist)}', '${escapeAttr(song.language)}', '${song.difficulty}')">✏️ Edit</button>
                                <button class="btn btn-danger btn-sm" onclick="deleteSongHandler(${song.id})">🗑️</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        showToast(`Error loading songs: ${err.message}`, 'danger');
    }
}

async function addSongHandler(e) {
    e.preventDefault();
    const name = document.getElementById('song_name').value.trim();
    const artist = document.getElementById('artist').value.trim();
    const language = document.getElementById('language').value.trim();
    const difficulty = document.getElementById('difficulty').value;

    if (!name || !artist || !language) {
        showToast('Please fill in song name, artist, and language.', 'danger');
        return;
    }

    try {
        await db.addSong(currentUser.id, { name, artist, language, difficulty });
        showToast(`Song "${name}" saved to Supabase!`, 'success');
        document.getElementById('add-song-form').reset();
        loadSongs();
    } catch (err) {
        showToast(`Error saving song: ${err.message}`, 'danger');
    }
}

function openEditSongModal(id, name, artist, language, difficulty) {
    document.getElementById('edit_song_id').value = id;
    document.getElementById('edit_song_name').value = name;
    document.getElementById('edit_artist').value = artist;
    document.getElementById('edit_language').value = language;
    document.getElementById('edit_difficulty').value = difficulty;
    document.getElementById('editSongModal').classList.add('active');
}

async function editSongHandler(e) {
    e.preventDefault();
    const id = document.getElementById('edit_song_id').value;
    const name = document.getElementById('edit_song_name').value.trim();
    const artist = document.getElementById('edit_artist').value.trim();
    const language = document.getElementById('edit_language').value.trim();
    const difficulty = document.getElementById('edit_difficulty').value;

    try {
        await db.updateSong(currentUser.id, id, { name, artist, language, difficulty });
        showToast('Song updated successfully in Supabase!', 'success');
        document.getElementById('editSongModal').classList.remove('active');
        loadSongs();
    } catch (err) {
        showToast(`Error updating song: ${err.message}`, 'danger');
    }
}

async function deleteSongHandler(id) {
    if (!confirm('Are you sure you want to delete this song and its practice history from Supabase?')) return;
    try {
        await db.deleteSong(currentUser.id, id);
        showToast('Song deleted from Supabase.', 'info');
        loadSongs();
    } catch (err) {
        showToast(`Error deleting song: ${err.message}`, 'danger');
    }
}

// --------------------------------------------------------
// 7. Practice View
// --------------------------------------------------------
async function loadPractice(preselectedSongId) {
    if (!currentUser) return;
    try {
        const [songs, practices] = await Promise.all([
            db.getSongs(currentUser.id),
            db.getPractice(currentUser.id)
        ]);

        const songsMap = {};
        songs.forEach(s => songsMap[s.id] = s);

        const songSelect = document.getElementById('practice_song_id');
        const noSongsCard = document.getElementById('practice-no-songs');
        const formCard = document.getElementById('practice-form-card');
        const historyBody = document.getElementById('practice-history-body');
        const historyEmpty = document.getElementById('practice-history-empty');
        const historyTable = document.getElementById('practice-history-table-container');
        const historyCount = document.getElementById('practice-history-count');

        document.getElementById('practice_date').value = new Date().toISOString().split('T')[0];

        if (songs.length === 0) {
            noSongsCard.style.display = 'block';
            formCard.style.display = 'none';
        } else {
            noSongsCard.style.display = 'none';
            formCard.style.display = 'block';

            songSelect.innerHTML = '<option value="" disabled selected>Select a song...</option>' +
                songs.map(s => `
                    <option value="${s.id}" ${preselectedSongId && preselectedSongId == s.id ? 'selected' : ''}>
                        ${escapeHtml(s.song_name)} — ${escapeHtml(s.artist)} (${s.difficulty})
                    </option>
                `).join('');
        }

        historyCount.textContent = practices.length;
        if (practices.length === 0) {
            historyTable.style.display = 'none';
            historyEmpty.style.display = 'block';
        } else {
            historyTable.style.display = 'block';
            historyEmpty.style.display = 'none';

            historyBody.innerHTML = practices.map(p => {
                const song = songsMap[p.song_id] || { song_name: 'Unknown Song', artist: '' };
                const stars = '★'.repeat(p.rating) + '☆'.repeat(5 - p.rating);
                return `
                    <tr>
                        <td style="color: var(--text-muted); white-space: nowrap;">${p.date}</td>
                        <td>
                            <strong>${escapeHtml(song.song_name)}</strong>
                            <span style="color: var(--text-muted); font-size: 0.85rem; display: block;">${escapeHtml(song.artist)}</span>
                        </td>
                        <td style="white-space: nowrap;">${p.minutes} mins</td>
                        <td style="white-space: nowrap;"><span class="star-rating">${stars}</span></td>
                        <td style="color: var(--text-muted); max-width: 300px;">${escapeHtml(p.notes || '—')}</td>
                        <td style="text-align: right;">
                            <button class="btn btn-danger btn-sm" onclick="deletePracticeHandler(${p.id})">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    } catch (err) {
        showToast(`Error loading practice view: ${err.message}`, 'danger');
    }
}

async function addPracticeHandler(e) {
    e.preventDefault();
    const song_id = document.getElementById('practice_song_id').value;
    const date = document.getElementById('practice_date').value;
    const minutes = parseInt(document.getElementById('practice_minutes').value);
    const rating = parseInt(document.getElementById('practice_rating').value);
    const notes = document.getElementById('practice_notes').value.trim();

    if (!song_id || !minutes || !rating) {
        showToast('Please select a song, duration, and rating.', 'danger');
        return;
    }

    if (minutes <= 0) {
        showToast('Minutes must be greater than 0.', 'danger');
        return;
    }

    try {
        await db.addPractice(currentUser.id, { song_id, date, minutes, rating, notes });
        showToast('Practice session saved in Supabase! Keep it up!', 'success');
        document.getElementById('practice-form').reset();
        document.getElementById('practice_date').value = new Date().toISOString().split('T')[0];
        loadPractice();
    } catch (err) {
        showToast(`Error saving practice session: ${err.message}`, 'danger');
    }
}

async function deletePracticeHandler(id) {
    if (!confirm('Delete this practice log from Supabase?')) return;
    try {
        await db.deletePractice(currentUser.id, id);
        showToast('Practice log deleted from Supabase.', 'info');
        loadPractice();
    } catch (err) {
        showToast(`Error deleting practice log: ${err.message}`, 'danger');
    }
}

// --------------------------------------------------------
// 8. Progress View (Chart.js & Analytics)
// --------------------------------------------------------
async function loadProgress() {
    if (!currentUser) return;
    try {
        const [songs, practices] = await Promise.all([
            db.getSongs(currentUser.id),
            db.getPractice(currentUser.id)
        ]);

        const songsMap = {};
        songs.forEach(s => songsMap[s.id] = s);

        const totalSessions = practices.length;
        const totalMinutes = practices.reduce((acc, p) => acc + (p.minutes || 0), 0);
        const avgRating = totalSessions > 0
            ? (practices.reduce((acc, p) => acc + (p.rating || 0), 0) / totalSessions).toFixed(1)
            : '—';

        document.getElementById('prog-total-minutes').textContent = totalMinutes;
        document.getElementById('prog-hours-est').textContent = `~${(totalMinutes / 60).toFixed(1)} hours`;
        document.getElementById('prog-total-sessions').textContent = totalSessions;
        document.getElementById('prog-avg-rating').innerHTML = totalSessions > 0
            ? `${avgRating} <span style="font-size: 1rem; color: #fbbf24;">/ 5</span>`
            : '—';

        // Find Most Practiced Song
        const songMinutesMap = {};
        const songSessionsMap = {};

        practices.forEach(p => {
            songMinutesMap[p.song_id] = (songMinutesMap[p.song_id] || 0) + (p.minutes || 0);
            songSessionsMap[p.song_id] = (songSessionsMap[p.song_id] || 0) + 1;
        });

        const topSongEl = document.getElementById('prog-top-song-name');
        const topSongSub = document.getElementById('prog-top-song-sub');

        let topSongId = null;
        let maxMinutes = 0;
        for (const sId in songMinutesMap) {
            if (songMinutesMap[sId] > maxMinutes) {
                maxMinutes = songMinutesMap[sId];
                topSongId = sId;
            }
        }

        if (topSongId && songsMap[topSongId]) {
            topSongEl.textContent = songsMap[topSongId].song_name;
            topSongSub.textContent = `${maxMinutes} mins (${songSessionsMap[topSongId]} sessions)`;
        } else {
            topSongEl.textContent = '—';
            topSongSub.textContent = 'No practice logs yet';
        }

        renderWeeklyChart(practices);

    } catch (err) {
        showToast(`Error loading progress: ${err.message}`, 'danger');
    }
}

function renderWeeklyChart(practices) {
    const ctx = document.getElementById('practiceProgressChart');
    if (!ctx) return;

    const today = new Date();
    const dateLabels = [];
    const dateKeys = [];
    const minutesMap = {};

    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const isoDate = d.toISOString().split('T')[0];
        const display = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dateKeys.push(isoDate);
        dateLabels.push(display);
        minutesMap[isoDate] = 0;
    }

    practices.forEach(p => {
        if (minutesMap.hasOwnProperty(p.date)) {
            minutesMap[p.date] += (p.minutes || 0);
        }
    });

    const dataValues = dateKeys.map(k => minutesMap[k]);

    if (currentPracticeChart) {
        currentPracticeChart.destroy();
    }

    const chartCtx = ctx.getContext('2d');
    const gradient = chartCtx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(124, 58, 237, 0.85)');
    gradient.addColorStop(1, 'rgba(79, 70, 229, 0.2)');

    currentPracticeChart = new Chart(chartCtx, {
        type: 'bar',
        data: {
            labels: dateLabels,
            datasets: [{
                label: 'Minutes Practiced',
                data: dataValues,
                backgroundColor: gradient,
                borderColor: '#8b5cf6',
                borderWidth: 2,
                borderRadius: 8,
                barPercentage: 0.55
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f253d',
                    titleColor: '#fff',
                    bodyColor: '#e5e7eb',
                    borderColor: '#7c3aed',
                    borderWidth: 1,
                    padding: 12,
                    callbacks: {
                        label: (c) => `${c.parsed.y} minutes`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: { color: '#9ca3af' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
                    ticks: {
                        color: '#9ca3af',
                        callback: (v) => `${v} m`
                    }
                }
            }
        }
    });
}

// --------------------------------------------------------
// 9. Supabase Connection Modal
// --------------------------------------------------------
function openDbModal() {
    const { url, key } = db.getSavedConfig();
    document.getElementById('cfg_supabase_url').value = url;
    document.getElementById('cfg_supabase_key').value = key;
    document.getElementById('dbConfigModal').classList.add('active');
}

async function saveDbConfig(e) {
    e.preventDefault();
    const url = document.getElementById('cfg_supabase_url').value.trim();
    const key = document.getElementById('cfg_supabase_key').value.trim();

    if (!url || !key) {
        showToast('Please enter both Project URL and Anon Key.', 'danger');
        return;
    }

    if (!url.startsWith('http')) {
        showToast('Project URL must start with https://', 'danger');
        return;
    }

    const saveBtn = document.getElementById('btn-save-db');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Testing Connection...';
    }

    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({ url, key }));
    const success = await db.init();

    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Connect & Test';
    }

    if (success) {
        showToast('Connected to Supabase PostgreSQL database successfully!', 'success');
        document.getElementById('dbConfigModal').classList.remove('active');
        // Reload current view
        router.renderView(router.currentRoute);
    } else {
        showToast('Connection failed! Check your credentials and verify schema.sql was run in Supabase.', 'danger');
    }
}

// --------------------------------------------------------
// Utilities
// --------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// --------------------------------------------------------
// 10. Initialization
// --------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Restore User Session
    const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (savedSession) {
        try {
            currentUser = JSON.parse(savedSession);
        } catch (e) {
            currentUser = null;
        }
    }

    // 2. Initialize Supabase
    await db.init();

    // 3. Initialize Router
    router.init();

    // 4. Form Event Listeners
    const regForm = document.getElementById('form-register');
    if (regForm) {
        regForm.addEventListener('submit', (e) => {
            e.preventDefault();
            registerUser(
                document.getElementById('reg_name').value.trim(),
                document.getElementById('reg_email').value.trim(),
                document.getElementById('reg_password').value
            );
        });
    }

    const logForm = document.getElementById('form-login');
    if (logForm) {
        logForm.addEventListener('submit', (e) => {
            e.preventDefault();
            loginUser(
                document.getElementById('log_email').value.trim(),
                document.getElementById('log_password').value
            );
        });
    }

    const addSongForm = document.getElementById('add-song-form');
    if (addSongForm) addSongForm.addEventListener('submit', addSongHandler);

    const editSongForm = document.getElementById('editSongForm');
    if (editSongForm) editSongForm.addEventListener('submit', editSongHandler);

    const practiceForm = document.getElementById('practice-form');
    if (practiceForm) practiceForm.addEventListener('submit', addPracticeHandler);

    const dbConfigForm = document.getElementById('dbConfigForm');
    if (dbConfigForm) dbConfigForm.addEventListener('submit', saveDbConfig);

    // Modal Close
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal-overlay');
            if (modal) modal.classList.remove('active');
        });
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });
});
