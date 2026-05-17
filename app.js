// ── CONFIG ────────────────────────────────────────────────────────────────────
const CFG_KEY = 'caja_config';
const DATA_FILE = 'datos.json';

let cfg = null;
let movimientos = [];
let sha = null;
let chart = null;

function getConfig() {
  try { return JSON.parse(localStorage.getItem(CFG_KEY)); } catch(e) { return null; }
}

function saveConfig(c) {
  localStorage.setItem(CFG_KEY, JSON.stringify(c));
}

function apiURL() {
  return `https://api.github.com/repos/${cfg.user}/${cfg.repo}/contents/${DATA_FILE}`;
}

function apiHeaders() {
  return {
    'Authorization': `token ${cfg.token}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json'
  };
}

// ── MODAL SETUP ───────────────────────────────────────────────────────────────
function guardarConfig() {
  const user  = document.getElementById('cfg-user').value.trim();
  const repo  = document.getElementById('cfg-repo').value.trim();
  const token = document.getElementById('cfg-token').value.trim();
  if (!user || !repo || !token) { toast('Completá todos los campos'); return; }
  cfg = { user, repo, token };
  saveConfig(cfg);
  document.getElementById('setup-modal').classList.add('hidden');
  toast('Configuración guardada');
  cargarDatos();
}

function abrirConfig() {
  const m = document.getElementById('setup-modal');
  m.classList.remove('hidden');
  if (cfg) {
    document.getElementById('cfg-user').value  = cfg.user;
    document.getElementById('cfg-repo').value  = cfg.repo;
    document.getElementById('cfg-token').value = cfg.token;
  }
}

// ── GITHUB API ────────────────────────────────────────────────────────────────
async function cargarDatos() {
  setSaving('Cargando datos de GitHub...');
  try {
    const res = await fetch(apiURL(), { headers: apiHeaders() });
    if (res.status === 404) {
      // Archivo no existe aún, empezar vacío
      movimientos = [];
      sha = null;
      setSaving('');
      render();
      return;
    }
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    sha = data.sha;
    const decoded = atob(data.content.replace(/\n/g, ''));
    movimientos = JSON.parse(decoded) || [];
    setSaving('');
    render();
  } catch(e) {
    setSaving('Error al cargar. Revisá la configuración.');
    console.error(e);
  }
}

async function guardarDatos() {
  setSaving('Guardando...');
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(movimientos, null, 2))));
  const body = {
    message: `Actualización ${new Date().toLocaleDateString('es-CR')}`,
    content,
    ...(sha ? { sha } : {})
  };
  try {
    const res = await fetch(apiURL(), {
      method: 'PUT',
      headers: apiHeaders(),
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const data = await res.json();
    sha = data.content.sha;
    setSaving('✓ Guardado en GitHub');
    setTimeout(() => setSaving(''), 2500);
  } catch(e) {
    setSaving('Error al guardar. Intentá de nuevo.');
    console.error(e);
  }
}

// ── MOVIMIENTOS ───────────────────────────────────────────────────────────────
function agregar(tipo) {
  const fecha   = document.getElementById('input-fecha').value;
  const monto   = parseFloat(document.getElementById('input-monto').value);
  const detalle = document.getElementById('input-detalle').value.trim();
  if (!fecha)           { toast('Seleccioná una fecha'); return; }
  if (!monto || monto <= 0) { toast('Ingresá un monto válido'); return; }
  if (!detalle)         { toast('Escribí un detalle'); return; }

  movimientos.push({ id: Date.now(), fecha, monto, detalle, tipo });
  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  document.getElementById('input-monto').value   = '';
  document.getElementById('input-detalle').value = '';

  render();
  guardarDatos();
  toast(tipo === 'ingreso' ? '✓ Ingreso registrado' : '✓ Egreso registrado');
}

function eliminar(id) {
  if (!confirm('¿Eliminar este movimiento?')) return;
  movimientos = movimientos.filter(m => m.id !== id);
  render();
  guardarDatos();
  toast('Movimiento eliminado');
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function fmt(n) {
  return '₡' + Math.round(n).toLocaleString('es-CR');
}

function render() {
  renderSaldo();
  renderMes();
  renderFiltros();
  renderChart();
  renderLista();
}

function renderSaldo() {
  const ings = movimientos.filter(m => m.tipo === 'ingreso');
  const egs  = movimientos.filter(m => m.tipo === 'egreso');
  const totalIng = ings.reduce((s, m) => s + m.monto, 0);
  const totalEg  = egs.reduce((s, m) => s + m.monto, 0);
  const saldo    = totalIng - totalEg;

  const el = document.getElementById('saldo-display');
  el.textContent = fmt(saldo);
  el.className = 'saldo-monto ' + (saldo >= 0 ? 'pos' : 'neg');

  const hoy = new Date().toLocaleDateString('es-CR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  document.getElementById('saldo-fecha').textContent = hoy;

  document.getElementById('stat-ing').textContent = fmt(totalIng);
  document.getElementById('stat-eg').textContent  = fmt(totalEg);

  const maxIng = ings.length ? Math.max(...ings.map(m => m.monto)) : 0;
  const maxEg  = egs.length  ? Math.max(...egs.map(m => m.monto))  : 0;
  const avgIng = ings.length ? totalIng / ings.length : 0;
  const avgEg  = egs.length  ? totalEg  / egs.length  : 0;

  document.getElementById('stat-max-ing').textContent = fmt(maxIng);
  document.getElementById('stat-max-eg').textContent  = fmt(maxEg);
  document.getElementById('stat-avg-ing').textContent = fmt(avgIng);
  document.getElementById('stat-avg-eg').textContent  = fmt(avgEg);
}

function renderMes() {
  const hoy   = new Date();
  const mes   = hoy.getMonth();
  const anio  = hoy.getFullYear();
  const nombre = hoy.toLocaleDateString('es-CR', { month: 'long', year: 'numeric' });

  const delMes = movimientos.filter(m => {
    const d = new Date(m.fecha + 'T12:00:00');
    return d.getMonth() === mes && d.getFullYear() === anio;
  });

  const ings = delMes.filter(m => m.tipo === 'ingreso');
  const egs  = delMes.filter(m => m.tipo === 'egreso');
  const totalIng = ings.reduce((s,m) => s+m.monto, 0);
  const totalEg  = egs.reduce((s,m)  => s+m.monto, 0);
  const balance  = totalIng - totalEg;

  document.getElementById('mes-titulo').textContent = nombre.charAt(0).toUpperCase() + nombre.slice(1);
  document.getElementById('mes-ing').textContent    = fmt(totalIng);
  document.getElementById('mes-eg').textContent     = fmt(totalEg);

  const balEl = document.getElementById('mes-balance');
  balEl.textContent = fmt(balance);
  balEl.style.color = balance >= 0 ? 'var(--green)' : 'var(--red)';

  document.getElementById('mes-ing-count').textContent = ings.length + ' movimiento' + (ings.length !== 1 ? 's' : '');
  document.getElementById('mes-eg-count').textContent  = egs.length + ' movimiento'  + (egs.length  !== 1 ? 's' : '');
  document.getElementById('mes-total-count').textContent = delMes.length + ' en total';
}

function renderFiltros() {
  const anios = [...new Set(movimientos.map(m => m.fecha.split('-')[0]))].sort((a,b) => b-a);

  const selMes  = document.getElementById('filtro-mes');
  const selAnio = document.getElementById('filtro-anio');
  const chartAnio = document.getElementById('chart-anio');

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  selMes.innerHTML = '<option value="todos">Todos los meses</option>' +
    meses.map((m,i) => `<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('');

  selAnio.innerHTML = '<option value="todos">Todos los años</option>' +
    anios.map(a => `<option value="${a}">${a}</option>`).join('');

  const anioActual = new Date().getFullYear().toString();
  chartAnio.innerHTML = anios.map(a => `<option value="${a}" ${a===anioActual?'selected':''}>${a}</option>`).join('');
  if (!anios.includes(anioActual) && anios.length) chartAnio.value = anios[0];
}

function renderChart() {
  const anio = document.getElementById('chart-anio')?.value || new Date().getFullYear().toString();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  const ings = Array(12).fill(0);
  const egs  = Array(12).fill(0);

  movimientos.forEach(m => {
    const [a, mes] = m.fecha.split('-');
    if (a !== anio) return;
    const idx = parseInt(mes) - 1;
    if (m.tipo === 'ingreso') ings[idx] += m.monto;
    else egs[idx] += m.monto;
  });

  const ctx = document.getElementById('grafica').getContext('2d');
  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: meses,
      datasets: [
        {
          label: 'Ingresos',
          data: ings,
          backgroundColor: '#c8e6d4',
          borderColor: '#2a6041',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Egresos',
          data: egs,
          backgroundColor: '#f5c8ce',
          borderColor: '#8b2030',
          borderWidth: 1.5,
          borderRadius: 4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { font: { family: 'DM Sans', size: 11 }, boxWidth: 12, padding: 16 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ' ' + fmt(ctx.raw)
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'DM Mono', size: 10 } } },
        y: {
          grid: { color: '#eeece8' },
          ticks: {
            font: { family: 'DM Mono', size: 10 },
            callback: v => '₡' + (v/1000).toLocaleString('es-CR') + 'k'
          }
        }
      }
    }
  });
}

