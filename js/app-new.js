// ============================================================
// app.js — Tournament Management System
// Multi-sport tournament support with rule-based fixture generation
// Adds optional server-mode (Socket.IO + REST) when available.
// ============================================================

// ---------- State ----------
let tournamentsData = {};
let currentTournament = null;
let currentDivision = null;
let currentMatch = null;
let adminLoggedIn = false;
let draftData = null;
let SERVER_AVAILABLE = false;

const ADMIN_PASSWORD = 'admin123';
const DRAFT_KEY = 'rss_scoreboard_draft';

// ============================================================
// Bootstrap
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  (async () => {
    await detectServer();
    loadSavedDraft();
    await loadTournamentsData();
    setupEventListeners();
    initializeUI();
    window.addEventListener('storage', handleStorageSync);
  })();
});

async function detectServer() {
  try {
    const res = await fetch('/api/ping');
    if (res.ok) {
      SERVER_AVAILABLE = true;
      // dynamically load socket.io client then init socket
      await loadSocketClient();
      initSocket();
      console.log('Server mode: enabled');
    }
  } catch (e) {
    SERVER_AVAILABLE = false;
    console.log('Server mode: not available');
  }
}

function loadSocketClient() {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/socket.io/socket.io.js';
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

function initSocket() {
  try {
    if (typeof io === 'undefined') return;
    const socket = io();
    socket.on('tournaments:update', (data) => {
      tournamentsData = data;
      draftData = data;
      populateTournamentSelector();
      if (currentTournament) {
        const preserved = currentTournament.id;
        if (tournamentsData.tournaments.some(t => t.id === preserved)) {
          switchTournament(preserved);
        } else if (tournamentsData.tournaments.length > 0) {
          switchTournament(tournamentsData.tournaments[0].id);
        } else {
          updateEmptyState();
        }
      } else if (tournamentsData.tournaments && tournamentsData.tournaments.length > 0) {
        switchTournament(tournamentsData.tournaments[0].id);
      } else {
        updateEmptyState();
      }
      showSuccess('Live data updated from server.');
    });
  } catch (e) {
    console.warn('Socket init failed', e);
  }
}

function handleStorageSync(event) {
  if (event.key !== DRAFT_KEY) return;
  if (!event.newValue) return;

  try {
    const updated = JSON.parse(event.newValue);
    tournamentsData = updated;
    draftData = updated;
    populateTournamentSelector();
    if (currentTournament) {
      const preserved = currentTournament.id;
      if (tournamentsData.tournaments.some(t => t.id === preserved)) {
        switchTournament(preserved);
      } else if (tournamentsData.tournaments.length > 0) {
        switchTournament(tournamentsData.tournaments[0].id);
      } else {
        updateEmptyState();
      }
    } else if (tournamentsData.tournaments.length > 0) {
      switchTournament(tournamentsData.tournaments[0].id);
    } else {
      updateEmptyState();
    }
    showSuccess('Live data updated from another tab.');
  } catch (e) {
    console.error('Failed to sync storage update:', e);
  }
}

// ============================================================
// Data Loading
// ============================================================

async function loadTournamentsData() {
  try {
    if (SERVER_AVAILABLE) {
      const response = await fetch('/api/tournaments');
      if (response.ok) {
        tournamentsData = await response.json();
      } else {
        tournamentsData = { tournaments: [] };
      }
    } else {
      const response = await fetch('data/tournaments.json');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      tournamentsData = await response.json();
    }

    if (draftData && draftData.tournaments) {
      tournamentsData.tournaments = draftData.tournaments;
    }

    populateTournamentSelector();
    if (tournamentsData.tournaments && tournamentsData.tournaments.length > 0) {
      switchTournament(tournamentsData.tournaments[0].id);
    } else {
      updateEmptyState();
    }
  } catch (err) {
    console.error('Failed to load tournaments.json:', err);
    showError('Could not load tournament data.');
  }
}

function loadSavedDraft() {
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      draftData = JSON.parse(saved);
      document.getElementById('draft-indicator').classList.remove('d-none');
    }
  } catch (e) {
    console.error('localStorage read failed:', e);
  }
}

// ============================================================
// Tournament Selector
// ============================================================

function populateTournamentSelector() {
  const select = document.getElementById('tournament-select');
  if (!select) return;
  select.innerHTML = '';

  if (!tournamentsData.tournaments || tournamentsData.tournaments.length === 0) {
    select.innerHTML = '<option value="">No tournaments available</option>';
    return;
  }

  tournamentsData.tournaments.forEach(tour => {
    const option = document.createElement('option');
    option.value = tour.id;
    option.textContent = `${tour.name} (${tour.sport.toUpperCase()}) - ${tour.status}`;
    select.appendChild(option);
  });
}

