/**
 * HUNTPRO 3D - PWA Core Logic
 * Architecture modulaire pour application SaaS
 */

// ==========================================
// 1. ÉTAT GLOBAL & DONNÉES SIMULÉES
// ==========================================
const AppState = {
  hunterPosition: [-71.208, 46.813], // Position par défaut (Sera mise à jour par GPS ou Waypoint)
  is3D: true,
  currentLayer: 'sat',
  windDir: 270,
  windSpeed: 15
};

// Données météo/solunaires sur 24h
const WeatherData = Array.from({length: 24}, (_, i) => ({
  hour: `${i.toString().padStart(2, '0')}:00`,
  activity: [15, 10, 10, 20, 45, 85, 95, 60, 30, 20, 15, 25, 30, 20, 15, 35, 65, 90, 80, 40, 20, 15, 10, 10][i],
  windDir: [270, 270, 280, 290, 300, 310, 320, 330, 340, 350, 0, 10, 45, 90, 120, 150, 180, 180, 190, 200, 220, 250, 260, 270][i],
  windSpeed: [8, 7, 6, 6, 8, 12, 15, 18, 20, 22, 20, 18, 15, 12, 10, 9, 8, 10, 12, 11, 9, 8, 8, 7][i]
}));

// ==========================================
// 2. INITIALISATION CARTE MAPLIBRE
// ==========================================
const map = new maplibregl.Map({
  container: 'map',
  center: AppState.hunterPosition,
  zoom: 13,
  pitch: 65, // Vue 3D par défaut
  bearing: -20,
  maxPitch: 85, // Essentiel pour la vue rasante style OnX
  style: {
    version: 8,
    sources: {
      // Source Satellite (Esri World Imagery - Gratuit pour l'usage basique)
      'sat-source': {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256
      },
      // Source Topo (OpenTopoMap)
      'topo-source': {
        type: 'raster',
        tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256
      },
      // Source 3D DEM (Modèle d'élévation AWS)
      'terrain-dem': {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256
      }
    },
    layers: [
      { id: 'sat-layer', type: 'raster', source: 'sat-source', layout: { visibility: 'visible' } },
      { id: 'topo-layer', type: 'raster', source: 'topo-source', layout: { visibility: 'none' } }
    ],
    terrain: { source: 'terrain-dem', exaggeration: 1.5 }
  }
});

// Marqueur Principal (Le Mirador / La position de chasse)
let hunterMarker = new maplibregl.Marker({ color: '#ff9800' }).setLngLat(AppState.hunterPosition).addTo(map);

// ==========================================
// 3. INTÉGRATION DES OUTILS PRO
// ==========================================
map.on('load', () => {

  // --- A. LE BOUTON GPS PRO ---
  // Ajoute le contrôle de géolocalisation natif dans notre panneau latéral
  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true // Oriente la boussole avec le téléphone
  });
  document.querySelector('.tool-panel').appendChild(geolocate.onAdd(map));

  // --- B. LA ZONE DE SUCCÈS (COUPES FORESTIÈRES SIMULÉES) ---
  // En prod, ceci viendrait d'un serveur SIG (GeoServer)
  map.addSource('forestry-source', {
    type: 'geojson',
    data: turf.buffer(turf.point([-71.21, 46.815]), 0.5, {units: 'kilometers'}) // Zone circulaire exemple
  });
  map.addLayer({
    id: 'forestry-layer',
    type: 'fill',
    source: 'forestry-source',
    layout: { visibility: 'none' },
    paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.3, 'fill-outline-color': '#16a34a' }
  });

  // --- C. LE CÔNE DE VENT (SCENT CONE) ---
  map.addSource('scent-cone', { type: 'geojson', data: turf.featureCollection([]) });
  map.addLayer({
    id: 'scent-cone-layer',
    type: 'fill',
    source: 'scent-cone',
    paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.45, 'fill-outline-color': '#991b1b' }
  });

  // Initier le premier rendu du vent
  renderScentCone();
});

