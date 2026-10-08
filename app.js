// ========================================================
// VocalVault – Client-Side Application Logic
// Pure HTML, CSS, JavaScript (Runs natively on GitHub Pages)
// ========================================================

// State management
let currentUser = null;
let supabaseClient = null;
let currentPracticeChart = null;

// Local fallback store keys
const STORAGE_KEYS = {
    SESSION: 'vocalvault_session',
    USERS: 'vocalvault_users',
    SONGS: 'vocalvault_songs',
    PRACTICE: 'vocalvault_practice',
    CONFIG: 'vocalvault_config'
};

// --------------------------------------------------------
// 1. Toast Alerts
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
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --------------------------------------------------------
// 2. Database Layer (Supabase + LocalStorage Fallback)
// --------------------------------------------------------
const db = {
    init() {
        // Retrieve credentials from localStorage or config.js
        const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
        const url = (savedConfig.url || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.url : '')).trim();
        const key = (savedConfig.key || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.key : '')).trim();

        if (url && key && !url.includes('your-supabase-project-url') && url.startsWith('http')) {
            try {
                if (window.supabase && window.supabase.createClient) {
                    supabaseClient = window.supabase.createClient(url, key);
                    console.log('✅ Supabase client initialized:', url);
                }
            } catch (err) {
                console.error('Supabase initialization failed:', err);
                supabaseClient = null;
            }
        } else {
            supabaseClient = null;
        }

        this.updateDbStatusBanner();
    },

    isSupabaseReady() {
        return supabaseClient !== null;
    },

    updateDbStatusBanner() {
        const pill = document.getElementById('db-status-pill');
        const text = document.getElementById('db-status-text');
        if (!pill || !text) return;

        if (this.isSupabaseReady()) {
            pill.className = 'db-pill supabase';
            pill.innerHTML = '⚡ Supabase PostgreSQL';
            text.textContent = 'Connected directly to your Supabase cloud database.';
        } else {
            pill.className = 'db-pill local';
            pill.innerHTML = '💻 Local Demo Mode';
            text.textContent = 'Running in browser demo mode. Click "Database Settings" to connect Supabase.';
        }
    },

    // Users
    async findUserByEmail(email) {
        email = email.toLowerCase().trim();
        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('email', email)
                    .limit(1);
                if (error) throw error;
                return data && data.length > 0 ? data[0] : null;
            } catch (err) {
                console.warn('Supabase fetch user error, falling back to local:', err.message);
            }
        }
        const localUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
        return localUsers.find(u => u.email === email) || null;
    },

    async registerUser(name, email, passwordHash) {
        email = email.toLowerCase().trim();
        const newUser = {
            id: Date.now(),
            name,
            email,
            password_hash: passwordHash,
            created_at: new Date().toISOString()
        };

        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('users')
                    .insert([{ name, email, password_hash: passwordHash }])
                    .select();
                if (error) throw error;
                if (data && data[0]) return data[0];
            } catch (err) {
                console.warn('Supabase register error:', err.message);
                throw err;
            }
        }

        // Save locally
        const localUsers = JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
        localUsers.push(newUser);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(localUsers));
        return newUser;
    },

    // Songs
    async getSongs(userId) {
        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('songs')
                    .select('*')
                    .eq('user_id', userId)
                    .order('id', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.warn('Supabase getSongs error:', err.message);
            }
        }
        const localSongs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SONGS) || '[]');
        return localSongs.filter(s => s.user_id === userId);
    },

    async addSong(userId, song) {
        const newSong = {
            user_id: userId,
            song_name: song.name,
            artist: song.artist,
            language: song.language,
            difficulty: song.difficulty
        };

        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('songs')
                    .insert([newSong])
                    .select();
                if (error) throw error;
                return data && data[0] ? data[0] : newSong;
            } catch (err) {
                console.error('Supabase addSong error:', err.message);
                throw err;
            }
        }

        const localSongs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SONGS) || '[]');
        newSong.id = Date.now();
        localSongs.unshift(newSong);
        localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(localSongs));
        return newSong;
    },

    async updateSong(userId, songId, updatedData) {
        if (this.isSupabaseReady()) {
            try {
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
                if (error) throw error;
                return true;
            } catch (err) {
                console.error('Supabase updateSong error:', err.message);
                throw err;
            }
        }

        const localSongs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SONGS) || '[]');
        const idx = localSongs.findIndex(s => s.id == songId && s.user_id == userId);
        if (idx !== -1) {
            localSongs[idx].song_name = updatedData.name;
            localSongs[idx].artist = updatedData.artist;
            localSongs[idx].language = updatedData.language;
            localSongs[idx].difficulty = updatedData.difficulty;
            localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(localSongs));
            return true;
        }
        return false;
    },

    async deleteSong(userId, songId) {
        if (this.isSupabaseReady()) {
            try {
                // Delete related practice records first
                await supabaseClient.from('practice').delete().eq('song_id', songId).eq('user_id', userId);
                const { error } = await supabaseClient.from('songs').delete().eq('id', songId).eq('user_id', userId);
                if (error) throw error;
                return true;
            } catch (err) {
                console.error('Supabase deleteSong error:', err.message);
                throw err;
            }
        }

        let localSongs = JSON.parse(localStorage.getItem(STORAGE_KEYS.SONGS) || '[]');
        localSongs = localSongs.filter(s => !(s.id == songId && s.user_id == userId));
        localStorage.setItem(STORAGE_KEYS.SONGS, JSON.stringify(localSongs));

        let localPractice = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRACTICE) || '[]');
        localPractice = localPractice.filter(p => !(p.song_id == songId && p.user_id == userId));
        localStorage.setItem(STORAGE_KEYS.PRACTICE, JSON.stringify(localPractice));
        return true;
    },

    // Practice Sessions
    async getPractice(userId) {
        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('practice')
                    .select('*')
                    .eq('user_id', userId)
                    .order('date', { ascending: false })
                    .order('id', { ascending: false });
                if (error) throw error;
                return data || [];
            } catch (err) {
                console.warn('Supabase getPractice error:', err.message);
            }
        }
        const localPractice = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRACTICE) || '[]');
        return localPractice.filter(p => p.user_id === userId).sort((a, b) => (b.date > a.date ? 1 : -1));
    },

    async addPractice(userId, practiceData) {
        const record = {
            user_id: userId,
            song_id: parseInt(practiceData.song_id),
            date: practiceData.date,
            minutes: parseInt(practiceData.minutes),
            rating: parseInt(practiceData.rating),
            notes: practiceData.notes || ''
        };

        if (this.isSupabaseReady()) {
            try {
                const { data, error } = await supabaseClient
                    .from('practice')
                    .insert([record])
                    .select();
                if (error) throw error;
                return data && data[0] ? data[0] : record;
            } catch (err) {
                console.error('Supabase addPractice error:', err.message);
                throw err;
            }
        }

        const localPractice = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRACTICE) || '[]');
        record.id = Date.now();
        localPractice.unshift(record);
        localStorage.setItem(STORAGE_KEYS.PRACTICE, JSON.stringify(localPractice));
        return record;
    },

    async deletePractice(userId, practiceId) {
        if (this.isSupabaseReady()) {
            try {
                const { error } = await supabaseClient
                    .from('practice')
                    .delete()
                    .eq('id', practiceId)
                    .eq('user_id', userId);
                if (error) throw error;
                return true;
            } catch (err) {
                console.error('Supabase deletePractice error:', err.message);
                throw err;
            }
        }

        let localPractice = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRACTICE) || '[]');
        localPractice = localPractice.filter(p => !(p.id == practiceId && p.user_id == userId));
        localStorage.setItem(STORAGE_KEYS.PRACTICE, JSON.stringify(localPractice));
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

        // Trigger view-specific loaders
        if (route === 'dashboard') loadDashboard();
        if (route === 'songs') loadSongs();
        if (route === 'practice') loadPractice(params.song_id);
        if (route === 'progress') loadProgress();
    },

    updateNav() {
        // Toggle nav items based on user session
        const authLinks = document.querySelectorAll('.nav-auth');
        const guestLinks = document.querySelectorAll('.nav-guest');

        if (currentUser) {
            authLinks.forEach(el => el.style.display = 'block');
            guestLinks.forEach(el => el.style.display = 'none');
        } else {
            authLinks.forEach(el => el.style.display = 'none');
            guestLinks.forEach(el => el.style.display = 'block');
        }

        // Active link styling
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
// 4. Authentication (with bcrypt)
// --------------------------------------------------------
async function registerUser(name, email, password) {
    if (!name || !email || !password) {
        showToast('Please fill in all registration fields.', 'danger');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'danger');
        return;
    }

    try {
        const existing = await db.findUserByEmail(email);
        if (existing) {
            showToast('An account with this email already exists. Please log in.', 'warning');
            router.navigate('login');
            return;
        }

        // Hash password with bcrypt
        const salt = dcodeIO.bcrypt.genSaltSync(10);
        const passwordHash = dcodeIO.bcrypt.hashSync(password, salt);

        await db.registerUser(name, email, passwordHash);
        showToast('Account created successfully! Please sign in.', 'success');
        router.navigate('login');
    } catch (err) {
        showToast(`Registration failed: ${err.message}`, 'danger');
    }
}