function switchTournament(tournamentId) {
  const tournament = tournamentsData.tournaments?.find(t => t.id === tournamentId);
  if (!tournament) return;

  currentTournament = tournament;
  currentDivision = tournament.divisions?.[0];
  currentMatch = null;

  renderTournamentUI();
  const sel = document.getElementById('tournament-select');
  if (sel) sel.value = tournamentId;
}

function switchDivision(divisionId) {
  const division = currentTournament.divisions?.find(d => d.id === divisionId);
  if (!division) return;

  currentDivision = division;
  currentMatch = null;
  renderTournamentUI();
}

function renderTournamentUI() {
  if (!currentTournament || !currentDivision) {
    updateEmptyState();
    return;
  }

  updateEmptyState();
  renderDivisionTabs();
  renderLeague();
  updateSportHelperText();
}

function updateEmptyState() {
  const emptyCard = document.getElementById('empty-state-card');
  if (!emptyCard) return;

  if (!tournamentsData.tournaments || tournamentsData.tournaments.length === 0) {
    emptyCard.classList.remove('d-none');
  } else {
    emptyCard.classList.add('d-none');
  }

  if (currentTournament) {
    const title = document.getElementById('league-title');
    if (title) title.textContent = `${currentTournament.name} — ${currentTournament.sport.toUpperCase()}`;
  } else {
    const title = document.getElementById('league-title');
    if (title) title.textContent = 'No tournaments yet';
  }
}

function renderDivisionTabs() {
  const container = document.getElementById('divisions-tabs');
  if (!container) return;
  container.innerHTML = '';

  if (!currentTournament.divisions || currentTournament.divisions.length === 0) return;

  currentTournament.divisions.forEach(div => {
    const btn = document.createElement('button');
    btn.className = 'league-tab' + (currentDivision && currentDivision.id === div.id ? ' active' : '');
    btn.setAttribute('data-division', div.id);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', currentDivision && currentDivision.id === div.id);
    btn.textContent = div.name;
    btn.addEventListener('click', () => switchDivision(div.id));
    container.appendChild(btn);
  });
}

// ============================================================
// Standings Calculation
// ============================================================

function calculateStandings(teams, matches) {
  const table = teams.map(team => ({
    name: team.name,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    gd: 0,
    points: 0
  }));

  matches
    .filter(m => m.status === 'completed' && m.homeScore !== null && m.awayScore !== null)
    .forEach(m => {
      const home = table.find(r => r.name === m.home);
      const away = table.find(r => r.name === m.away);
      if (!home || !away) return;

      home.played++;
      away.played++;
      home.gf += m.homeScore;
      home.ga += m.awayScore;
      away.gf += m.awayScore;
      away.ga += m.homeScore;

      const winPts = currentTournament.rules.winPoints || 3;
      const drawPts = currentTournament.rules.drawPoints || 1;

      if (m.homeScore > m.awayScore) {
        home.won++;
        home.points += winPts;
        away.lost++;
      } else if (m.awayScore > m.homeScore) {
        away.won++;
        away.points += winPts;
        home.lost++;
      } else {
        home.drawn++;
        home.points += drawPts;
        away.drawn++;
        away.points += drawPts;
      }
    });

  table.forEach(r => { r.gd = r.gf - r.ga; });

  return table.sort((a, b) =>
    (b.points - a.points) ||
    (b.gd - a.gd) ||
    (b.gf - a.gf) ||
    a.name.localeCompare(b.name)
  );
}

function renderLeague() {
  if (!currentDivision) return;
  const standings = calculateStandings(currentDivision.teams, currentDivision.matches);
  displayStandings(standings);
  displayMatches(currentDivision.matches);
}

// ============================================================
// Admin — Login / Logout
// ============================================================

function handleAdminLogin(password) {
  if (password === ADMIN_PASSWORD) {
    adminLoggedIn = true;
    const adminSection = document.getElementById('admin-section');
    if (adminSection) adminSection.style.display = 'block';
    document.getElementById('admin-login-section')?.classList.add('d-none');
    document.getElementById('admin-panel')?.classList.remove('d-none');
    showAdminPanel();
    showSuccess('Admin access granted.');
  } else {
    showError('Incorrect password. Please try again.');
    const pw = document.getElementById('admin-password'); if (pw) pw.value = '';
  }
}

function handleAdminLogout() {
  adminLoggedIn = false;
  document.getElementById('admin-panel')?.classList.add('d-none');
  document.getElementById('admin-login-section')?.classList.remove('d-none');
  const pw = document.getElementById('admin-password'); if (pw) pw.value = '';
  const adminSection = document.getElementById('admin-section'); if (adminSection) adminSection.style.display = 'none';
}

function showAdminPanel() {
  populateAdminSelects();
  populateTournamentsListUI();
  populateTeamsListUI();
}