// ==========================================
// 4. MOTEUR GÉOMÉTRIQUE (TURF.JS)
// ==========================================
function renderScentCone() {
  if (!map.getSource('scent-cone')) return;

  // L'odeur voyage dans la direction où le vent souffle
  const scentDirection = (AppState.windDir + 180) % 360;
  
  // La longueur du cône dépend de la vitesse du vent (km/h)
  const distanceKm = Math.min(0.2 + (AppState.windSpeed * 0.02), 1.5); 
  const coneWidthDegrees = 45; // Plus le vent est fort, plus on pourrait rétrécir l'angle

  const p1 = turf.destination(AppState.hunterPosition, distanceKm, scentDirection - (coneWidthDegrees / 2), {units: 'kilometers'}).geometry.coordinates;
  const p2 = turf.destination(AppState.hunterPosition, distanceKm, scentDirection + (coneWidthDegrees / 2), {units: 'kilometers'}).geometry.coordinates;

  const polygon = turf.polygon([[AppState.hunterPosition, p1, p2, AppState.hunterPosition]]);
  map.getSource('scent-cone').setData(polygon);
}

// Déplacer le marqueur au clic (Waypoint dynamique)
map.on('click', (e) => {
  AppState.hunterPosition = [e.lngLat.lng, e.lngLat.lat];
  hunterMarker.setLngLat(AppState.hunterPosition);
  renderScentCone();
});

// ==========================================
// 5. GESTIONNAIRE D'INTERFACE (UI & LAYERS)
// ==========================================
document.getElementById('btn-layer-sat').onclick = (e) => switchLayer('sat', e.target);
document.getElementById('btn-layer-topo').onclick = (e) => switchLayer('topo', e.target);
document.getElementById('btn-layer-forestry').onclick = (e) => {
  e.target.classList.toggle('active');
  const vis = map.getLayoutProperty('forestry-layer', 'visibility');
  map.setLayoutProperty('forestry-layer', 'visibility', vis === 'none' ? 'visible' : 'none');
};

document.getElementById('btn-3d').onclick = (e) => {
  AppState.is3D = !AppState.is3D;
  e.target.classList.toggle('active', AppState.is3D);
  map.easeTo({ pitch: AppState.is3D ? 65 : 0, duration: 1000 });
};

function switchLayer(type, btnElement) {
  document.getElementById('btn-layer-sat').classList.remove('active');
  document.getElementById('btn-layer-topo').classList.remove('active');
  btnElement.classList.add('active');

  if (type === 'sat') {
    map.setLayoutProperty('sat-layer', 'visibility', 'visible');
    map.setLayoutProperty('topo-layer', 'visibility', 'none');
  } else {
    map.setLayoutProperty('sat-layer', 'visibility', 'none');
    map.setLayoutProperty('topo-layer', 'visibility', 'visible');
  }
}

// ==========================================
// 6. GRAPHIQUE 24H & SYNCHRONISATION (CHART.JS)
// ==========================================
const ctx = document.getElementById('huntingChart').getContext('2d');

Chart.defaults.color = '#94a3b8';
const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: WeatherData.map(d => d.hour),
    datasets: [
      {
        label: 'Activité (%)',
        data: WeatherData.map(d => d.activity),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        fill: true,
        tension: 0.4,
        yAxisID: 'yAct'
      },
      {
        label: 'Vent (km/h)',
        data: WeatherData.map(d => d.windSpeed),
        borderColor: '#3b82f6',
        borderDash: [5, 5],
        fill: false,
        tension: 0.2,
        yAxisID: 'yWind'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' } },
      yAct: { min: 0, max: 100, display: false },
      yWind: { min: 0, max: 40, display: false }
    },
    plugins: { legend: { display: false } },
    
    // LA MAGIE OPÈRE ICI : Synchro Carte <-> Graphique
    onHover: (event, activeElements) => {
      if (activeElements.length > 0) {
        const index = activeElements[0].index;
        const data = WeatherData[index];

        // Mettre à jour l'UI Texte
        document.getElementById('ui-time').innerText = data.hour;
        document.getElementById('ui-act').innerText = `${data.activity}%`;
        document.getElementById('ui-wind').innerText = `${data.windDir}° | ${data.windSpeed} km/h`;

        // Mettre à jour l'état global et redessiner la carte
        AppState.windDir = data.windDir;
        AppState.windSpeed = data.windSpeed;
        renderScentCone();
      }
    }
  }
});