function renderLista() {
  const busqueda = document.getElementById('filtro-busqueda').value.toLowerCase();
  const tipo     = document.getElementById('filtro-tipo').value;
  const mes      = document.getElementById('filtro-mes').value;
  const anio     = document.getElementById('filtro-anio').value;

  let filtrados = movimientos.filter(m => {
    if (tipo !== 'todos' && m.tipo !== tipo) return false;
    const [a, mm] = m.fecha.split('-');
    if (anio !== 'todos' && a !== anio) return false;
    if (mes  !== 'todos' && mm !== mes) return false;
    if (busqueda && !m.detalle.toLowerCase().includes(busqueda)) return false;
    return true;
  });

  const lista = document.getElementById('mov-list');

  if (filtrados.length === 0) {
    lista.innerHTML = '<div class="empty">No hay movimientos que coincidan con los filtros.</div>';
    return;
  }

  lista.innerHTML = filtrados.map(m => {
    const d = new Date(m.fecha + 'T12:00:00');
    const fechaFmt = d.toLocaleDateString('es-CR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    const signo = m.tipo === 'ingreso' ? '+' : '−';
    const cls   = m.tipo === 'ingreso' ? 'ing' : 'eg';
    return `<div class="mov-item">
      <div class="mov-barra ${cls}"></div>
      <div class="mov-body">
        <div class="mov-fecha">${fechaFmt}</div>
        <div class="mov-detalle">${m.detalle}</div>
      </div>
      <div class="mov-right">
        <span class="mov-monto ${cls}">${signo}${fmt(m.monto)}</span>
        <button class="del-btn" onclick="eliminar(${m.id})" title="Eliminar">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ── EXPORT CSV ────────────────────────────────────────────────────────────────
function exportarCSV() {
  if (!movimientos.length) { toast('No hay movimientos para exportar'); return; }

  const totalIng = movimientos.filter(m => m.tipo==='ingreso').reduce((s,m)=>s+m.monto,0);
  const totalEg  = movimientos.filter(m => m.tipo==='egreso').reduce((s,m)=>s+m.monto,0);

  let csv = 'Fecha,Tipo,Monto (₡),Detalle\n';
  [...movimientos]
    .sort((a,b) => a.fecha.localeCompare(b.fecha))
    .forEach(m => {
      const det = '"' + m.detalle.replace(/"/g,'""') + '"';
      const tipo = m.tipo === 'ingreso' ? 'Ingreso' : 'Egreso';
      csv += `${m.fecha},${tipo},${m.monto},${det}\n`;
    });
  csv += `\nTotal ingresos,,${totalIng},\n`;
  csv += `Total egresos,,${totalEg},\n`;
  csv += `Saldo final,,${totalIng - totalEg},\n`;

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'caja_alabanza_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('CSV exportado');
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function setSaving(msg) {
  document.getElementById('saving-indicator').textContent = msg;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.getElementById('input-fecha').value = new Date().toISOString().split('T')[0];

cfg = getConfig();
if (!cfg) {
  document.getElementById('setup-modal').classList.remove('hidden');
} else {
  document.getElementById('setup-modal').classList.add('hidden');
  cargarDatos();
}