function updateSportHelperText() {
  const sport = document.getElementById('tournament-sport')?.value;
  const helper = document.getElementById('sport-helper-text');
  if (!helper) return;

  const messages = {
    soccer: 'Soccer matches use 2 halves, 45 minutes plus stoppage. Use event log for goals, cards, VAR, and substitutions.',
    rugby: 'Rugby uses 2 halves. Track tries, conversions, penalties, yellow/red cards, and momentum with live events.'
  };

  helper.textContent = messages[sport] || 'Choose a sport to enable relevant live match rules and event types.';
}

// ============================================================
// Admin — Tournament Management
// ============================================================

function handleCreateTournament(formData) {
  const tourId = 'tour-' + Date.now();
  const tournament = {
    id: tourId,
    name: formData.name,
    sport: formData.sport,
    status: formData.status,
    rules: getRulesByFormat(formData.format),
    divisions: [
      {
        id: 'div-' + tourId,
        name: 'Main Division',
        teams: [],
        matches: []
      }
    ]
  };

  tournamentsData.tournaments = tournamentsData.tournaments || [];
  tournamentsData.tournaments.push(tournament);
  saveDraftChanges();
  populateTournamentSelector();
  switchTournament(tourId);
  populateAdminSelects();
  showSuccess(`Tournament "${tournament.name}" created successfully!`);
}

function getRulesByFormat(format) {
  const ruleMap = {
    'single-round-robin': {
      format: 'single-round-robin',
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      description: 'Each team plays every other team once. Win = 3 pts, Draw = 1 pt.'
    },
    'double-round-robin': {
      format: 'double-round-robin',
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      description: 'Each team plays every other team twice (home and away).'
    },
    'knockout': {
      format: 'knockout',
      winPoints: 1,
      lossPoints: 0,
      description: 'Single elimination. Winners advance, losers are eliminated.'
    },
    'group-knockout': {
      format: 'group-knockout',
      winPoints: 3,
      drawPoints: 1,
      lossPoints: 0,
      description: 'Group stage followed by knockout rounds.'
    }
  };
  return ruleMap[format] || ruleMap['single-round-robin'];
}

// ============================================================
// Admin — Team Management
// ============================================================

function handleAddTeam(formData) {
  const tournament = tournamentsData.tournaments.find(t => t.id === formData.tournamentId);
  if (!tournament) return;

  const division = tournament.divisions[0];
  const teamId = Math.max(0, ...division.teams.map(t => t.id || 0)) + 1;

  const team = {
    id: teamId,
    name: formData.teamName,
    logo: formData.logo || null
  };

  division.teams.push(team);
  saveDraftChanges();
  switchTournament(tournament.id);
  populateTeamsListUI();
  showSuccess(`Team "${team.name}" added successfully!`);
}

function removeTeam(tournamentId, teamId) {
  const tournament = tournamentsData.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return;

  tournament.divisions.forEach(div => {
    div.teams = div.teams.filter(t => t.id !== teamId);
    div.matches = div.matches.filter(m => m.home !== teamId && m.away !== teamId);
  });

  saveDraftChanges();
  populateTeamsListUI();
  showSuccess('Team removed successfully!');
}

// ============================================================
// Admin — Fixture Generation
// ============================================================

function generateFixtures(tournamentId, divisionId) {
  const tournament = tournamentsData.tournaments.find(t => t.id === tournamentId);
  if (!tournament) return;

  const division = tournament.divisions.find(d => d.id === divisionId);
  if (!division || division.teams.length < 2) {
    showError('Division must have at least 2 teams to generate fixtures.');
    return;
  }

  let matches = [];
  const format = tournament.rules.format;

  if (format === 'single-round-robin') {
    matches = generateRoundRobinMatches(division.teams, 1);
  } else if (format === 'double-round-robin') {
    matches = generateRoundRobinMatches(division.teams, 2);
  } else if (format === 'knockout') {
    matches = generateKnockoutMatches(division.teams);
  }

  const nextId = Math.max(...division.matches.map(m => m.id || 0), 0) + 1;
  matches.forEach((match, idx) => {
    match.id = nextId + idx;
  });

  division.matches = matches;
  saveDraftChanges();
  renderLeague();
  showSuccess(`Generated ${matches.length} fixtures for ${division.name}!`);
}

function generateRoundRobinMatches(teams, rounds) {
  const matches = [];
  let matchDate = new Date();

  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      // First match: i vs j
      matches.push({
        home: teams[i].name,
        away: teams[j].name,
        homeScore: null,
        awayScore: null,
        status: 'scheduled',
        date: matchDate.toISOString().split('T')[0]
      });

      matchDate.setDate(matchDate.getDate() + 1);

      // Second match: j vs i (only for double round-robin)
      if (rounds === 2) {
        matches.push({
          home: teams[j].name,
          away: teams[i].name,
          homeScore: null,
          awayScore: null,
          status: 'scheduled',
          date: matchDate.toISOString().split('T')[0]
        });

        matchDate.setDate(matchDate.getDate() + 1);
      }
    }
  }

  return matches;
}

