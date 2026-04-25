/* global L */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1';

const els = {
  locateBtn: document.getElementById('locate-btn'),
  radiusSel: document.getElementById('radius'),
  status: document.getElementById('status'),
  results: document.getElementById('results'),
  resultsCount: document.getElementById('results-count'),
  routeInfo: document.getElementById('route-info'),
  routeName: document.getElementById('route-name'),
  routeDistance: document.getElementById('route-distance'),
  routeDuration: document.getElementById('route-duration'),
  routeExternal: document.getElementById('route-external'),
  clearRouteBtn: document.getElementById('clear-route'),
  toast: document.getElementById('toast'),
};

const state = {
  map: null,
  userMarker: null,
  userAccuracyCircle: null,
  shopMarkers: new Map(),
  shops: [],
  userLatLng: null,
  routeLayer: null,
  activeShopId: null,
};

function showToast(message, ms = 2400) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove('show'), ms);
}

function setStatus(html, { error = false } = {}) {
  els.status.classList.toggle('error', error);
  els.status.innerHTML = html;
}

function clearStatus() {
  els.status.innerHTML = '';
}

function initMap() {
  state.map = L.map('map', {
    zoomControl: true,
    worldCopyJump: true,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map);
}

function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
}

function placeUserMarker(latlng, accuracy) {
  if (state.userMarker) state.map.removeLayer(state.userMarker);
  if (state.userAccuracyCircle) state.map.removeLayer(state.userAccuracyCircle);

  const icon = L.divIcon({
    className: '',
    html: '<div class="user-marker" title="You are here"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });

  state.userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 })
    .addTo(state.map)
    .bindPopup('You are here');

  if (accuracy && accuracy < 2000) {
    state.userAccuracyCircle = L.circle(latlng, {
      radius: accuracy,
      color: '#2563eb',
      weight: 1,
      opacity: 0.5,
      fillColor: '#2563eb',
      fillOpacity: 0.08,
    }).addTo(state.map);
  }
}

