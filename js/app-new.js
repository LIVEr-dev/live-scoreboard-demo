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
    loadTournamentsData();
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
  document.getElementById('tournament-select').value = tournamentId;
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

  if (!tournamentsData.tournaments || tournamentsData.tournaments.length === 0) {
    emptyCard.classList.remove('d-none');
  } else {
    emptyCard.classList.add('d-none');
  }

  if (currentTournament) {
    document.getElementById('league-title').textContent = `${currentTournament.name} — ${currentTournament.sport.toUpperCase()}`;
  } else {
    document.getElementById('league-title').textContent = 'No tournaments yet';
  }
}

function renderDivisionTabs() {
  const container = document.getElementById('divisions-tabs');
  container.innerHTML = '';

  if (!currentTournament.divisions || currentTournament.divisions.length === 0) return;

  currentTournament.divisions.forEach(div => {
    const btn = document.createElement('button');
    btn.className = 'league-tab' + (currentDivision.id === div.id ? ' active' : '');
    btn.setAttribute('data-division', div.id);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', currentDivision.id === div.id);
    btn.textContent = div.name;
    btn.addEventListener('click', () => switchDivision(div.id));
    container.appendChild(btn);
  });
}

function switchDivision(divisionId) {
  const division = currentTournament.divisions?.find(d => d.id === divisionId);
  if (!division) return;

  currentDivision = division;
  renderTournamentUI();
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
    document.getElementById('admin-section').style.display = 'block';
    document.getElementById('admin-login-section').classList.add('d-none');
    document.getElementById('admin-panel').classList.remove('d-none');
    showAdminPanel();
    showSuccess('Admin access granted.');
  } else {
    showError('Incorrect password. Please try again.');
    document.getElementById('admin-password').value = '';
  }
}

function handleAdminLogout() {
  adminLoggedIn = false;
  document.getElementById('admin-panel').classList.add('d-none');
  document.getElementById('admin-login-section').classList.remove('d-none');
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-section').style.display = 'none';
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
  tourSelect.innerHTML = '<option value="">— Select Tournament —</option>';
  tournamentsData.tournaments?.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    tourSelect.appendChild(opt);
  });

  // Tournament selector for scores
  const scoreSelect = document.getElementById('tournament-for-scores');
  scoreSelect.innerHTML = '<option value="">— Select Tournament —</option>';
  tournamentsData.tournaments?.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.name;
    scoreSelect.appendChild(opt);
  });
}

function populateTournamentsListUI() {
  const container = document.getElementById('tournaments-list-container');
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
// (unchanged wiring)
// ============================================================

// ... rest of file unchanged (omitted here for brevity) ...
