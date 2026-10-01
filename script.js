// ==========================================
// 1. CONFIG & METADATA
// ==========================================
const NAME_FIELD = 'AREA_NAME';

const METRICS = {
  density_benches: {
    label: '# per sq km',
    unit: '',
    colors: ['#FFEDA0', '#FEB24C', '#FD8D3C', '#E31A1C', '#800026']
  },
  density_pee: {
    label: '# per sq km',
    unit: '',
    colors: ['#edf8fb', '#99d8c9', '#66c2a4', '#238b45', '#005824']
  },
  density_poi: {
    label: '# per sq km',
    unit: '',
    colors: ['#fef0d9', '#fdbb84', '#fc8d59', '#b30000', '#7f0000']
  }
};

// Global Application State
let currentMetric = 'density_benches';
let currentGrades = [];
let geojsonLayer = null;
let geojsonDataStore = null;

// ==========================================
// 2. MAP INITIALIZATION
// ==========================================
const map = L.map('map').setView([43.70, -79.42], 11);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19
}).addTo(map);

const controlPanel = L.control({ position: 'topleft' });

controlPanel.onAdd = function (map) {
  // Select the existing control-panel element or create it dynamically
  const div = L.DomUtil.get('control-panel') || L.DomUtil.create('div', '', 'control-panel');

  // Disable map drag/zoom when interacting with the control panel elements
  L.DomEvent.disableClickPropagation(div);
  L.DomEvent.disableScrollPropagation(div);

  return div;
};

// Add the control to the map
controlPanel.addTo(map);

L.control.scale({
  imperial: false,  // Disables miles/feet
  metric: true,     // Enables kilometers/meters
  maxWidth: 150,    // Adjusts bar width in pixels
  position: 'bottomleft'
}).addTo(map);

// ==========================================
// 3. DYNAMIC SCALE CALCULATIONS
// ==========================================
function calculateDynamicGrades(geojsonData, metricKey, steps) {
  if (!geojsonData || !geojsonData.features) return [];

  const values = geojsonData.features
    .map(f => f.properties[metricKey])
    .filter(val => typeof val === 'number' && !isNaN(val));

  if (values.length === 0) return [0];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const interval = (max - min) / steps;
  const grades = [];

  for (let i = 0; i < steps; i++) {
    const rawVal = min + i * interval;
    grades.push(Math.round(rawVal));
  }

  return grades;
}

function updateActiveMetricScale() {
  if (!geojsonDataStore) return;
  const numColors = METRICS[currentMetric].colors.length;
  currentGrades = calculateDynamicGrades(geojsonDataStore, currentMetric, numColors);
}

// ==========================================
// 4. MAP STYLING & INTERACTION HANDLERS
// ==========================================
function getColor(value, metricKey) {
  const config = METRICS[metricKey];
  if (!config || currentGrades.length === 0) return '#ccc';

  for (let i = currentGrades.length - 1; i >= 0; i--) {
    if (value >= currentGrades[i]) return config.colors[i];
  }
  return config.colors[0];
}

function style(feature) {
  return {
    fillColor: getColor(feature.properties[currentMetric], currentMetric),
    weight: 1,
    opacity: 1,
    color: '#ffffff',
    fillOpacity: 0.7
  };
}

function getTooltipContent(props) {
  const config = METRICS[currentMetric];
  const val = props?.[currentMetric];
  const formattedVal = val !== undefined ? Math.floor(val).toLocaleString() : 'No data';

  return `
    <div style="font-family: sans-serif; min-width: 140px;">
      <h4 style="margin: 0 0 4px 0; font-size: 14px; color: #333;">${props[NAME_FIELD] || 'Unknown'}</h4>
      <span style="font-size: 12px; color: #555;"><b>${config.label}:</b> ${formattedVal} ${config.unit}</span>
    </div>
  `;
}

function highlightFeature(e) {
  const layer = e.target;
  layer.setStyle({
    weight: 1.5,
    color: '#bab8b8',
    fillOpacity: 0.9
  });
  layer.bringToFront();

  // Dynamically refresh tooltip content on feature hover
  const content = getTooltipContent(layer.feature.properties);
  layer.setTooltipContent(content);
}

function resetHighlight(e) {
  if (geojsonLayer) geojsonLayer.resetStyle(e.target);
}

function onEachFeature(feature, layer) {
  // Bind standard sticky tooltip to follow mouse smoothly on hover
  layer.bindTooltip('', {
    sticky: true,
    direction: 'auto',
    offset: [10, -10],
    className: 'hover-tooltip'
  });

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight
  });
}

// ==========================================
// 5. MAP UI CONTROLS (LEGEND)
// ==========================================
const legend = L.control({ position: 'topright' });

legend.onAdd = function () {
  this._div = L.DomUtil.create('div', 'info legend');
  this.update();
  return this._div;
};

legend.update = function () {
  const { label, unit, colors } = METRICS[currentMetric];
  let html = `<b>${label} ${unit}</b><br>`;

  for (let i = 0; i < currentGrades.length; i++) {
    const from = currentGrades[i];
    const to = currentGrades[i + 1];
    html += `<i style="background:${colors[i]}"></i> ${from}${to ? ` &ndash; ${to}<br>` : '+'}`;
  }

  this._div.innerHTML = html;
};

legend.addTo(map);

// ==========================================
// 6. DATA FETCH & EVENT LISTENERS
// ==========================================
fetch('my_data.geojson')
  .then(res => res.json())
  .then(data => {
    geojsonDataStore = data;
    updateActiveMetricScale();
    geojsonLayer = L.geoJSON(data, { style, onEachFeature }).addTo(map);
    map.fitBounds(geojsonLayer.getBounds());
    legend.update();
  })
  .catch(err => console.error('Error loading GeoJSON:', err));

document.querySelectorAll('input[name="metric"]').forEach(checkbox => {
  checkbox.addEventListener('change', function () {
    if (this.checked) {
      document.querySelectorAll('input[name="metric"]').forEach(cb => {
        if (cb !== this) cb.checked = false;
      });

      currentMetric = this.value;
      updateActiveMetricScale();

      if (geojsonLayer) {
        geojsonLayer.setStyle(style);
        geojsonLayer.eachLayer(layer => {
          layer.setTooltipContent(getTooltipContent(layer.feature.properties));
        });
      }

      legend.update();
    } else {
      this.checked = true;
    }
  });
});