function generateKnockoutMatches(teams) {
  const matches = [];
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  let matchDate = new Date();

  for (let i = 0; i < shuffled.length - 1; i += 2) {
    matches.push({
      home: shuffled[i].name,
      away: shuffled[i + 1].name,
      homeScore: null,
      awayScore: null,
      status: 'scheduled',
      date: matchDate.toISOString().split('T')[0]
    });
    matchDate.setDate(matchDate.getDate() + 1);
  }

  return matches;
}

// ============================================================
// Admin — Score Update
// ============================================================

function handleScoreUpdate(matchId, homeScore, awayScore, status, minute) {
  if (!currentDivision) return;

  const match = currentDivision.matches.find(m => m.id === parseInt(matchId, 10));
  if (!match) {
    showError('Match not found.');
    return;
  }

  if (homeScore !== '') match.homeScore = parseInt(homeScore, 10);
  if (awayScore !== '') match.awayScore = parseInt(awayScore, 10);
  match.status = status || 'scheduled';
  match.minute = minute ? parseInt(minute, 10) : match.minute || 0;

  if (match.status === 'completed' && match.homeScore != null && match.awayScore != null) {
    match.completedAt = new Date().toISOString();
  }

  saveDraftChanges();
  renderLeague();
  showSuccess(`Updated match: ${match.home} ${match.homeScore ?? ''} – ${match.awayScore ?? ''} ${match.away} (${match.status})`);
  showAdminPanel();
}

function addMatchEvent(match, eventData) {
  match.events = match.events || [];
  match.events.push({
    id: Date.now(),
    type: eventData.type,
    team: eventData.team,
    minute: eventData.minute,
    player: eventData.player,
    description: eventData.description
  });
  saveDraftChanges();
  renderMatchEvents(match);
  renderLeague();
  showSuccess('Event added.');
}

function saveMatchStats(match, stats) {
  match.stats = stats;
  saveDraftChanges();
  renderLeague();
}

function handleAddMatch(data) {
  if (!currentTournament || !currentDivision) {
    showError('No active tournament/division selected.');
    return;
  }

  const nextId = Math.max(0, ...currentDivision.matches.map(m => m.id || 0)) + 1;
  const match = {
    id: nextId,
    home: data.home,
    away: data.away,
    homeScore: data.homeScore !== '' ? (parseInt(data.homeScore, 10) || 0) : null,
    awayScore: data.awayScore !== '' ? (parseInt(data.awayScore, 10) || 0) : null,
    status: data.status || 'scheduled',
    date: data.date || new Date().toISOString().split('T')[0],
    minute: 0,
    events: [],
    stats: {}
  };

  currentDivision.matches.push(match);
  saveDraftChanges();
  renderLeague();
  populateMatchSelect();
  populateTeamsListUI();
  showSuccess(`Match added: ${match.home} vs ${match.away} (${match.date})`);
}

// ============================================================
// Draft Management
// ============================================================

async function saveDraftChanges() {
  try {
    // Always keep local draft for offline/demo
    localStorage.setItem(DRAFT_KEY, JSON.stringify(tournamentsData));
    draftData = JSON.parse(JSON.stringify(tournamentsData));
    document.getElementById('draft-indicator').classList.remove('d-none');

    // If server available, push to server for persistence and broadcasting
    if (SERVER_AVAILABLE) {
      try {
        await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tournamentsData)
        });
      } catch (e) { console.warn('Failed to save to server:', e); }
    }
  } catch (e) {
    console.error('localStorage write failed:', e);
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  draftData = null;
  document.getElementById('draft-indicator').classList.add('d-none');
  loadTournamentsData();
  showSuccess('Draft cleared. Data reset to published version.');
}

function exportData() {
  const dataStr = JSON.stringify(tournamentsData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tournaments.json';
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// Admin UI Helpers
// ============================================================

function populateAdminSelects() {
  // Tournament selector for teams
  const tourSelect = document.getElementById('tournament-for-teams');
  if (tourSelect) {
    tourSelect.innerHTML = '<option value="">— Select Tournament —</option>';
    tournamentsData.tournaments?.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      tourSelect.appendChild(opt);
    });
  }

  // Tournament selector for scores
  const scoreSelect = document.getElementById('tournament-for-scores');
  if (scoreSelect) {
    scoreSelect.innerHTML = '<option value="">— Select Tournament —</option>';
    tournamentsData.tournaments?.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      scoreSelect.appendChild(opt);
    });
  }
}