async function loginUser(email, password) {
    if (!email || !password) {
        showToast('Please enter both email and password.', 'danger');
        return;
    }

    try {
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

        // Set session
        currentUser = {
            id: user.id,
            name: user.name,
            email: user.email
        };
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(currentUser));
        showToast(`Welcome back, ${currentUser.name}!`, 'success');
        router.navigate('dashboard');
    } catch (err) {
        showToast(`Login failed: ${err.message}`, 'danger');
    }
}

function logoutUser() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    showToast('Logged out successfully.', 'info');
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

        // Recent 5 practices
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
                            <strong>${song.song_name}</strong>
                            <span style="color: var(--text-muted); font-size: 0.85rem; display: block;">${song.artist}</span>
                        </td>
                        <td>${p.minutes} mins</td>
                        <td><span class="star-rating">${stars}</span></td>
                        <td style="color: var(--text-muted); max-width: 250px;">${p.notes || '—'}</td>
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
        showToast(`Song "${name}" added to vault!`, 'success');
        document.getElementById('add-song-form').reset();
        loadSongs();
    } catch (err) {
        showToast(`Error adding song: ${err.message}`, 'danger');
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
        showToast('Song updated successfully!', 'success');
        document.getElementById('editSongModal').classList.remove('active');
        loadSongs();
    } catch (err) {
        showToast(`Error updating song: ${err.message}`, 'danger');
    }
}