async function searchCoffeeShops(lat, lon, radius) {
  // Overpass QL: cafés, coffee shops, and bakeries with cuisine=coffee, around the user.
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="cafe"](around:${radius},${lat},${lon});
      way["amenity"="cafe"](around:${radius},${lat},${lon});
      node["shop"="coffee"](around:${radius},${lat},${lon});
      way["shop"="coffee"](around:${radius},${lat},${lon});
      node["cuisine"="coffee_shop"](around:${radius},${lat},${lon});
    );
    out center tags 60;
  `.trim();

  const body = 'data=' + encodeURIComponent(query);
  let lastErr;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
      const data = await res.json();
      return parseOverpass(data, lat, lon);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Unable to reach the coffee directory.');
}

function parseOverpass(data, userLat, userLon) {
  const elements = Array.isArray(data?.elements) ? data.elements : [];
  const shops = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;

    const name = tags.name || tags['name:en'] || tags.brand || 'Unnamed café';
    const distance = haversineMeters(userLat, userLon, lat, lon);

    shops.push({
      id: `${el.type}/${el.id}`,
      name,
      lat,
      lon,
      distance,
      address: composeAddress(tags),
      brand: tags.brand,
      openingHours: tags.opening_hours,
      website: tags.website || tags['contact:website'],
      phone: tags.phone || tags['contact:phone'],
      cuisine: tags.cuisine,
    });
  }
  shops.sort((a, b) => a.distance - b.distance);
  // Cap to a sensible number for performance.
  return shops.slice(0, 60);
}

function composeAddress(tags) {
  const parts = [
    [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' '),
    tags['addr:city'],
  ].filter(Boolean);
  return parts.join(', ');
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 2 : 1)} km`;
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function renderResults() {
  els.results.innerHTML = '';
  els.resultsCount.textContent = state.shops.length
    ? `${state.shops.length} found`
    : '';

  if (!state.shops.length) {
    setStatus(
      `<p class="status-msg">No coffee spots found within this radius. Try expanding the search.</p>`
    );
    return;
  }
  clearStatus();

  const frag = document.createDocumentFragment();
  state.shops.forEach((shop, idx) => {
    const li = document.createElement('li');
    li.className = 'result';
    li.dataset.id = shop.id;
    if (state.activeShopId === shop.id) li.classList.add('active');

    const meta = [
      formatDistance(shop.distance),
      shop.address,
      shop.openingHours,
    ]
      .filter(Boolean)
      .map((m, i) => (i === 0 ? `<span>${escapeHtml(m)}</span>` : `<span class="dot">•</span><span>${escapeHtml(m)}</span>`))
      .join('');

    li.innerHTML = `
      <div class="result-pin">${idx + 1}</div>
      <div class="result-body">
        <p class="result-name">${escapeHtml(shop.name)}</p>
        <div class="result-meta">${meta}</div>
        <div class="result-actions">
          <button class="btn ghost small" data-action="directions">Directions</button>
          <button class="btn ghost small" data-action="focus">Show on map</button>
        </div>
      </div>
    `;
    frag.appendChild(li);
  });
  els.results.appendChild(frag);
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function renderShopMarkers() {
  // Clear existing.
  for (const m of state.shopMarkers.values()) state.map.removeLayer(m);
  state.shopMarkers.clear();

  state.shops.forEach((shop, idx) => {
    const icon = makeShopIcon(idx + 1, shop.id === state.activeShopId);
    const marker = L.marker([shop.lat, shop.lon], { icon }).addTo(state.map);
    marker.bindPopup(buildPopupHTML(shop));
    marker.on('click', () => selectShop(shop.id, { pan: false }));
    marker.on('popupopen', () => bindPopupActions(marker, shop));
    state.shopMarkers.set(shop.id, marker);
  });

  if (state.shops.length && state.userLatLng) {
    const points = [
      [state.userLatLng.lat, state.userLatLng.lng],
      ...state.shops.slice(0, 20).map((s) => [s.lat, s.lon]),
    ];
    state.map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }
}

function makeShopIcon(label, isActive) {
  return L.divIcon({
    className: '',
    html: `<div class="coffee-marker${isActive ? ' active' : ''}"><span>${label}</span></div>`,
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -34],
  });
}

function buildPopupHTML(shop) {
  const meta = [shop.address, shop.openingHours].filter(Boolean).join(' • ');
  return `
    <div>
      <div class="pop-name">${escapeHtml(shop.name)}</div>
      <div class="pop-meta">${escapeHtml(formatDistance(shop.distance))}${meta ? ' • ' + escapeHtml(meta) : ''}</div>
      <div class="pop-actions">
        <button data-pop-action="directions">Directions</button>
        ${shop.website ? `<a class="external-link" href="${escapeHtml(shop.website)}" target="_blank" rel="noopener">Website</a>` : ''}
      </div>
    </div>
  `;
}

function bindPopupActions(marker, shop) {
  const popupEl = marker.getPopup().getElement();
  if (!popupEl) return;
  const btn = popupEl.querySelector('[data-pop-action="directions"]');
  if (btn) {
    btn.addEventListener('click', () => {
      drawDirections(shop);
    }, { once: true });
  }
}

function selectShop(id, { pan = true } = {}) {
  state.activeShopId = id;
  // Update marker icons.
  state.shops.forEach((shop, idx) => {
    const m = state.shopMarkers.get(shop.id);
    if (m) m.setIcon(makeShopIcon(idx + 1, shop.id === id));
  });

  // Update list active state.
  els.results.querySelectorAll('.result').forEach((li) => {
    li.classList.toggle('active', li.dataset.id === id);
  });

  const shop = state.shops.find((s) => s.id === id);
  if (!shop) return;
  const marker = state.shopMarkers.get(id);
  if (pan) state.map.setView([shop.lat, shop.lon], Math.max(state.map.getZoom(), 16), { animate: true });
  if (marker) marker.openPopup();

  const li = els.results.querySelector(`.result[data-id="${cssEscape(id)}"]`);
  if (li) li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}