function populateTournamentsListUI() {
  const container = document.getElementById('tournaments-list-container');
  if (!container) return;
  container.innerHTML = '';

  tournamentsData.tournaments?.forEach(t => {
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
      <div>
        <strong>${t.name}</strong><br>
        <small>Sport: ${t.sport} | Format: ${t.rules.format} | Status: ${t.status}</small>
      </div>
      <button class="btn btn-sm btn-info" onclick="editTournament('${t.id}')">Edit</button>
      <button class="btn btn-sm btn-danger" onclick="deleteTournament('${t.id}')">Delete</button>
    `;
    container.appendChild(item);
  });
}

function populateTeamsListUI() {
  const container = document.getElementById('teams-list-container');
  if (!container) return;
  container.innerHTML = '';

  if (!currentTournament) return;

  currentTournament.divisions.forEach(div => {
    const divisionHeader = document.createElement('div');
    divisionHeader.innerHTML = `<h5 style=\"margin-top: 12px; margin-bottom: 8px;\">${div.name}</h5>`;
    container.appendChild(divisionHeader);

    div.teams.forEach(team => {
      const item = document.createElement('div');
      item.className = 'admin-list-item';
      item.innerHTML = `
        <strong>${team.name}</strong>
        <button class="btn btn-sm btn-danger" onclick="removeTeam('${currentTournament.id}', ${team.id})">Remove</button>
      `;
      container.appendChild(item);
    });

    const generateBtn = document.createElement('button');
    generateBtn.className = 'btn btn-sm btn-info';
    generateBtn.textContent = '⚙ Generate Fixtures for ' + div.name;
    generateBtn.onclick = () => generateFixtures(currentTournament.id, div.id);
    container.appendChild(generateBtn);
  });

  // Update add-match team selects if present
  populateAddMatchTeams();
}

function populateAddMatchTeams() {
  const homeSelect = document.getElementById('add-home-team');
  const awaySelect = document.getElementById('add-away-team');
  if (!homeSelect || !awaySelect) return;

  homeSelect.innerHTML = '<option value="">— Select Home Team —</option>';
  awaySelect.innerHTML = '<option value="">— Select Away Team —</option>';

  if (!currentDivision || !currentDivision.teams) return;

  currentDivision.teams.forEach(team => {
    const opt1 = document.createElement('option');
    opt1.value = team.name;
    opt1.textContent = team.name;
    homeSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = team.name;
    opt2.textContent = team.name;
    awaySelect.appendChild(opt2);
  });
}

// ============================================================
// Event Listeners
// ============================================================