async function deleteSongHandler(id) {
    if (!confirm('Are you sure you want to delete this song and its practice history?')) return;
    try {
        await db.deleteSong(currentUser.id, id);
        showToast('Song removed from vault.', 'info');
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

        // Set default today's date
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

        // Render practice logs
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
        showToast('Practice session recorded! Keep up the vocal training!', 'success');
        document.getElementById('practice-form').reset();
        document.getElementById('practice_date').value = new Date().toISOString().split('T')[0];
        loadPractice();
    } catch (err) {
        showToast(`Error recording practice: ${err.message}`, 'danger');
    }
}

async function deletePracticeHandler(id) {
    if (!confirm('Delete this practice log?')) return;
    try {
        await db.deletePractice(currentUser.id, id);
        showToast('Practice log deleted.', 'info');
        loadPractice();
    } catch (err) {
        showToast(`Error deleting practice log: ${err.message}`, 'danger');
    }
}

// --------------------------------------------------------
// 8. Progress View (Stats & Chart.js)
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

        // Most Practiced Song
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

        // Render Chart.js
        renderWeeklyChart(practices);

    } catch (err) {
        showToast(`Error loading progress: ${err.message}`, 'danger');
    }
}

function renderWeeklyChart(practices) {
    const ctx = document.getElementById('practiceProgressChart');
    if (!ctx) return;

    // Generate last 7 days labels & values
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
                        label: (ctx) => `${ctx.parsed.y} minutes`
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
// 9. Database Settings Modal
// --------------------------------------------------------
function openDbModal() {
    const savedConfig = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONFIG) || '{}');
    document.getElementById('cfg_supabase_url').value = savedConfig.url || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.url : '');
    document.getElementById('cfg_supabase_key').value = savedConfig.key || (typeof SUPABASE_CONFIG !== 'undefined' ? SUPABASE_CONFIG.key : '');
    document.getElementById('dbConfigModal').classList.add('active');
}

async function saveDbConfig(e) {
    e.preventDefault();
    const url = document.getElementById('cfg_supabase_url').value.trim();
    const key = document.getElementById('cfg_supabase_key').value.trim();

    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify({ url, key }));
    db.init();

    if (db.isSupabaseReady()) {
        showToast('Connected to Supabase successfully!', 'success');
    } else {
        showToast('Saved. Enter valid Supabase credentials to activate cloud sync.', 'info');
    }

    document.getElementById('dbConfigModal').classList.remove('active');
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
document.addEventListener('DOMContentLoaded', () => {
    // 1. Restore Session
    const savedSession = localStorage.getItem(STORAGE_KEYS.SESSION);
    if (savedSession) {
        try {
            currentUser = JSON.parse(savedSession);
        } catch (e) {
            currentUser = null;
        }
    }

    // 2. Initialize Database
    db.init();

    // 3. Initialize Router
    router.init();

    // 4. Attach Form Handlers
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

    // Modal Close buttons
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
