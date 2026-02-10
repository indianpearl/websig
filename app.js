// --- Mapa e camadas (mantido) ---
    const MAP_CENTER = [-25.9653, 32.5892];
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' });
    const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' });
    const map = L.map('map', { preferCanvas: true, layers: [osm] }).setView(MAP_CENTER, 13);
    L.control.layers({ "OpenStreetMap": osm, "ESRI World Imagery": esri }, null, { collapsed: false }).addTo(map);

    const ecopontosLayer = L.geoJSON(null, { pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:6, fill:true, fillOpacity:1, weight:1, color:'#fff' }) }).addTo(map);
    const routesLayer = L.geoJSON(null, { style: f => ({ color: f.properties && f.properties.color ? f.properties.color : '#333', weight:4, opacity:0.9 }) }).addTo(map);

    // UI refs
    const fileInput = document.getElementById('fileInput');
    const generateBtn = document.getElementById('generateBtn');
    const startOpBtn = document.getElementById('startOpBtn');
    const abortOpBtn = document.getElementById('abortOpBtn');
    const stopBtn = document.getElementById('stopBtn');
    const exportBtn = document.getElementById('exportBtn');
    const statusText = document.getElementById('statusText');
    const logEl = document.getElementById('log');
    const orsKeyEl = document.getElementById('orsKey');
    const orsProfileEl = document.getElementById('orsProfile');
    const depotLatEl = document.getElementById('depotLat');
    const depotLonEl = document.getElementById('depotLon');
    const delayMsEl = document.getElementById('delayMs');
    const fullThresholdEl = document.getElementById('fullThreshold');
    const thresholdLabel = document.getElementById('thresholdLabel');
    const stateSelect = document.getElementById('stateSelect');
    const statesBox = document.getElementById('statesBox');
    const codeSearchEl = document.getElementById('codeSearch');
    const toggleEcopontos = document.getElementById('toggleEcopontos');
    const toggleRotas = document.getElementById('toggleRotas');
    const activeVehiclesEl = document.getElementById('activeVehicles');

    const sumRoutesEl = document.getElementById('sumRoutes');
    const sumDistEl = document.getElementById('sumDist');
    const sumDurEl = document.getElementById('sumDur');

    const countEls = { plastico: document.getElementById('count_plastico'), papel: document.getElementById('count_papel'), metal: document.getElementById('count_metal'), vidro: document.getElementById('count_vidro'), indiferenciado: document.getElementById('count_indiferenciado') };

    const CATEGORY_COLOR = { plastico:'#1f77b4', papel:'#2ca02c', metal:'#d62728', vidro:'#9467bd', indiferenciado:'#7f7f7f' };

    function mapToCategory(tipoRaw) {
      if (!tipoRaw) return 'indiferenciado';
      const s = String(tipoRaw).trim().toLowerCase();
      if (['plastico','plástico','plastic'].some(k=>s.includes(k))) return 'plastico';
      if (['papel','paper'].some(k=>s.includes(k))) return 'papel';
      if (['metal','metais'].some(k=>s.includes(k))) return 'metal';
      if (['vidro','glass'].some(k=>s.includes(k))) return 'vidro';
      return 'indiferenciado';
    }

    // estado interno
    let lastGeoJSON = null;
    let routesFeatures = [];
    let stopRequested = false;
    let colorIndex = 0;
    let idCounter = 1;

    function nextRouteColor(){ const hue=(colorIndex*47)%360; colorIndex++; return `hsl(${hue} 70% 45%)`; }
    function makeRouteId(){ try{ if(window.crypto && crypto.randomUUID) return crypto.randomUUID(); }catch(e){} return 'route-'+(Date.now())+'-'+(idCounter++); }
    function log(msg){ const p=document.createElement('div'); p.textContent=msg; logEl.appendChild(p); logEl.scrollTop=logEl.scrollHeight; }
    function setStatus(s){ statusText.textContent=s; }

    // --- Veículos: criar 30 viaturas ---
// --- Veículos: criar 30 viaturas ---
const VEHICLE_COUNT = 30;
const vehicles = []; // {id, code, plate, brand, model, capacity, state, marker, assignedEcopoints:[], busy}
const vehicleMarkersLayer = L.layerGroup().addTo(map); // assume 'map' e 'MAP_CENTER' definidos

function randomPlate() {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const nums = () => Math.floor(1000 + Math.random() * 9000);
  return letters.charAt(Math.floor(Math.random() * 26)) +
         letters.charAt(Math.floor(Math.random() * 26)) +
         '-' + nums();
}

function randomBrandModel() {
  const brands = [
    ['Volvo', 'FMX'],
    ['Mercedes', 'Arocs'],
    ['Scania', 'P-series'],
    ['Iveco', 'Stralis'],
    ['MAN', 'TGS'],
    ['Renault', 'C-Series']
  ];
  return brands[Math.floor(Math.random() * brands.length)];
}

function randomCapacity() {
  return [6, 8, 10, 12, 14, 16][Math.floor(Math.random() * 6)]; // m3
}

// Corrige a lógica de estado usando thresholds
function pickRandomState() {
  const r = Math.random(); // 0 <= r < 1
  if (r < 0.70) return 'operacional';
  if (r < 0.90) return 'manutenção';
  return 'inoperacional';
}