function setupEventListeners() {
  // Admin access button
  document.getElementById('admin-access-btn')?.addEventListener('click', () => {
    document.getElementById('admin-section').style.display = 'block';
    document.getElementById('admin-section').scrollIntoView({ behavior: 'smooth' });
  });

  // Admin login form
  document.getElementById('admin-login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const password = document.getElementById('admin-password').value;
    handleAdminLogin(password);
  });

  // Admin logout
  document.getElementById('admin-logout-btn')?.addEventListener('click', handleAdminLogout);

  // Admin tabs
  document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('d-none'));
      e.target.classList.add('active');
      const tabId = 'tab-' + e.target.getAttribute('data-tab');
      document.getElementById(tabId)?.classList.remove('d-none');
    });
  });

  // Create tournament
  document.getElementById('tournament-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleCreateTournament({
      name: document.getElementById('tournament-name').value,
      sport: document.getElementById('tournament-sport').value,
      format: document.getElementById('tournament-format').value,
      status: document.getElementById('tournament-status').value
    });
    e.target.reset();
  });

  // Add team
  document.getElementById('teams-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const logoInput = document.getElementById('team-logo');
    const teamData = {
      tournamentId: document.getElementById('tournament-for-teams').value,
      teamName: document.getElementById('team-name').value,
      logo: null
    };

    if (logoInput && logoInput.files && logoInput.files[0]) {
      if (SERVER_AVAILABLE) {
        // Upload to server endpoint
        const form = new FormData();
        form.append('logo', logoInput.files[0]);
        fetch('/api/upload-logo', { method: 'POST', body: form })
          .then(r => r.json())
          .then(json => {
            teamData.logo = json.url; // server-relative URL
            handleAddTeam(teamData);
            e.target.reset();
          })
          .catch(() => {
            // Fallback to data URL
            const reader = new FileReader();
            reader.onload = () => {
              teamData.logo = reader.result;
              handleAddTeam(teamData);
              e.target.reset();
            };
            reader.readAsDataURL(logoInput.files[0]);
          });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          teamData.logo = reader.result;
          handleAddTeam(teamData);
          e.target.reset();
        };
        reader.readAsDataURL(logoInput.files[0]);
      }
    } else {
      handleAddTeam(teamData);
      e.target.reset();
    }
  });

  // Tournament selector
  document.getElementById('tournament-select')?.addEventListener('change', (e) => {
    if (e.target.value) switchTournament(e.target.value);
  });

  // Update score
  document.getElementById('score-update-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    handleScoreUpdate(
      document.getElementById('match-select').value,
      document.getElementById('home-score').value,
      document.getElementById('away-score').value,
      document.getElementById('match-status').value,
      document.getElementById('match-minute').value
    );
  });

  // Match select (populate score fields)
  document.getElementById('match-select')?.addEventListener('change', (e) => {
    if (!currentDivision) return;
    const match = currentDivision.matches.find(m => m.id === parseInt(e.target.value, 10));
    if (match) {
      currentMatch = match;
      document.getElementById('match-label').textContent = `${match.home} vs ${match.away}`;
      document.getElementById('home-score').value = match.homeScore ?? '';
      document.getElementById('away-score').value = match.awayScore ?? '';
      document.getElementById('match-status').value = match.status || 'scheduled';
      document.getElementById('match-minute').value = match.minute || '';
      renderMatchEvents(match);
      renderMatchStats(match);
    }
  });

  // Tournament selector for scores
  document.getElementById('tournament-for-scores')?.addEventListener('change', (e) => {
    const tour = tournamentsData.tournaments?.find(t => t.id === e.target.value);
    if (tour) {
      switchTournament(e.target.value);
      populateMatchSelect();
    }
  });

  // Display toggles
  ['toggle-live-state', 'toggle-events', 'toggle-stats', 'toggle-momentum'].forEach(id => {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;
    checkbox.addEventListener('change', () => {
      document.body.classList.toggle(`hide-${id.replace('toggle-', '')}`, !checkbox.checked);
    });
  });

  // Sport guidance helpers
  document.getElementById('tournament-sport')?.addEventListener('change', updateSportHelperText);

  // Export button
  document.getElementById('export-btn')?.addEventListener('click', exportData);

  // Match event form
  document.getElementById('match-event-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentMatch) {
      showError('Please select a match first.');
      return;
    }
    addMatchEvent(currentMatch, {
      type: document.getElementById('event-type').value,
      team: document.getElementById('event-team').value,
      minute: parseInt(document.getElementById('event-minute').value, 10),
      player: document.getElementById('event-player').value,
      description: document.getElementById('event-description').value
    });
    e.target.reset();
  });

  // Match stats form
  document.getElementById('match-stats-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentMatch) {
      showError('Please select a match first.');
      return;
    }
    saveMatchStats(currentMatch, {
      possession: {
        home: parseInt(document.getElementById('stat-possession-home').value, 10) || 0,
        away: parseInt(document.getElementById('stat-possession-away').value, 10) || 0
      },
      shots: {
        home: parseInt(document.getElementById('stat-shots-home').value, 10) || 0,
        away: parseInt(document.getElementById('stat-shots-away').value, 10) || 0
      },
      corners: {
        home: parseInt(document.getElementById('stat-corners-home').value, 10) || 0,
        away: parseInt(document.getElementById('stat-corners-away').value, 10) || 0
      }
    });
    showSuccess('Match stats saved.');
  });

  // Add match form
  document.getElementById('add-match-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const home = document.getElementById('add-home-team').value;
    const away = document.getElementById('add-away-team').value;
    if (!home || !away) { showError('Select both teams'); return; }
    if (home === away) { showError('Home and away teams must be different'); return; }

    handleAddMatch({
      home,
      away,
      date: document.getElementById('add-match-date').value || new Date().toISOString().split('T')[0],
      status: document.getElementById('add-match-status').value,
      homeScore: document.getElementById('add-home-score').value,
      awayScore: document.getElementById('add-away-score').value
    });

    e.target.reset();
  });

  // Clear draft button
  document.getElementById('clear-draft-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all draft changes?')) {
      clearDraft();
    }
  });
}

function populateMatchSelect() {
  const select = document.getElementById('match-select');
  if (!select) return;
  select.innerHTML = '<option value="">— Select a match —</option>';

  if (!currentDivision || !currentDivision.matches) return;

  currentDivision.matches.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    const score = m.status === 'completed' ? `${m.homeScore}–${m.awayScore}` : 'TBD';
    opt.textContent = `${m.home} vs ${m.away} (${score})`;
    select.appendChild(opt);
  });

  if (currentMatch) {
    select.value = currentMatch.id;
  }
}

function initializeUI() {
  // Initially hide admin section
  const adminSection = document.getElementById('admin-section');
  if (adminSection) adminSection.style.display = 'none';
}

// ============================================================
// UI Display Functions
// ============================================================