async function drawDirections(shop) {
  if (!state.userLatLng) {
    showToast('Locate yourself first to get directions.');
    return;
  }
  selectShop(shop.id, { pan: false });

  const { lat, lng } = state.userLatLng;
  const url = `${OSRM_ENDPOINT}/foot/${lng},${lat};${shop.lon},${shop.lat}?overview=full&geometries=geojson&steps=false`;

  showToast('Finding the best route…');
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Routing failed (${res.status})`);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('No route returned.');

    if (state.routeLayer) state.map.removeLayer(state.routeLayer);
    state.routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#2563eb', weight: 5, opacity: 0.85, lineCap: 'round' },
    }).addTo(state.map);

    state.map.fitBounds(state.routeLayer.getBounds(), { padding: [60, 60] });

    els.routeInfo.hidden = false;
    els.routeName.textContent = `Walking to ${shop.name}`;
    els.routeDistance.textContent = formatDistance(route.distance);
    els.routeDuration.textContent = formatDuration(route.duration);
    els.routeExternal.href = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${shop.lat},${shop.lon}&travelmode=walking`;
  } catch (err) {
    console.error(err);
    showToast('Could not draw a route. Opening external maps.');
    const fallback = `https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}&destination=${shop.lat},${shop.lon}&travelmode=walking`;
    window.open(fallback, '_blank', 'noopener');
  }
}

function clearRoute() {
  if (state.routeLayer) {
    state.map.removeLayer(state.routeLayer);
    state.routeLayer = null;
  }
  els.routeInfo.hidden = true;
}

async function findCoffee() {
  els.locateBtn.disabled = true;
  setStatus(`<p class="status-msg">Locating you…</p>`);
  els.results.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
  els.resultsCount.textContent = '';

  try {
    const pos = await getUserLocation();
    const { latitude: lat, longitude: lon, accuracy } = pos.coords;
    state.userLatLng = L.latLng(lat, lon);
    placeUserMarker(state.userLatLng, accuracy);
    state.map.setView(state.userLatLng, 15);

    setStatus(`<p class="status-msg">Brewing nearby results…</p>`);
    const radius = parseInt(els.radiusSel.value, 10) || 1000;
    const shops = await searchCoffeeShops(lat, lon, radius);
    state.shops = shops;
    state.activeShopId = null;
    clearRoute();
    renderShopMarkers();
    renderResults();

    if (shops.length === 0) {
      showToast('No coffee shops found in this radius.');
    } else {
      showToast(`Found ${shops.length} coffee spot${shops.length === 1 ? '' : 's'} nearby.`);
    }
  } catch (err) {
    console.error(err);
    els.results.innerHTML = '';
    els.resultsCount.textContent = '';
    let message = 'Something went wrong. Please try again.';
    if (err && typeof err === 'object' && 'code' in err) {
      // GeolocationPositionError
      if (err.code === 1) message = 'Location permission denied. Enable it in your browser settings.';
      else if (err.code === 2) message = 'We couldn\'t determine your location. Try again outdoors or check your connection.';
      else if (err.code === 3) message = 'Locating you took too long. Please retry.';
    } else if (err && err.message) {
      message = err.message;
    }
    setStatus(`<p class="status-msg">${escapeHtml(message)}</p>`, { error: true });
  } finally {
    els.locateBtn.disabled = false;
  }
}

function bindEvents() {
  els.locateBtn.addEventListener('click', findCoffee);
  els.clearRouteBtn.addEventListener('click', clearRoute);

  els.radiusSel.addEventListener('change', () => {
    if (state.userLatLng) findCoffee();
  });

  els.results.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    const li = e.target.closest('.result');
    if (!li) return;
    const id = li.dataset.id;
    const shop = state.shops.find((s) => s.id === id);
    if (!shop) return;

    if (action && action.dataset.action === 'directions') {
      e.stopPropagation();
      drawDirections(shop);
      return;
    }
    if (action && action.dataset.action === 'focus') {
      e.stopPropagation();
      selectShop(id, { pan: true });
      return;
    }
    selectShop(id, { pan: true });
  });
}

initMap();
bindEvents();