// Ícone de camião SVG válido e seguro
function truckIcon(color = '#2b7') {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="24" viewBox="0 0 36 24" role="img" aria-label="truck">
      <rect x="1" y="6" width="22" height="12" rx="2" fill="${color}" stroke="#fff" stroke-width="1"/>
      <rect x="23" y="10" width="10" height="8" rx="1" fill="${color}" stroke="#fff" stroke-width="1"/>
      <circle cx="9" cy="20" r="2" fill="#333"/>
      <circle cx="27" cy="20" r="2" fill="#333"/>
    </svg>
  `.trim();
  const encoded = encodeURIComponent(svg);
  return L.icon({
    iconUrl: 'data:image/svg+xml;charset=utf-8,' + encoded,
    iconSize: [28, 20],
    iconAnchor: [14, 10],
    popupAnchor: [0, -10]
  });
}

// Cria a lista de veículos
function createVehicles() {
  vehicles.length = 0;

  for (let i = 0; i < VEHICLE_COUNT; i++) {
    const [brand, model] = randomBrandModel();
    const state = pickRandomState();
    const active = state === 'operacional';

    const v = {
      id: 'V' + String(i + 1).padStart(2, '0'),
      code: 'VEH' + String(i + 1).padStart(3, '0'),
      plate: randomPlate(),
      brand,
      model,
      capacity: randomCapacity(),
      state,
      active,
      marker: null,
      assignedEcopoints: [],
      busy: false
    };

    vehicles.push(v);
  }

  // Atualiza UI e marcadores
  renderVehicleList();
  updateVehicleCounter();
  createVehicleMarkers();
}

// Cria ou recria marcadores de veículos no mapa
function createVehicleMarkers() {
  // Limpa camada e recria marcadores para refletir o estado atual
  vehicleMarkersLayer.clearLayers();

  vehicles.forEach(v => {
    // Se já existir um marker e quisermos manter posição, podemos reutilizar
    // Aqui criamos sempre um novo marker para simplificar sincronização
    const lat = MAP_CENTER[0] + (Math.random() - 0.5) * 0.02;
    const lng = MAP_CENTER[1] + (Math.random() - 0.5) * 0.02;

    const marker = L.marker([lat, lng], {
      title: `${v.code} | ${v.plate}`,
      icon: truckIcon(v.active ? '#2b7' : '#ccc')
    });

    marker.bindPopup(`<strong>${v.code}</strong><br>${v.brand} ${v.model}<br>${v.plate}<br>Capacidade ${v.capacity} m³<br>Estado: ${v.state}`);

    v.marker = marker;

    if (v.active) {
      marker.addTo(vehicleMarkersLayer);
    }
  });
}

// Atualiza contador de veículos ativos e total
function updateVehicleCounter() {
  if (!activeVehiclesEl) return;
  const active = vehicles.filter(v => v.active).length;
  const total = vehicles.length;
  activeVehiclesEl.textContent = `${active} / ${total}`;
}

// Renderiza lista de veículos no DOM e loga
function renderVehicleList() {
  const activeCount = vehicles.filter(v => v.state === 'operacional').length;
  updateVehicleCounter();
  log(`Criadas ${vehicles.length} viaturas (${activeCount} operacionais).`);
  // Se tiver uma lista visual, aqui pode-se popular o DOM com DocumentFragment
}

// Exemplo de função para alternar estado de um veículo e atualizar UI
function setVehicleActive(vehicleId, makeActive) {
  const v = vehicles.find(x => x.id === vehicleId);
  if (!v) return;
  v.active = !!makeActive;
  v.state = v.active ? 'operacional' : 'inoperacional';
  // Atualiza marcador no mapa
  if (v.marker) {
    if (v.active) {
      v.marker.setIcon(truckIcon('#2b7'));
      v.marker.addTo(vehicleMarkersLayer);
    } else {
      v.marker.setIcon(truckIcon('#ccc'));
      vehicleMarkersLayer.removeLayer(v.marker);
    }
  }
  updateVehicleCounter();
  renderVehicleList();
}

// Inicialização
createVehicles();
    // --- Estado por limiar e anotações (mantido) ---
    const EMPTY_THRESHOLD_DEFAULT = 20;
    function parseNivel(props) {
      if (!props) return null;
      if (typeof props.nivel === 'number') return props.nivel;
      if (typeof props.nivel === 'string') {
        const n = parseFloat(props.nivel.replace('%','').trim());
        if (!isNaN(n)) return n;
      }
      if (typeof props.fill_level === 'number') return props.fill_level;
      if (typeof props.fill_level === 'string') {
        const n = parseFloat(props.fill_level.replace('%','').trim());
        if (!isNaN(n)) return n;
      }
      return null;
    }
    function isFullFromProps(props) {
      if (!props) return false;
      if (typeof props.cheio === 'boolean') return props.cheio;
      const nivel = parseNivel(props);
      if (typeof nivel === 'number') {
        const limiar = Number(fullThresholdEl.value || 90);
        return nivel >= limiar;
      }
      return false;
    }
    function inferCondition(props) {
      if (!props) return 'operacional';
      if (typeof props.operacional === 'boolean') return props.operacional ? 'operacional' : 'danificado';
      if (typeof props.operational === 'boolean') return props.operational ? 'operacional' : 'danificado';
      const txt = (props.condicao || props.estado_operacional || props.condition || '').toString().toLowerCase();
      if (!txt) return 'operacional';
      if (txt.includes('danad') || txt.includes('danificado') || txt.includes('broken') || txt.includes('inoper') || txt.includes('avariado')) return 'danificado';
      return 'operacional';
    }
    function computeEstadoText(props) {
      if (props && typeof props.estado_text === 'string' && props.estado_text.trim()) return props.estado_text;
      const nivel = parseNivel(props);
      const limiar = Number(fullThresholdEl.value || 90);
      const limiarVazio = EMPTY_THRESHOLD_DEFAULT;
      if (typeof nivel === 'number') {
        if (nivel >= limiar) return 'cheio';
        if (nivel <= limiarVazio) return 'vazio';
        return 'normal';
      }
      if (typeof props.cheio === 'boolean') return props.cheio ? 'cheio' : 'normal';
      return 'normal';
    }
    function annotateStatesByThreshold(featureCollection) {
      if (!featureCollection || !Array.isArray(featureCollection.features)) return;
      for (const f of featureCollection.features) {
        const props = f.properties = f.properties || {};
        props.cheio = isFullFromProps(props);
        props.estado = props.cheio ? 'cheio' : 'não cheio';
        props.estado_text = computeEstadoText(props);
        props.condicao_text = inferCondition(props);
      }
    }

    // --- Load GeoJSON and render ecopontos (maintained) ---
    function getActiveCategories(){ return Array.from(document.querySelectorAll('.catCheckbox')).filter(cb=>cb.checked).map(cb=>cb.value); }
    function anyStateCheckboxChecked(){ const cbs=document.querySelectorAll('.stateCheckbox'); return Array.from(cbs).some(cb=>cb.checked); }
    function getActiveStates(){ const cbs=document.querySelectorAll('.stateCheckbox'); return Array.from(cbs).filter(cb=>cb.checked).map(cb=>cb.value.toString().toLowerCase()); }
    function getSearchFilters(){ const code=(codeSearchEl.value||'').trim().toLowerCase(); const states = anyStateCheckboxChecked() ? getActiveStates() : (stateSelect.value ? [stateSelect.value.toString().toLowerCase()] : []); return { code, states }; }

    function computeCounts(features, activeSearch){
      const counts={ plastico:0, papel:0, metal:0, vidro:0, indiferenciado:0 };
      const stateCounts={};
      for(const f of features){
        const props=f.properties||{};
        const cat=mapToCategory(props.tipo||props.type||'');
        const code=(props.codigo||props.code||props.Codigo||'').toString().toLowerCase();
        const estado=(props.estado||props.estado_operacional||'').toString().trim();
        if(activeSearch.code && !code.includes(activeSearch.code)) continue;
        counts[cat]=(counts[cat]||0)+1;
        if(estado) stateCounts[estado]=(stateCounts[estado]||0)+1;
      }
      return { counts, stateCounts };
    }
    function updateLegendCounts(counts){ countEls.plastico.textContent=counts.plastico||0; countEls.papel.textContent=counts.papel||0; countEls.metal.textContent=counts.metal||0; countEls.vidro.textContent=counts.vidro||0; countEls.indiferenciado.textContent=counts.indiferenciado||0; }
    function updateStateCounts(stateCounts){ Array.from(statesBox.querySelectorAll('span.muted')).forEach(span=>{ const s=span.dataset.state; if(!s) return; span.textContent = stateCounts[s] || 0; }); }

    function populateStates(features){
      const states = new Set();
      for(const f of features){
        const props = f.properties || {};
        const estado = (props.estado || (isFullFromProps(props) ? 'cheio' : 'não cheio')).toString().trim();
        if(estado) states.add(estado);
      }
      stateSelect.innerHTML = '<option value="">— Todos os estados —</option>';
      Array.from(states).sort().forEach(s=>{ const opt=document.createElement('option'); opt.value=s; opt.textContent=s; stateSelect.appendChild(opt); });
      statesBox.innerHTML = '';
      if(!states.size){ const d=document.createElement('div'); d.className='muted'; d.textContent='Nenhum estado encontrado no GeoJSON.'; statesBox.appendChild(d); return; }
      Array.from(states).sort().forEach(s=>{
        const id='state_'+s.replace(/\s+/g,'_').replace(/[^\w\-]/g,'');
        const wrapper=document.createElement('label');
        wrapper.style.display='flex'; wrapper.style.justifyContent='space-between'; wrapper.style.alignItems='center'; wrapper.style.gap='8px'; wrapper.style.padding='4px 6px'; wrapper.style.borderRadius='6px'; wrapper.style.background='#fff'; wrapper.style.border='1px solid #f0f0f0';
        const left=document.createElement('div'); left.style.display='flex'; left.style.gap='8px'; left.style.alignItems='center';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.value=s; cb.id=id; cb.checked=true; cb.className='stateCheckbox';
        const span=document.createElement('span'); span.className='small'; span.textContent=s;
        left.appendChild(cb); left.appendChild(span);
        wrapper.appendChild(left);
        const countSpan=document.createElement('span'); countSpan.className='muted'; countSpan.style.minWidth='28px'; countSpan.style.textAlign='right'; countSpan.textContent='0'; countSpan.dataset.state=s;
        wrapper.appendChild(countSpan);
        statesBox.appendChild(wrapper);
      });
      Array.from(document.querySelectorAll('.stateCheckbox')).forEach(cb=>cb.addEventListener('change', ()=>renderEcopontos()));
      stateSelect.addEventListener('change', ()=>{ if(!anyStateCheckboxChecked()) renderEcopontos(); });
    }

    function renderEcopontos(){
      if(!lastGeoJSON) return;
      const activeCats = getActiveCategories();
      const search = getSearchFilters();
      const { counts, stateCounts } = computeCounts(lastGeoJSON.features, { code: search.code });
      updateLegendCounts(counts);
      updateStateCounts(stateCounts);

      const filtered = { type:'FeatureCollection', features: lastGeoJSON.features.filter(f=>{
        const props=f.properties||{};
        const cat=mapToCategory(props.tipo||props.type||'');
        if(!activeCats.includes(cat)) return false;
        const code=(props.codigo||props.code||props.Codigo||'').toString().toLowerCase();
        if(search.code && !code.includes(search.code)) return false;
        const estado=(props.estado||props.estado_operacional||'').toString().toLowerCase();
        if(search.states.length && !search.states.includes(estado)) return false;
        return true;
      }).map(f=>{ const props=f.properties||{}; const cat=mapToCategory(props.tipo||props.type||''); f.properties = Object.assign({}, props, { _category: cat }); return f; }) };

      ecopontosLayer.clearLayers();
      ecopontosLayer.addData(filtered);
      ecopontosLayer.eachLayer(layer=>{
        const props = layer.feature.properties || {};
        const cat = props._category || 'indiferenciado';
        const color = CATEGORY_COLOR[cat] || CATEGORY_COLOR['indiferenciado'];
        if(layer.setStyle) layer.setStyle({ radius:6, fillColor: color, color:'#fff', weight:1, fillOpacity:1 });
        const id = props.codigo || props.ObjectID || props.nome || '';
        const categoria = (cat === 'plastico' ? 'Plástico' : cat === 'papel' ? 'Papel' : cat === 'metal' ? 'Metal' : cat === 'vidro' ? 'Vidro' : 'Indiferenciado');
        const estadoText = (props.estado_text || computeEstadoText(props));
        const condicao = (props.condicao_text || inferCondition(props));
        const estadoLabel = (estadoText === 'vazio' ? 'Vazio' : estadoText === 'cheio' ? 'Cheio' : 'Normal');
        const condLabel = (condicao === 'danificado' ? 'Danificado' : 'Operacional');
        const popupHtml = `<div style="min-width:180px"><strong>ID:</strong> ${escapeHtml(String(id || '—'))}<br/><strong>Categoria:</strong> ${escapeHtml(categoria)}<br/><strong>Estado:</strong> ${escapeHtml(estadoLabel)}<br/><strong>Condição:</strong> ${escapeHtml(condLabel)}</div>`;
        layer.bindPopup(popupHtml);
        layer.on('click', ()=>layer.openPopup());
      });
      if(ecopontosLayer.getBounds && ecopontosLayer.getLayers().length) map.fitBounds(ecopontosLayer.getBounds(), { padding:[30,30] });
      computeAndShowSummary({ renderToSidebar:true });
    }
    /* --- Loader automático de ecopontos a partir do servidor --- */
async function loadEcopontosFromServer(options = {}) {
  const serverPath = options.serverPath || 'ecopontos.geojson.json';
  // usa a camada e a função de renderização existentes
  const layer = options.layer || window.ecopontosLayer || ecopontosLayer;
  const addFn = options.addFunction || window.renderEcopontos || renderEcopontos;
  const fetchOptions = Object.assign({ cache: 'no-cache' }, options.fetchOptions || {});
  const cacheBust = options.cacheBust ? `?t=${Date.now()}` : '';

  if (!layer) {
    console.error('[loader] Camada ecopontos não encontrada. Passa options.layer ou define ecopontosLayer.');
    return;
  }
  if (typeof addFn !== 'function') {
    console.error('[loader] Função de renderização não encontrada. Passa options.addFunction ou define renderEcopontos.');
    return;
  }

  const url = serverPath + cacheBust;
  console.info('[loader] A tentar carregar ecopontos de:', url);

  try {
    const resp = await fetch(url, fetchOptions);
    console.info('[loader] fetch status:', resp.status, resp.statusText, 'Content-Type:', resp.headers.get('content-type'));

    if (!resp.ok) {
      const body = await resp.text().catch(() => '<no body>');
      throw new Error(`HTTP ${resp.status} ${resp.statusText} - resposta: ${body}`);
    }

    // tenta obter JSON diretamente
    let geojson;
    try {
      geojson = await resp.json();
    } catch (jsonErr) {
      // fallback: ler texto e parsear
      const text = await resp.text();
      try {
        geojson = JSON.parse(text);
      } catch (parseErr) {
        console.error('[loader] Conteúdo recebido não é JSON válido (primeiros 500 chars):', text.slice(0, 500));
        throw parseErr;
      }
    }

    // guarda para uso posterior e chama a função de render
    lastGeoJSON = geojson;
    try {
      // se a função renderEcopontos espera lastGeoJSON, apenas chama-a
      if (addFn === renderEcopontos || addFn === window.renderEcopontos) {
        addFn();
      } else {
        // caso a função aceite (geojson, layer)
        addFn(geojson, layer);
      }
      console.info('[loader] Ecopontos carregados com sucesso a partir de', serverPath);
    } catch (addErr) {
      console.error('[loader] Erro ao adicionar ecopontos à camada:', addErr);
      throw addErr;
    }
  } catch (err) {
    console.warn('[loader] Falha ao carregar ecopontos do servidor:', err);
    // fallback: abrir input file (mantém teu fallback)
    if (typeof window.openEcopontosFileDialog === 'function') {
      console.info('[loader] A abrir diálogo de ficheiro como fallback.');
      window.openEcopontosFileDialog();
      return;
    }
    // fallback simples: cria input file
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.geojson,application/geo+json,application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) { document.body.removeChild(input); return; }
      try {
        const text = await file.text();
        const geojson = JSON.parse(text);
        lastGeoJSON = geojson;
        if (addFn === renderEcopontos || addFn === window.renderEcopontos) addFn();
        else addFn(geojson, layer);
        console.info('[loader] Ecopontos carregados a partir do ficheiro selecionado pelo utilizador.');
      } catch (e) {
        console.error('[loader] Erro ao processar ficheiro selecionado:', e);
      } finally {
        document.body.removeChild(input);
      }
    });
    // tenta abrir o diálogo (alguns browsers exigem interação do utilizador)
    input.click();
  }
}

/* --- Pequeno helper delay (usado em generateAllRoutes) --- */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* --- Chamada automática quando o mapa estiver pronto --- */
map.whenReady(() => {
  // ajusta serverPath se necessário
  loadEcopontosFromServer({
    serverPath: 'ecopontos.geojson.json',
    layer: ecopontosLayer,
    addFunction: renderEcopontos,
    cacheBust: true // força evitar cache durante desenvolvimento
  });
});

    // --- Load GeoJSON ---
    fileInput.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{ const parsed = JSON.parse(reader.result); annotateStatesByThreshold(parsed); lastGeoJSON = parsed; populateStates(lastGeoJSON.features); renderEcopontos(); setStatus('GeoJSON carregado'); log('GeoJSON carregado com ' + (lastGeoJSON.features.length) + ' ecopontos.'); } catch(err){ alert('Erro ao ler/parsear o ficheiro: ' + err.message); }
      };
      reader.onerror = ()=>alert('Erro a ler o ficheiro.');
      reader.readAsText(f);
    });
 
    // --- ORS request and route generation (unchanged) ---
    async function requestRouteORS(apiKey, profile, fromLonLat, toLonLat){
      const url = `https://api.openrouteservice.org/v2/directions/${encodeURIComponent(profile)}/geojson`;
      const body = { coordinates: [ [fromLonLat[0], fromLonLat[1]], [toLonLat[0], toLonLat[1]] ], instructions: false, geometry: true };
      const res = await fetch(url, { method:'POST', headers:{ 'Authorization': apiKey, 'Content-Type':'application/json' }, body: JSON.stringify(body) });
      if(!res.ok){ const txt = await res.text(); throw new Error('ORS error ' + res.status + ': ' + txt); }
      return await res.json();
    }

    async function generateAllRoutes(){
      if(!lastGeoJSON || !Array.isArray(lastGeoJSON.features) || lastGeoJSON.features.length===0){ alert('Carregue primeiro o GeoJSON dos ecopontos (use o seletor no canto superior esquerdo).'); return; }
      const apiKey = orsKeyEl.value.trim(); if(!apiKey){ alert('Cole a sua ORS API key.'); return; }
      const profile = orsProfileEl.value || 'driving-car'; const depotLat = Number(depotLatEl.value); const depotLon = Number(depotLonEl.value);
      if(isNaN(depotLat) || isNaN(depotLon)){ alert('Forneça coordenadas válidas do depósito.'); return; }

      routesFeatures = []; routesLayer.clearLayers(); setStatus('a gerar rotas'); stopRequested=false; stopBtn.disabled=false; generateBtn.disabled=true; exportBtn.disabled=true; colorIndex=0;

      for(const feat of lastGeoJSON.features){
        if(stopRequested){ log('Paragem solicitada — interrompendo.'); break; }
        const geom = feat.geometry; if(!geom || geom.type!=='Point' || !Array.isArray(geom.coordinates)){ log('Ignorado: feature sem Point válido.'); continue; }
        const fromLon = Number(geom.coordinates[0]); const fromLat = Number(geom.coordinates[1]);
        const routeColor = nextRouteColor(); const routeId = makeRouteId();
        try{
          log(`Pedindo rota: ${feat.properties && (feat.properties.codigo || feat.properties.ObjectID || '')} → depósito`);
          const geo = await requestRouteORS(apiKey, profile, [fromLon, fromLat], [depotLon, depotLat]);
          if(geo && geo.features && geo.features.length){
            const routeFeature = geo.features[0];
            routeFeature.properties = routeFeature.properties || {};
            routeFeature.properties.route_id = routeId;
            routeFeature.properties.source_code = feat.properties && (feat.properties.codigo || feat.properties.ObjectID || '');
            routeFeature.properties.ecoponto_tipo = feat.properties && (feat.properties.tipo || feat.properties.type || '');
            routeFeature.properties.color = routeColor;
            if(routeFeature.properties.summary){ routeFeature.properties.distance_m = routeFeature.properties.summary.distance || null; routeFeature.properties.duration_s = routeFeature.properties.summary.duration || null; }
            else if(routeFeature.properties.segments && routeFeature.properties.segments[0]){ routeFeature.properties.distance_m = routeFeature.properties.segments[0].distance || null; routeFeature.properties.duration_s = routeFeature.properties.segments[0].duration || null; }
            routesFeatures.push(routeFeature);
            routesLayer.addData(Object.assign({}, routeFeature, { properties: Object.assign({}, routeFeature.properties, { color: routeColor }) }));
            const dist = routeFeature.properties.distance_m ? (routeFeature.properties.distance_m/1000).toFixed(2)+' km' : 'n/d';
            const dur = routeFeature.properties.duration_s ? (Math.round(routeFeature.properties.duration_s/60)) + ' min' : 'n/d';
            const popupHtml = `<div><strong>ID: ${escapeHtml(routeId)}</strong><br/>Origem: ${escapeHtml(String(routeFeature.properties.source_code || 'ecoponto'))}<br/>Distância: ${dist}<br/>Duração: ${dur}</div>`;
            routesLayer.eachLayer(layer=>{ if(layer.feature && layer.feature.properties && layer.feature.properties.route_id===routeId){ layer.bindPopup(popupHtml); layer.on('click', ()=>layer.openPopup()); }});
            log(`Rota gerada (ID ${routeId}, ${dist}, ${dur}).`);
          } else { log('Resposta ORS sem rota válida.'); }
        } catch(err){ log('Erro ao gerar rota: ' + err.message); }
        await delay(Number(delayMsEl.value) || 600);
      }

      setStatus(stopRequested ? 'interrompido' : 'concluído');
      generateBtn.disabled=false; stopBtn.disabled=true; exportBtn.disabled = routesFeatures.length===0;
      log('Processo terminado. Rotas geradas: ' + routesFeatures.length);
      if(routesFeatures.length) map.fitBounds(routesLayer.getBounds(), { padding:[30,30] });
      computeAndShowSummary({ renderToSidebar:true });
    }

    // --- Export filtered routes (as suggested earlier) ---
    function exportFilteredRoutesGeoJSON() {
      if (!routesFeatures || !routesFeatures.length) { alert('Não há rotas para exportar.'); return; }
      const activeCats = getActiveCategories();
      const codeFilter = (document.getElementById('codeSearch').value || '').trim().toLowerCase();
      const anyStateChecked = anyStateCheckboxChecked();
      const activeStates = anyStateChecked ? getActiveStates() : (document.getElementById('stateSelect').value ? [document.getElementById('stateSelect').value.toString().toLowerCase()] : []);
      const filtered = routesFeatures.filter(route => {
        const props = route.properties || {};
        const cat = (props.ecoponto_tipo || '').toString().toLowerCase();
        const sourceCode = (props.source_code || '').toString();
        let epProps = null;
        if (lastGeoJSON && Array.isArray(lastGeoJSON.features)) {
          epProps = lastGeoJSON.features.find(f => { const p = f.properties || {}; return String(p.codigo || p.ObjectID || p.nome || '').toString() === sourceCode; })?.properties || null;
        }
        if (activeCats.length && !activeCats.includes(mapToCategory(cat || (epProps && (epProps.tipo || epProps.type)) || ''))) return false;
        if (codeFilter) {
          const codeMatch = (sourceCode || '').toLowerCase().includes(codeFilter) || (epProps && ((epProps.codigo||'') + '').toLowerCase().includes(codeFilter));
          if (!codeMatch) return false;
        }
        if (activeStates.length) {
          const estado = (props.estado || (epProps && (epProps.estado || epProps.estado_operacional)) || '').toString().toLowerCase();
          if (!activeStates.includes(estado)) return false;
        } else {
          const sel = (document.getElementById('stateSelect').value || '').toString().toLowerCase();
          if (sel) {
            const estado = (props.estado || (epProps && (epProps.estado || epProps.estado_operacional)) || '').toString().toLowerCase();
            if (sel && estado !== sel) return false;
          }
        }
        return true;
      });
      if (!filtered.length) { alert('Nenhuma rota corresponde aos filtros atuais.'); return; }
      const enriched = filtered.map(r => {
        const copy = JSON.parse(JSON.stringify(r));
        copy.properties = copy.properties || {};
        const sourceCode = (copy.properties.source_code || '').toString();
        if (lastGeoJSON && Array.isArray(lastGeoJSON.features)) {
          const ep = lastGeoJSON.features.find(f => { const p = f.properties || {}; return String(p.codigo || p.ObjectID || p.nome || '').toString() === sourceCode; });
          if (ep && ep.properties) copy.properties._ecoponto = Object.assign({}, ep.properties);
        }
        if (typeof copy.properties.cheio === 'undefined') copy.properties.cheio = !!copy.properties.cheio;
        if (!copy.properties.estado_text && copy.properties._ecoponto && copy.properties._ecoponto.estado_text) copy.properties.estado_text = copy.properties._ecoponto.estado_text;
        if (!copy.properties.condicao_text && copy.properties._ecoponto && copy.properties._ecoponto.condicao_text) copy.properties.condicao_text = copy.properties._ecoponto.condicao_text;
        return copy;
      });
      const fc = { type: 'FeatureCollection', features: enriched };
      const blob = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json;charset=utf-8' });
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      const filename = `rotas_filtradas_${ts}.geojson`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      log('Exportado ficheiro filtrado: ' + filename);
    }

    // --- Summary (computeAndShowSummary) ---
    function computeAndShowSummary({ renderToSidebar = true } = {}) {
      if (!routesFeatures || !routesFeatures.length) {
        const empty = { totalRoutes: 0, totalDistanceKm: 0, totalDurationMin: 0, avgDistanceKm: 0, avgDurationMin: 0, byCategory: {}, byEstadoText: {}, byCondicao: {} };
        if (renderToSidebar) renderSummaryPanel(empty);
        return empty;
      }
      const codeFilter = (document.getElementById('codeSearch').value || '').trim().toLowerCase();
      const activeCats = Array.from(document.querySelectorAll('.catCheckbox')).filter(cb => cb.checked).map(cb => cb.value);
      const anyStateChecked = Array.from(document.querySelectorAll('.stateCheckbox')).some(cb => cb.checked);
      const activeStates = anyStateChecked ? Array.from(document.querySelectorAll('.stateCheckbox')).filter(cb => cb.checked).map(cb => cb.value.toString().toLowerCase()) : (document.getElementById('stateSelect').value ? [document.getElementById('stateSelect').value.toString().toLowerCase()] : []);
      const filteredRoutes = routesFeatures.filter(route => {
        const props = route.properties || {};
        const cat = mapToCategory((props.ecoponto_tipo || '').toString().toLowerCase());
        const sourceCode = (props.source_code || '').toString();
        if (activeCats.length && !activeCats.includes(cat)) return false;
        if (codeFilter) { const codeMatch = (sourceCode || '').toLowerCase().includes(codeFilter); if (!codeMatch) return false; }
        const estado = (props.estado || '').toString().toLowerCase();
        if (activeStates.length && !activeStates.includes(estado)) return false;
        return true;
      });
      let totalDistance = 0; let totalDuration = 0;
      const byCategory = {}; const byEstadoText = {}; const byCondicao = {};
      for (const r of filteredRoutes) {
        const p = r.properties || {};
        const d = Number(p.distance_m || 0); const t = Number(p.duration_s || 0);
        totalDistance += isNaN(d) ? 0 : d; totalDuration += isNaN(t) ? 0 : t;
        const cat = mapToCategory((p.ecoponto_tipo || '').toString().toLowerCase());
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        const estadoText = (p.estado_text || (p.estado ? p.estado : '—')).toString();
        byEstadoText[estadoText] = (byEstadoText[estadoText] || 0) + 1;
        const cond = (p.condicao_text || 'operacional').toString();
        byCondicao[cond] = (byCondicao[cond] || 0) + 1;
      }
      const totalRoutes = filteredRoutes.length;
      const totalDistanceKm = +(totalDistance / 1000).toFixed(3);
      const totalDurationMin = Math.round(totalDuration / 60);
      const avgDistanceKm = totalRoutes ? +(totalDistanceKm / totalRoutes).toFixed(3) : 0;
      const avgDurationMin = totalRoutes ? Math.round(totalDurationMin / totalRoutes) : 0;
      const summary = { totalRoutes, totalDistanceKm, totalDurationMin, avgDistanceKm, avgDurationMin, byCategory, byEstadoText, byCondicao };
      if (renderToSidebar) renderSummaryPanel(summary);
      return summary;
    }
    function renderSummaryPanel(summary) {
      sumRoutesEl.textContent = summary.totalRoutes;
      sumDistEl.textContent = summary.totalDistanceKm + ' km';
      sumDurEl.textContent = summary.totalDurationMin + ' min';
    }

    // --- Animation / Operation logic (simplified) ---
    let operationRunning = false;
    let operationPromises = [];
    let vehicleMarkers = {}; // map vehicle.id -> marker
    let animationTimers = []; // intervals/timeouts to clear on abort

    function placeVehiclesAtDepot() {
      vehicleMarkersLayer.clearLayers();
      vehicleMarkers = {};
      const depotLat = Number(depotLatEl.value) || MAP_CENTER[0];
      const depotLon = Number(depotLonEl.value) || MAP_CENTER[1];
      const radius = 0.0006;
      let angle = 0;
      const step = (2*Math.PI)/vehicles.length;
      vehicles.forEach((v,i)=>{
        const a = angle + (Math.random()*0.2 - 0.1);
        angle += step;
        const offsetLat = depotLat + Math.sin(a) * radius * (1 + Math.random()*0.4);
        const offsetLon = depotLon + Math.cos(a) * radius * (1 + Math.random()*0.4);
        if (v.marker) vehicleMarkersLayer.removeLayer(v.marker);
        const color = v.state === 'operacional' ? '#2b7' : (v.state === 'manutenção' ? '#f5a623' : '#d9534f');
        const icon = truckIcon(color);
        const m = L.marker([offsetLat, offsetLon], { icon }).addTo(vehicleMarkersLayer);
        m.bindTooltip(`${v.code} • ${v.plate}`, {permanent:false});
        v.marker = m;
        vehicleMarkers[v.id] = m;
      });
    }

    function assignEcopointsToVehicles() {
      if (!lastGeoJSON) { log('Nenhum GeoJSON carregado para atribuição.'); return; }
      const limiar = Number(fullThresholdEl.value || 90);
      const fullEps = lastGeoJSON.features.filter(f => {
        const p = f.properties || {};
        if (p.cheio === true) return true;
        if ((p.estado_text || '').toString().toLowerCase() === 'cheio') return true;
        const nivel = (function(){
          if (typeof p.nivel === 'number') return p.nivel;
          if (typeof p.nivel === 'string') { const n = parseFloat(p.nivel.replace('%','')); return isNaN(n) ? null : n; }
          if (typeof p.fill_level === 'number') return p.fill_level;
          if (typeof p.fill_level === 'string') { const n = parseFloat(p.fill_level.replace('%','')); return isNaN(n) ? null : n; }
          return null;
        })();
        if (typeof nivel === 'number' && nivel >= limiar) return true;
        return false;
      });

      if (!fullEps.length) {
        log('Nenhum ecoponto considerado cheio (segundo os critérios). A operação não atribuirá recolhas.');
        return;
      }

      const shuffled = fullEps.slice().sort(()=>Math.random()-0.5);
      const operationalVehicles = vehicles.filter(v => v.state === 'operacional');
      if (!operationalVehicles.length) { log('Nenhuma viatura operacional disponível.'); return; }
      operationalVehicles.forEach(v => v.assignedEcopoints = []);
      let idx = 0;
      for (const ep of shuffled) {
        const v = operationalVehicles[idx % operationalVehicles.length];
        v.assignedEcopoints.push(ep);
        idx++;
      }
      log(`Atribuídos ${shuffled.length} ecopontos a ${operationalVehicles.length} viaturas operacionais (round-robin).`);
      console.log('Atribuições (exemplo):', operationalVehicles.slice(0,5).map(v=>({vehicle:v.code, assigned: v.assignedEcopoints.length})));
    }

    function findRouteForEcoponto(ep) {
      if (!ep || !routesFeatures || !routesFeatures.length) return null;
      const epProps = ep.properties || {};
      const epCodes = [
        (epProps.codigo || '').toString(),
        (epProps.code || '').toString(),
        (epProps.ObjectID || '').toString(),
        (epProps.nome || '').toString()
      ].filter(Boolean);

      for (const r of routesFeatures) {
        const rp = r.properties || {};
        const sc = (rp.source_code || rp.properties && rp.properties.source_code || rp.source || rp.ecoponto || rp.codigo || '').toString();
        if (!sc) continue;
        if (epCodes.includes(sc)) return r;
      }
      for (const r of routesFeatures) {
        const rp = r.properties || {};
        const sc = (rp.source_code || '').toString();
        if (!sc) continue;
        for (const c of epCodes) {
          if (c && sc && (sc.indexOf(c) !== -1 || c.indexOf(sc) !== -1)) return r;
        }
      }
      return null;
    }

    function buildVehiclePathSegments(vehicle) {
      const depotLat = Number(depotLatEl.value) || MAP_CENTER[0];
      const depotLon = Number(depotLonEl.value) || MAP_CENTER[1];
      const segments = [];
      if (!vehicle.assignedEcopoints || !vehicle.assignedEcopoints.length) return segments;
      const debugLines = [];
      for (const ep of vehicle.assignedEcopoints) {
        const route = findRouteForEcoponto(ep);
        const epCoords = (ep.geometry && ep.geometry.coordinates) ? ep.geometry.coordinates : null;
        if (route && route.geometry && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length) {
          const coords = route.geometry.coordinates;
          const rev = coords.slice().reverse();
          segments.push({ coords: rev, distance_m: route.properties && route.properties.distance_m, duration_s: route.properties && route.properties.duration_s, isPickup: true });
          segments.push({ coords: coords, distance_m: route.properties && route.properties.distance_m, duration_s: route.properties && route.properties.duration_s, isPickup: false });
          try {
            const latlngs1 = rev.map(c => [c[1], c[0]]);
            const latlngs2 = coords.map(c => [c[1], c[0]]);
            const pl1 = L.polyline(latlngs1, { color:'#888', dashArray:'6,6', weight:2, opacity:0.6 }).addTo(map);
            const pl2 = L.polyline(latlngs2, { color:'#888', dashArray:'6,6', weight:2, opacity:0.6 }).addTo(map);
            debugLines.push(pl1, pl2);
          } catch(e){}
        } else if (epCoords && epCoords.length >= 2) {
          const directTo = [[depotLon, depotLat], [epCoords[0], epCoords[1]]];
          const directBack = [[epCoords[0], epCoords[1]], [depotLon, depotLat]];
          segments.push({ coords: directTo, distance_m: null, duration_s: 20, isPickup: true });
          segments.push({ coords: directBack, distance_m: null, duration_s: 20, isPickup: false });
          try {
            const latlngs1 = directTo.map(c => [c[1], c[0]]);
            const latlngs2 = directBack.map(c => [c[1], c[0]]);
            const pl1 = L.polyline(latlngs1, { color:'#f39', dashArray:'4,6', weight:2, opacity:0.7 }).addTo(map);
            const pl2 = L.polyline(latlngs2, { color:'#f39', dashArray:'4,6', weight:2, opacity:0.7 }).addTo(map);
            debugLines.push(pl1, pl2);
          } catch(e){}
        } else {
          console.warn('Ecoponto sem coordenadas, ignorado para animação:', ep);
        }
      }
      setTimeout(()=>{ debugLines.forEach(pl => { try{ map.removeLayer(pl); }catch(e){} }); }, 20000);
      return segments;
    }

    function animateVehicleAlongPath(vehicle, pathSegments, options={}) {
      return new Promise((resolve) => {
        if (!vehicle.marker) { resolve(); return; }
        if (!pathSegments || !pathSegments.length) { resolve(); return; }
        let segIndex = 0;
        const speedFactor = options.speedFactor || 1.0;
        let activeInterval = null;
        function runNextSegment() {
          if (segIndex >= pathSegments.length) {
            if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
            resolve();
            return;
          }
          const seg = pathSegments[segIndex];
          const coords = seg.coords || [];
          if (!coords.length) { segIndex++; runNextSegment(); return; }
          const segDuration = (seg.duration_s && seg.duration_s > 0) ? (seg.duration_s / speedFactor) : (Math.max(8, coords.length * 0.05) );
          const steps = Math.max(1, coords.length);
          const intervalMs = Math.max(20, Math.floor((segDuration*1000) / steps));
          let i = 0;
          activeInterval = setInterval(()=>{
            if (i >= coords.length) {
              clearInterval(activeInterval);
              activeInterval = null;
              if (seg.isPickup) {
                const origIcon = vehicle.marker.options.icon;
                vehicle.marker.setIcon(truckIcon('#ffd54f'));
                setTimeout(()=>{ vehicle.marker.setIcon(origIcon); segIndex++; runNextSegment(); }, 700);
              } else {
                segIndex++; runNextSegment();
              }
              return;
            }
            const c = coords[i];
            try { vehicle.marker.setLatLng([c[1], c[0]]); } catch(e) { console.warn('Erro a mover marcador:', e); }
            i++;
          }, intervalMs);
          animationTimers.push(activeInterval);
        }
        runNextSegment();
      });
    }

    async function runOperationSimulation() {
      if (operationRunning) return;
      if (!lastGeoJSON) { alert('Carregue o GeoJSON primeiro.'); return; }
      operationRunning = true;
      startOpBtn.disabled = true; abortOpBtn.disabled = false;
      setStatus('Operação em curso');
      log('Operação iniciada: posicionando viaturas no depósito...');
      placeVehiclesAtDepot();
      assignEcopointsToVehicles();
      // prefer assignedRoutes if exist
      const operationalVehicles = vehicles.filter(v=>v.state==='operacional' && ((v.assignedRoutes && v.assignedRoutes.length) || (v.assignedEcopoints && v.assignedEcopoints.length)));
      activeVehiclesEl.textContent = operationalVehicles.length;
      operationPromises = operationalVehicles.map(async (v) => {
        const segments = (v.assignedRoutes && v.assignedRoutes.length) ? buildVehiclePathSegmentsFromAssignedRoutes(v) : buildVehiclePathSegments(v);
        if (!segments.length) return;
        await animateVehicleAlongPath(v, segments, { speedFactor: 1.0 });
        const depotLat = Number(depotLatEl.value);
        const depotLon = Number(depotLonEl.value);
        const offsetLat = depotLat + (Math.random()*0.0004 - 0.0002);
        const offsetLon = depotLon + (Math.random()*0.0004 - 0.0002);
        if (v.marker) v.marker.setLatLng([offsetLat, offsetLon]);
        log(`${v.code} terminou e voltou ao depósito.`);
      });
      await Promise.all(operationPromises);
      operationRunning = false;
      startOpBtn.disabled = false; abortOpBtn.disabled = true;
      setStatus('Operação concluída');
      log('Operação concluída — todas as viaturas retornaram ao depósito.');
      animationTimers.forEach(t => clearInterval(t));
      animationTimers = [];
      computeAndShowSummary({ renderToSidebar:true });
    }

    function abortOperation() {
      if (!operationRunning) return;
      stopRequested = true;
      operationRunning = false;
      animationTimers.forEach(t => clearInterval(t));
      animationTimers = [];
      abortOpBtn.disabled = true;
      startOpBtn.disabled = false;
      setStatus('Operação abortada');
      log('Operação abortada pelo utilizador.');
    }

    // --- Vehicles layer controls (manual activation) ---
    const vehicleLayer = L.layerGroup().addTo(map);
    const vehicleMarkerMap = {};
    function makeTruckIcon(color = '#2b7') {
      const svg = encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='24' viewBox='0 0 36 24'>
          <rect x='1' y='6' width='22' height='12' rx='2' fill='${color}' stroke='#fff' stroke-width='1'/>
          <rect x='23' y='10' width='10' height='8' rx='1' fill='${color}' stroke='#fff' stroke-width='1'/>
          <circle cx='9' cy='20' r='2' fill='#333'/>
          <circle cx='27' cy='20' r='2' fill='#333'/>
        </svg>`
      );
      return L.icon({ iconUrl: 'data:image/svg+xml;charset=utf-8,' + svg, iconSize: [28,20], iconAnchor: [14,10] });
    }
    function createVehicleMarker(v, lat = null, lon = null) {
      if (vehicleMarkerMap[v.id]) {
        const m = vehicleMarkerMap[v.id];
        if (lat !== null && lon !== null) m.setLatLng([lat, lon]);
        return m;
      }
      let pos = null;
      if (v.marker && v.marker.getLatLng) pos = v.marker.getLatLng();
      else {
        const depotLat = Number(depotLatEl.value) || MAP_CENTER[0];
        const depotLon = Number(depotLonEl.value) || MAP_CENTER[1];
        pos = L.latLng(depotLat + (Math.random()*0.0006 - 0.0003), depotLon + (Math.random()*0.0006 - 0.0003));
      }
      if (lat !== null && lon !== null) pos = L.latLng(lat, lon);
      const color = v.state === 'operacional' ? '#2b7' : (v.state === 'manutenção' ? '#f5a623' : '#d9534f');
      const icon = makeTruckIcon(color);
      const marker = L.marker(pos, { icon, title: `${v.code} • ${v.plate}` });
      marker.bindPopup(`<div style="min-width:160px"><strong>${escapeHtml(v.code)}</strong><br/>${escapeHtml(v.brand)} ${escapeHtml(v.model)}<br/>${escapeHtml(v.plate)}<br/>Capacidade: ${escapeHtml(String(v.capacity))} m³<br/>Estado: ${escapeHtml(v.state)}</div>`);
      vehicleLayer.addLayer(marker);
      vehicleMarkerMap[v.id] = marker;
      return marker;
    }
    function removeVehicleMarker(v) { const m = vehicleMarkerMap[v.id]; if (m) { vehicleLayer.removeLayer(m); delete vehicleMarkerMap[v.id]; } }
    function activateVehicle(v) { const m = createVehicleMarker(v); if (!map.hasLayer(vehicleLayer)) vehicleLayer.addTo(map); try { m.openPopup(); setTimeout(()=>m.closePopup(), 900); } catch(e){} v._manualActive = true; }
    function deactivateVehicle(v) { const m = vehicleMarkerMap[v.id]; if (m) vehicleLayer.removeLayer(m); v._manualActive = false; }
    function toggleVehicleManual(v, checked) { if (checked) activateVehicle(v); else deactivateVehicle(v); log(`Viatura ${v.code} ${checked ? 'ativada' : 'desativada'} manualmente.`); }
    function renderVehicleControlList() {
      const container = document.getElementById('vehicleList');
      if (!container) return;
      container.innerHTML = '';
      if (!Array.isArray(vehicles)) { container.innerHTML = '<div class="muted">Nenhuma viatura definida.</div>'; return; }
      vehicles.forEach(v => {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.alignItems = 'center'; row.style.padding = '6px'; row.style.borderBottom = '1px solid #f0f0f0';
        const left = document.createElement('div'); left.style.display = 'flex'; left.style.gap = '8px'; left.style.alignItems = 'center';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'veh_cb_' + v.id; cb.checked = !!v._manualActive; cb.addEventListener('change', (e) => toggleVehicleManual(v, e.target.checked));
        const label = document.createElement('label'); label.htmlFor = cb.id; label.style.fontSize = '0.9rem'; label.textContent = `${v.code} (${v.plate})`;
        left.appendChild(cb); left.appendChild(label);
        const right = document.createElement('div'); right.style.display = 'flex'; right.style.gap = '6px'; right.style.alignItems = 'center';
        const btnCenter = document.createElement('button'); btnCenter.className = 'btn'; btnCenter.style.padding = '4px 6px'; btnCenter.textContent = 'Ir para'; btnCenter.addEventListener('click', () => {
          const m = vehicleMarkerMap[v.id] || createVehicleMarker(v);
          if (m && m.getLatLng) map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
          if (m && m.openPopup) m.openPopup();
        });
        right.appendChild(btnCenter);
        row.appendChild(left); row.appendChild(right); container.appendChild(row);
      });
    }
    document.getElementById('showAllVehiclesBtn')?.addEventListener('click', () => {
      if (!Array.isArray(vehicles)) return;
      vehicles.forEach(v => { v._manualActive = true; createVehicleMarker(v); });
      if (!map.hasLayer(vehicleLayer)) vehicleLayer.addTo(map);
      renderVehicleControlList();
      log('Todas as viaturas mostradas.');
    });
    document.getElementById('hideAllVehiclesBtn')?.addEventListener('click', () => {
      if (!Array.isArray(vehicles)) return;
      vehicles.forEach(v => { v._manualActive = false; });
      vehicleLayer.clearLayers();
      renderVehicleControlList();
      log('Todas as viaturas ocultadas.');
    });
    function initVehicleLayerControls() { if (Array.isArray(vehicles)) { vehicles.forEach(v => { if (v._manualActive) createVehicleMarker(v); }); } renderVehicleControlList(); }
    setTimeout(() => { if (typeof vehicles !== 'undefined') initVehicleLayerControls(); }, 200);

    // --- Utilitários e handlers ---
    function delay(ms){ return new Promise(res=>setTimeout(res, ms)); }
    function escapeHtml(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

    // create vehicles on load
    createVehicles();

    // wire buttons
    startOpBtn.addEventListener('click', ()=>{ runOperationSimulation().catch(err=>{ log('Erro na operação: '+err.message); operationRunning=false; startOpBtn.disabled=false; abortOpBtn.disabled=true; }); });
    abortOpBtn.addEventListener('click', ()=>{ abortOperation(); });

    document.addEventListener('change', (e)=>{ if(e.target && e.target.classList && e.target.classList.contains('catCheckbox')) renderEcopontos(); });
    document.addEventListener('change', (e)=>{ if(e.target && e.target.classList && e.target.classList.contains('stateCheckbox')) renderEcopontos(); });
    codeSearchEl.addEventListener('input', ()=>renderEcopontos());
    stateSelect.addEventListener('change', ()=>{ if(!anyStateCheckboxChecked()) renderEcopontos(); });

    fullThresholdEl.addEventListener('input', () => {
      const v = Number(fullThresholdEl.value);
      thresholdLabel.textContent = (isNaN(v) ? '—' : (v + '%'));
      if (!lastGeoJSON) return;
      annotateStatesByThreshold(lastGeoJSON);
      populateStates(lastGeoJSON.features);
      renderEcopontos();
    });

    generateBtn.addEventListener('click', ()=>{ routesLayer.clearLayers(); routesFeatures=[]; logEl.innerHTML=''; generateAllRoutes().catch(err=>{ log('Erro: '+err.message); setStatus('erro'); generateBtn.disabled=false; stopBtn.disabled=true; }); });
    exportBtn.addEventListener('click', exportFilteredRoutesGeoJSON);

    toggleEcopontos.addEventListener('change', ()=>{ if(toggleEcopontos.checked){ if(!map.hasLayer(ecopontosLayer)) ecopontosLayer.addTo(map); } else { if(map.hasLayer(ecopontosLayer)) map.removeLayer(ecopontosLayer); } });
    toggleRotas.addEventListener('change', ()=>{ if(toggleRotas.checked){ if(!map.hasLayer(routesLayer)) routesLayer.addTo(map); } else { if(map.hasLayer(routesLayer)) map.removeLayer(routesLayer); } });

    // init UI
    thresholdLabel.textContent = fullThresholdEl.value + '%';
    exportBtn.disabled = true;

    /* =========================
       Atribuição aleatória de rotas às viaturas (funções inseridas)
       ========================= */

    /**
     * Atribui rotas existentes (routesFeatures) aleatoriamente às viaturas operacionais.
     * options:
     *  - maxPerVehicle: número máximo de rotas atribuídas por viatura (default 1)
     *  - allowRouteReuse: se true, a mesma rota pode ser atribuída a várias viaturas (default false)
     */
    function assignRoutesToVehiclesRandomly(options = {}) {
      const maxPerVehicle = Number(options.maxPerVehicle || 1);
      const allowRouteReuse = !!options.allowRouteReuse;

      if (!Array.isArray(routesFeatures) || routesFeatures.length === 0) {
        log('Nenhuma rota disponível em routesFeatures para atribuição.');
        return;
      }
      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        log('Nenhuma viatura definida para atribuição.');
        return;
      }

      // preparar pool de rotas e embaralhar
      const routePool = routesFeatures.slice();
      for (let i = routePool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [routePool[i], routePool[j]] = [routePool[j], routePool[i]];
      }

      // limpar atribuições anteriores
      vehicles.forEach(v => { v.assignedRoutes = []; v.assignedEcopoints = []; });

      // filtrar viaturas operacionais
      const operationalVehicles = vehicles.filter(v => v.state === 'operacional');
      if (!operationalVehicles.length) {
        log('Nenhuma viatura operacional disponível para atribuição de rotas.');
        return;
      }

      // round-robin sobre pool de rotas
      let poolIndex = 0;
      for (const v of operationalVehicles) {
        for (let k = 0; k < maxPerVehicle; k++) {
          if (routePool.length === 0) break;
          const route = routePool[poolIndex % routePool.length];
          v.assignedRoutes.push(route);

          // tentar ligar ecoponto de origem (source_code) para referência
          const src = route.properties && (route.properties.source_code || route.properties.codigo || route.properties.source || '');
          if (src && lastGeoJSON && Array.isArray(lastGeoJSON.features)) {
            const ep = lastGeoJSON.features.find(f => {
              const p = f.properties || {};
              return String(p.codigo || p.code || p.ObjectID || p.nome || '') === String(src);
            });
            if (ep) v.assignedEcopoints.push(ep);
          }

          poolIndex++;
          if (!allowRouteReuse) {
            const rid = route.properties && route.properties.route_id;
            const idx = routePool.findIndex(r => r.properties && r.properties.route_id === rid);
            if (idx >= 0) routePool.splice(idx, 1);
            if (routePool.length === 0) break;
            poolIndex = poolIndex % routePool.length;
          }
        }
      }

      const totalAssigned = vehicles.reduce((s,v)=> s + (v.assignedRoutes ? v.assignedRoutes.length : 0), 0);
      log(`Atribuídas ${totalAssigned} rotas a ${operationalVehicles.length} viaturas (maxPorViatura=${maxPerVehicle}, reuse=${allowRouteReuse}).`);
      console.log('Atribuições por viatura (exemplo):', operationalVehicles.map(v => ({ code: v.code, assigned: (v.assignedRoutes||[]).length })));
    }

    /**
     * Constrói segmentos (array de {coords, distance_m, duration_s, isPickup}) a partir das rotas atribuídas a uma viatura.
     * Usa a geometria das rotas (assume que a rota em routesFeatures é do ecoponto -> depósito).
     */
    function buildVehiclePathSegmentsFromAssignedRoutes(vehicle) {
      const segments = [];
      if (!vehicle || !Array.isArray(vehicle.assignedRoutes) || vehicle.assignedRoutes.length === 0) return segments;

      for (const route of vehicle.assignedRoutes) {
        if (!route || !route.geometry || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length === 0) {
          console.warn('Rota inválida atribuída a', vehicle.code, route);
          continue;
        }
        const coords = route.geometry.coordinates; // normalmente [ [lon,lat], ... ] do ecoponto -> depósito
        // depot -> ecoponto: reverse(coords)
        const rev = coords.slice().reverse();
        segments.push({
          coords: rev,
          distance_m: route.properties && route.properties.distance_m,
          duration_s: route.properties && route.properties.duration_s,
          isPickup: true
        });
        // ecoponto -> depósito
        segments.push({
          coords: coords,
          distance_m: route.properties && route.properties.distance_m,
          duration_s: route.properties && route.properties.duration_s,
          isPickup: false
        });
      }

      return segments;
    }
    // ===== Funções para adicionar ecopontos manualmente =====

let addEcopontoMode = false;
let addEcopontoTempMarker = null;

// Ativa/desativa o modo de adicionar ecoponto
function toggleAddEcopontoMode() {
  addEcopontoMode = !addEcopontoMode;
  const btn = document.getElementById('addEcopontoBtn');
  if (addEcopontoMode) {
    btn.classList.add('active');
    btn.textContent = 'Cancelar adicionar';
    setStatus('Modo: adicionar ecoponto — clique no mapa para posicionar');
    log('Modo de adição de ecoponto ativado. Clique no mapa para posicionar o novo ecoponto.');
  } else {
    btn.classList.remove('active');
    btn.textContent = 'Adicionar ecoponto';
    setStatus('pronto');
    if (addEcopontoTempMarker) { map.removeLayer(addEcopontoTempMarker); addEcopontoTempMarker = null; }
    log('Modo de adição de ecoponto cancelado.');
  }
}

// Handler de clique no mapa quando em modo de adição
function onMapClickAddEcoponto(e) {
  if (!addEcopontoMode) return;
  // remover marcador temporário anterior
  if (addEcopontoTempMarker) { map.removeLayer(addEcopontoTempMarker); addEcopontoTempMarker = null; }

  // criar marcador temporário
  addEcopontoTempMarker = L.marker(e.latlng, { draggable: true }).addTo(map);
  addEcopontoTempMarker.bindPopup(buildEcopontoFormHtml(), { minWidth: 260 }).openPopup();

  // quando o popup abre, ligar listeners do formulário
  setTimeout(() => {
    attachEcopontoFormHandlers(addEcopontoTempMarker);
  }, 50);
}

// HTML do formulário (simples)
function buildEcopontoFormHtml() {
  return `
    <div style="font-size:0.9rem">
      <div style="margin-bottom:6px"><strong>Criar ecoponto</strong></div>
      <label style="display:block;margin-bottom:6px">Código<br/><input id="new_ep_codigo" style="width:100%;padding:6px" placeholder="ex.: EP001"></label>
      <label style="display:block;margin-bottom:6px">Tipo<br/>
        <select id="new_ep_tipo" style="width:100%;padding:6px">
          <option value="plastico">Plástico</option>
          <option value="papel">Papel</option>
          <option value="metal">Metal</option>
          <option value="vidro">Vidro</option>
          <option value="indiferenciado">Indiferenciado</option>
        </select>
      </label>
      <label style="display:block;margin-bottom:6px">Nível (%)<br/><input id="new_ep_nivel" type="number" min="0" max="100" style="width:100%;padding:6px" placeholder="ex.: 85"></label>
      <label style="display:block;margin-bottom:6px">Condição<br/>
        <select id="new_ep_cond" style="width:100%;padding:6px">
          <option value="operacional">Operacional</option>
          <option value="danificado">Danificado</option>
        </select>
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:6px">
        <button id="cancelNewEcoponto" style="padding:6px 8px;border-radius:6px;border:1px solid #ccc;background:#fff">Cancelar</button>
        <button id="saveNewEcoponto" style="padding:6px 8px;border-radius:6px;border:1px solid #0b7;background:#0b7;color:#fff">Criar</button>
      </div>
    </div>
  `;
}

// Ligar handlers do formulário dentro do popup do marcador temporário
function attachEcopontoFormHandlers(marker) {
  const popupEl = marker.getPopup().getElement();
  if (!popupEl) return;
  const btnSave = popupEl.querySelector('#saveNewEcoponto');
  const btnCancel = popupEl.querySelector('#cancelNewEcoponto');

  if (btnCancel) btnCancel.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (addEcopontoTempMarker) { map.removeLayer(addEcopontoTempMarker); addEcopontoTempMarker = null; }
    toggleAddEcopontoMode(); // sair do modo
  });

  if (btnSave) btnSave.addEventListener('click', (ev) => {
    ev.preventDefault();
    // ler valores
    const codigo = (popupEl.querySelector('#new_ep_codigo').value || '').toString().trim();
    const tipo = (popupEl.querySelector('#new_ep_tipo').value || 'indiferenciado').toString();
    const nivelRaw = popupEl.querySelector('#new_ep_nivel').value;
    const nivel = nivelRaw === '' ? null : Number(nivelRaw);
    const cond = (popupEl.querySelector('#new_ep_cond').value || 'operacional').toString();

    // validações mínimas
    if (!codigo) { alert('Forneça um código para o ecoponto.'); return; }
    if (!marker) { alert('Marcador não encontrado.'); return; }

    // construir feature GeoJSON
    const latlng = marker.getLatLng();
    const feat = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [ Number(latlng.lng), Number(latlng.lat) ] },
      properties: {
        codigo: codigo,
        tipo: tipo,
        nivel: nivel,
        operacional: (cond === 'operacional'),
        // outros campos úteis
        criado_por: 'manual',
        criado_em: new Date().toISOString()
      }
    };

    // garantir lastGeoJSON existe
    if (!lastGeoJSON) {
      lastGeoJSON = { type: 'FeatureCollection', features: [] };
    } else if (!Array.isArray(lastGeoJSON.features)) {
      lastGeoJSON.features = [];
    }

    // anotar estado/cheio/estado_text/condicao_text para a feature nova
    // reutiliza annotateStatesByThreshold (assume que existe)
    annotateStatesByThreshold({ type: 'FeatureCollection', features: [feat] });

    // adicionar ao lastGeoJSON e re-renderizar
    lastGeoJSON.features.push(feat);
    log(`Ecoponto criado: ${codigo} (${tipo}) em ${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}.`);
    // remover marcador temporário e re-renderizar
    if (addEcopontoTempMarker) { map.removeLayer(addEcopontoTempMarker); addEcopontoTempMarker = null; }
    // atualizar UI: repopular estados, contadores e desenhar
    populateStates(lastGeoJSON.features);
    renderEcopontos();
    // sair do modo de adição
    toggleAddEcopontoMode();
  });
}

// ligar o clique no mapa (delegado) — adiciona listener global uma vez
if (!window._addEcopontoMapListenerAttached) {
  map.on('click', onMapClickAddEcoponto);
  window._addEcopontoMapListenerAttached = true;
}

// ligar botão
const addEcopontoBtn = document.getElementById('addEcopontoBtn');
if (addEcopontoBtn) addEcopontoBtn.addEventListener('click', () => toggleAddEcopontoMode());

// ===== Fim das funções de adição manual =====
loadEcopontosFromServer();