function displayStandings(standingsArray) {
  const tbody = document.getElementById('standings-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!standingsArray || standingsArray.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="10" class="no-data">No team data available.</td>';
    tbody.appendChild(row);
    return;
  }

  standingsArray.forEach((team, index) => {
    const pos = index + 1;
    const row = document.createElement('tr');

    let rankClass = '';
    let rankBadge = pos;
    if (pos === 1) { rankClass = 'rank-gold';   rankBadge = '🥇'; }
    else if (pos === 2) { rankClass = 'rank-silver'; rankBadge = '🥈'; }
    else if (pos === 3) { rankClass = 'rank-bronze'; rankBadge = '🥉'; }

    row.className = rankClass;
    row.innerHTML = `
      <td class="rank-cell">${rankBadge}</td>
      <td class="team-name">${escapeHtml(team.name)}</td>
      <td>${team.played}</td>
      <td>${team.won}</td>
      <td>${team.drawn}</td>
      <td>${team.lost}</td>
      <td>${team.gf}</td>
      <td>${team.ga}</td>
      <td>${team.gd >= 0 ? '+' : ''}${team.gd}</td>
      <td class="points-col">${team.points}</td>
    `;
    tbody.appendChild(row);
  });
}

function displayMatches(matchesArray) {
  const live = matchesArray.filter(m => m.status === 'live').sort((a, b) => new Date(a.date) - new Date(b.date));
  const completed = matchesArray.filter(m => m.status === 'completed').sort((a, b) => new Date(b.date) - new Date(a.date));
  const scheduled = matchesArray.filter(m => m.status === 'scheduled').sort((a, b) => new Date(a.date) - new Date(b.date));

  const liveContainer = document.getElementById('live-container');
  if (liveContainer) {
    liveContainer.innerHTML = '';
    if (live.length === 0) {
      liveContainer.innerHTML = '<p class="no-data">No live matches currently.</p>';
    } else {
      const grid = document.createElement('div');
      grid.className = 'matches-grid';
      live.forEach(m => grid.appendChild(createMatchCard(m, 'live')));
      liveContainer.appendChild(grid);
    }
  }

  const resultsContainer = document.getElementById('results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = '';
    if (completed.length === 0) {
      resultsContainer.innerHTML = '<p class="no-data">No finished games yet.</p>';
    } else {
      const grid = document.createElement('div');
      grid.className = 'matches-grid';
      completed.forEach(m => grid.appendChild(createMatchCard(m, 'result')));
      resultsContainer.appendChild(grid);
    }
  }

  const fixturesContainer = document.getElementById('fixtures-container');
  if (fixturesContainer) {
    fixturesContainer.innerHTML = '';
    if (scheduled.length === 0) {
      fixturesContainer.innerHTML = '<p class="no-data">No upcoming fixtures.</p>';
    } else {
      const grid = document.createElement('div');
      grid.className = 'matches-grid';
      scheduled.forEach(m => grid.appendChild(createMatchCard(m, 'fixture')));
      fixturesContainer.appendChild(grid);
    }
  }

  displayEventFeed(matchesArray);
  populateMatchSelect();
}

function displayEventFeed(matchesArray) {
  const feed = document.getElementById('match-events-feed');
  if (!feed) return;
  feed.innerHTML = '';

  const events = matchesArray
    .filter(m => Array.isArray(m.events) && m.events.length > 0)
    .flatMap(m => m.events.map(event => ({ ...event, match: m })))
    .sort((a, b) => b.minute - a.minute || new Date(b.match.date) - new Date(a.match.date));

  if (!events || events.length === 0) {
    feed.innerHTML = '<p class="no-data">No match events logged yet.</p>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'event-feed-list';

  events.slice(0, 10).forEach(ev => {
    const item = document.createElement('div');
    item.className = 'feed-event-item';
    const teamName = ev.team === 'home' ? ev.match.home : ev.match.away;
    const eventType = ev.type.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    item.innerHTML = `
      <div class="feed-event-top">
        <span class="feed-event-minute">${ev.minute}'</span>
        <span class="feed-event-type">${escapeHtml(eventType)}</span>
        <span class="feed-event-match">${escapeHtml(ev.match.home)} vs ${escapeHtml(ev.match.away)}</span>
      </div>
      <div class="feed-event-detail">
        <strong>${escapeHtml(teamName)}</strong>${ev.player ? ` • ${escapeHtml(ev.player)}` : ''}
        <span>${escapeHtml(ev.description || '')}</span>
      </div>
    `;
    list.appendChild(item);
  });

  feed.appendChild(list);
}

function createMatchCard(match, type) {
  const card = document.createElement('div');
  card.className = `match-card ${type}`;
  const homeTeam = findTeamByName(match.home);
  const awayTeam = findTeamByName(match.away);
  const statusLabel = match.status === 'live' ? 'LIVE' : match.status === 'completed' ? 'FT' : 'Scheduled';
  const statusClass = match.status === 'live' ? 'status-pill-live' : match.status === 'completed' ? 'status-pill-completed' : 'status-pill-scheduled';
  const score = match.status === 'completed' || match.status === 'live'
    ? `<strong class="score-display">${match.homeScore ?? 0} – ${match.awayScore ?? 0}</strong>`
    : `<span class="fixture-tbd">TBD</span>`;
  const dateStr = match.date ? new Date(match.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD';
  const minuteText = match.status === 'live' ? `<span class="match-clock">${match.minute || 0}'</span>` : '';
  const homeLogo = homeTeam?.logo ? `<img src="${homeTeam.logo}" alt="${escapeHtml(homeTeam.name)} logo" class="team-logo" />` : `<span class="team-badge team-badge-home">${escapeHtml(match.home[0] || '')}</span>`;
  const awayLogo = awayTeam?.logo ? `<img src="${awayTeam.logo}" alt="${escapeHtml(awayTeam.name)} logo" class="team-logo" />` : `<span class="team-badge team-badge-away">${escapeHtml(match.away[0] || '')}</span>`;
  const eventSummary = match.events && match.events.length > 0
    ? `<div class="event-summary">${escapeHtml(match.events.slice(-1)[0].description || match.events.slice(-1)[0].type)} • ${match.events.slice(-1)[0].minute}'</div>`
    : '';
  const momentumText = match.stats?.possession
    ? `<div class="momentum-summary">Pressure: ${match.stats.possession.home}% home / ${match.stats.possession.away}% away</div>`
    : '';

  card.innerHTML = `
    <div class="match-card-header">
      <div class="status-pill ${statusClass}">${statusLabel}</div>
      <div class="match-date">${dateStr} ${minuteText}</div>
    </div>
    <div class="match-teams">
      <div class="team-entry team-home">
        ${homeLogo}
        <span>${escapeHtml(match.home)}</span>
      </div>
      <div class="match-score">${score}</div>
      <div class="team-entry team-away">
        <span>${escapeHtml(match.away)}</span>
        ${awayLogo}
      </div>
    </div>
    ${eventSummary}
    ${momentumText}
  `;
  return card;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function findTeamByName(name) {
  if (!currentDivision || !currentDivision.teams) return null;
  return currentDivision.teams.find(team => team.name === name) || null;
}

function renderMatchEvents(match) {
  const list = document.getElementById('match-events-list');
  if (!list) return;
  list.innerHTML = '';
  if (!match || !match.events || match.events.length === 0) {
    list.innerHTML = '<p class="no-data">No events logged for this match.</p>';
    return;
  }

  const sorted = [...match.events].sort((a, b) => a.minute - b.minute);
  sorted.forEach(event => {
    const item = document.createElement('div');
    item.className = 'event-item';
    const teamName = event.team === 'home' ? match.home : match.away;
    item.innerHTML = `
      <span class="event-minute">${event.minute}'</span>
      <strong>${escapeHtml(event.type)}</strong> — ${escapeHtml(teamName)}${event.player ? ` | ${escapeHtml(event.player)}` : ''}
      <div class="event-description">${escapeHtml(event.description || '')}</div>
    `;
    list.appendChild(item);
  });
}

function renderMatchStats(match) {
  const ph = document.getElementById('stat-possession-home'); if (ph) ph.value = match.stats?.possession?.home ?? '';
  const pa = document.getElementById('stat-possession-away'); if (pa) pa.value = match.stats?.possession?.away ?? '';
  const sh = document.getElementById('stat-shots-home'); if (sh) sh.value = match.stats?.shots?.home ?? '';
  const sa = document.getElementById('stat-shots-away'); if (sa) sa.value = match.stats?.shots?.away ?? '';
  const ch = document.getElementById('stat-corners-home'); if (ch) ch.value = match.stats?.corners?.home ?? '';
  const ca = document.getElementById('stat-corners-away'); if (ca) ca.value = match.stats?.corners?.away ?? '';
}

function showSuccess(message) {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.className = 'alert alert-success';
  box.textContent = '✓ ' + message;
  box.classList.remove('d-none');
  setTimeout(() => box.classList.add('d-none'), 3500);
}

function showError(message) {
  const box = document.getElementById('alert-box');
  if (!box) return;
  box.className = 'alert alert-danger';
  box.textContent = '✕ ' + message;
  box.classList.remove('d-none');
  setTimeout(() => box.classList.add('d-none'), 4000);
}

function editTournament(tourId) {
  showError('Edit tournament feature coming soon.');
}

function deleteTournament(tourId) {
  if (!confirm('Delete this tournament? This cannot be undone.')) return;
  tournamentsData.tournaments = tournamentsData.tournaments.filter(t => t.id !== tourId);
  saveDraftChanges();
  loadTournamentsData();
  showSuccess('Tournament deleted.');
}
