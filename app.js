// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const N8N_GET_PECAS_URL = 'http://192.168.18.190:5678/webhook/da1a3dc7-b5ca-46ff-9ced-600102b22bec';
const N8N_BUSCA_UNICA_URL = 'http://192.168.18.190:5678/webhook/0284da8b-9bc6-43d3-83e7-d3cd1b1e9c13'; // NOVO WEBHOOK PARA URGÊNCIAS
const N8N_POST_SCANS_URL = 'http://192.168.18.190:5678/webhook/dd0a9938-fd80-4308-8ecc-c317b61a032e'; 
const N8N_POST_RETRABALHO_URL = 'http://192.168.18.190:5678/webhook/571327b7-0de9-46ac-b5ae-e7e645134380'; 

// ============================================================================
// CONSTANTES DE NOMES DE CAMPOS e CORES
// ============================================================================
const FIELD_CODIGO_BIPAGEM = 'CODIGO_BIPAGEM_TXT';
const FIELD_CODIGO_USI_1 = 'CODIGO_BIPAGEM_USI_1_TXT'; 
const FIELD_CODIGO_USI_2 = 'CODIGO_BIPAGEM_USI_2_TXT'; 
const FIELD_CODIGO_USI_3 = 'CODIGO_BIPAGEM_USI_3_TXT'; 

const FIELD_NOME_PECA = 'CHAVE_PEÇAS_FX';
const FIELD_CLIENTE_AMBIENTE = 'CLIENTE_AMBIENTE_LKP'; 
const FIELD_NOME_MAQUINA_LKP = 'NOME_MAQUINA_LKP'; 
const FIELD_CLIENTE_FABRICANDO = 'CLIENTE_AMBIENTE_LKP';
const FIELD_AMBIENTE_COMPLETO = 'ITEM+MODULO_FX';

const FIELD_REQ_FILETACAO = 'PEÇA_FILETAÇÃO_NUM';
const FIELD_REQ_CNC = 'PEÇA_USINAGEM_CNC_NUM';

const FIELD_STATUS_NEST_TXT = 'BIPAGEM_NEST_TXT';
const FIELD_STATUS_SECC_TXT = 'BIPAGEM_SECC_TXT';
const FIELD_STATUS_COLADEIRA_TXT = 'BIPAGEM_COLADEIRA_TXT';
const FIELD_STATUS_HOLZER_TXT = 'BIPAGEM_HOLZER_TXT';
const FIELD_STATUS_PREMONTAGEM_TXT = 'BIPAGEM_PREMONTAGEM_TXT'; 

const MODE_COLORS = {
    nesting: 'var(--nesting-color)',
    seccionadora: 'var(--seccionadora-color)',
    coladeira: 'var(--coladeira-color)',
    holzer: 'var(--holzer-color)',
    premontagem: 'var(--premontagem-color)',
    rebalho: 'var(--rebalho-color)',
    default: 'var(--text-color)'
};

// ============================================================================
// VARIÁVEIS GLOBAIS DE ESTADO
// ============================================================================
let pecasEmMemoria = [];
let pecasMap = new Map(); // [ADICIONADO] Para busca ultra-rápida O(1)
let sessionScanCount = 0;
let currentMode = null;
let currentModeDisplay = 'Nenhum';
let currentClienteAmbiente = null; 
let feedbackTimer = null;
let isCacheSyncing = false; 
let isScanSyncing = false; 

let selectedClientFilter = null; 
let selectedModules = [];        

// ============================================================================
// MAPEAMENTO DOS ELEMENTOS DA INTERFACE (DOM)
// ============================================================================
const mainTitle = document.getElementById('main-title');
const serviceSelectionMenu = document.getElementById('service-selection-menu');
const mainInterface = document.getElementById('main-interface');
const serviceButtons = document.querySelectorAll('#service-selection-menu .button-service');
const currentModeDisplayEl = document.getElementById('current-mode-display');
const currentClienteDisplayEl = document.getElementById('current-cliente-display'); 
const barcodeInput = document.getElementById('barcode-input');
const scanForm = document.getElementById('scan-form');
const feedbackArea = document.getElementById('feedback-area');
const pendingCountEl = document.getElementById('pending-count');
const pendingCountSyncBtn = document.getElementById('pending-count-sync-btn');
const btnSyncCache = document.getElementById('btn-sync-cache');
const statusOnlineEl = document.getElementById('status-online');
const lastScansList = document.getElementById('last-scans-list');
const sessionCountEl = document.getElementById('session-scan-count');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

const deleteModal = document.getElementById('delete-modal');
const closeDeleteModalBtn = document.getElementById('close-delete-modal');
const pendingScansListDelete = document.getElementById('pending-scans-list-delete');
const btnDeleteSelected = document.getElementById('btn-delete-selected');
const btnDeleteAllPending = document.getElementById('btn-delete-all-pending');
const btnOpenMenu = document.getElementById('btn-open-menu');
const btnCloseMenu = document.getElementById('btn-close-menu');
const sidebarNav = document.getElementById('sidebar-nav');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const btnSyncScans = document.getElementById('btn-sync-scans');
const btnManagePending = document.getElementById('btn-manage-pending');
const btnClearCache = document.getElementById('btn-clear-cache');
const btnChangeService = document.getElementById('btn-change-service');

const premontagemControls = document.getElementById('premontagem-controls');
const btnSelectModules = document.getElementById('btn-select-modules');
const moduleModal = document.getElementById('module-modal');
const closeModuleModalBtn = document.getElementById('close-module-modal');
const modalClientSelect = document.getElementById('modal-client-select'); 
const moduleListContainer = document.getElementById('module-list');
const btnConfirmModules = document.getElementById('btn-confirm-modules');
const btnSelectAllModules = document.getElementById('btn-select-all-modules');
const moduleSearchInput = document.getElementById('module-search');
const activeFilterDisplay = document.getElementById('active-filter-display');


// ============================================================================
// BANCO DE DADOS LOCAL (INDEXEDDB)
// ============================================================================
async function getDb() {
    return idb.openDB('bipagem-db', 1, {
        upgrade(db) {
            console.log("Executando upgrade do IndexedDB...");
            if (!db.objectStoreNames.contains('pecas_cache')) {
                db.createObjectStore('pecas_cache', { keyPath: FIELD_CODIGO_BIPAGEM });
            }
            if (!db.objectStoreNames.contains('pending_scans')) {
                db.createObjectStore('pending_scans', { autoIncrement: true, keyPath: 'id' });
            }
        },
    });
}

// ============================================================================
// CONTROLE DE VISIBILIDADE DAS INTERFACES E ESTADO
// ============================================================================
function showInterface(interfaceToShow) {
    mainTitle.style.display = 'none';
    serviceSelectionMenu.style.display = 'none';
    mainInterface.style.display = 'none';
    progressSection.style.display = 'none';
    premontagemControls.style.display = 'none'; 
    
    if (interfaceToShow === 'main' && currentMode) {
        mainInterface.style.display = 'block';
        currentModeDisplayEl.textContent = currentModeDisplay;
        
        if (currentMode === 'rebalho') {
            currentModeDisplayEl.style.color = 'var(--rebalho-color)';
        } else {
            currentModeDisplayEl.style.color = MODE_COLORS[currentMode] || MODE_COLORS.default;
        }

        if (currentMode === 'premontagem') {
            premontagemControls.style.display = 'block';
            if(!selectedClientFilter) {
                 displayFeedback("ATENÇÃO: Selecione Cliente e Item/Módulo para iniciar.", "warning");
            }
        }
        
        if (currentMode === 'rebalho') {
            progressText.textContent = 'Modo Retrabalho Ativo (Bipagem Livre)';
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = 'var(--rebalho-color)';
            progressSection.style.display = 'block';
        } else {
            progressText.textContent = 'Aguardando bipagem...';
            progressBar.style.width = '0%';
        }
        
        updateSessionCounterUI();
        updateUI();
        barcodeInput.focus();
    } else { 
        mainTitle.style.display = 'block'; 
        serviceSelectionMenu.style.display = 'block'; 
        mainInterface.style.display = 'none'; 
        resetSelections();
        displayFeedback('Selecione um serviço para começar.', 'info');
    }
}

function resetSelections() {
    currentMode = null;
    currentModeDisplay = 'Nenhum';
    currentClienteAmbiente = null;
    sessionScanCount = 0;
    selectedClientFilter = null;
    selectedModules = []; 
    activeFilterDisplay.style.display = 'none';
    if(currentClienteDisplayEl) currentClienteDisplayEl.textContent = '--';
}

function openSidebar() { sidebarNav.classList.add('open'); sidebarOverlay.classList.add('open'); }
function closeSidebar() { sidebarNav.classList.remove('open'); sidebarOverlay.classList.remove('open'); }

// ============================================================================
// INICIALIZAÇÃO DO APP
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM carregado. Iniciando PWA...");
    registerServiceWorker();

    serviceButtons.forEach(button => { button.addEventListener('click', () => { selectMode(button.dataset.mode, button.dataset.display); }); });
    scanForm.addEventListener('submit', handleScan);
    btnSyncCache.addEventListener('click', () => syncPecasCache(false));
    window.addEventListener('online', () => updateOnlineStatus(true));
    window.addEventListener('offline', () => updateOnlineStatus(false));

    btnOpenMenu.addEventListener('click', openSidebar);
    btnCloseMenu.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', () => { closeSidebar(); });
    
    btnSyncScans.addEventListener('click', () => { closeSidebar(); syncPendingScans(false); });
    btnManagePending.addEventListener('click', () => { closeSidebar(); openDeleteModal(); });
    btnClearCache.addEventListener('click', () => { closeSidebar(); clearPartsCache(); });
    btnChangeService.addEventListener('click', () => { closeSidebar(); showInterface('menu'); });

    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    btnDeleteSelected.addEventListener('click', deleteSelectedScans);
    btnDeleteAllPending.addEventListener('click', clearAllPendingScans);

    btnSelectModules.addEventListener('click', openModuleModal);
    closeModuleModalBtn.addEventListener('click', closeModuleModal);
    btnConfirmModules.addEventListener('click', confirmModuleSelection);
    btnSelectAllModules.addEventListener('click', selectAllModulesInModal);
    moduleSearchInput.addEventListener('keyup', filterModuleList);
    
    modalClientSelect.addEventListener('change', (e) => {
        populateModuleList(e.target.value);
    });

    window.addEventListener('click', (event) => { 
        if (event.target == deleteModal) closeDeleteModal(); 
        if (event.target == moduleModal) closeModuleModal();
    });
    
    updateOnlineStatus(navigator.onLine);
    resetSelections();
    showInterface('menu');
    await loadPecasFromDbToMemory();
    await updateUI();

    setInterval(async () => { if (!navigator.onLine || isCacheSyncing) return; await syncPecasCache(true); }, 300000); 
    setInterval(async () => { if (!navigator.onLine || isScanSyncing) return; await syncPendingScans(true); }, 600000); 
});

function selectMode(modeValue, modeDisplayName) {
    currentMode = modeValue;
    currentModeDisplay = modeDisplayName;
    sessionScanCount = 0;
    showInterface('main');
}

// ============================================================================
// LÓGICA DE MÓDULOS (PRE-MONTAGEM)
// ============================================================================
function extractSafeValue(val) {
    if (Array.isArray(val) && val.length > 0) return String(val[0]).trim();
    if (val) return String(val).trim();
    return "";
}

function openModuleModal() {
    if (pecasEmMemoria.length === 0) {
        alert("Nenhuma peça carregada. Atualize a lista primeiro.");
        return;
    }
    const clientesSet = new Set();
    pecasEmMemoria.forEach(p => {
        const cli = extractSafeValue(p[FIELD_CLIENTE_FABRICANDO]);
        if (cli) clientesSet.add(cli);
    });
    const clientesOrdenados = Array.from(clientesSet).sort();
    modalClientSelect.innerHTML = '<option value="">-- Selecione o Cliente --</option>';
    clientesOrdenados.forEach(cli => {
        const option = document.createElement('option');
        option.value = cli;
        option.textContent = cli;
        modalClientSelect.appendChild(option);
    });
    moduleListContainer.innerHTML = '<li style="text-align: center; color: #888; padding: 20px;">Selecione um cliente acima...</li>';
    if (selectedClientFilter && clientesSet.has(selectedClientFilter)) {
        modalClientSelect.value = selectedClientFilter;
        populateModuleList(selectedClientFilter); 
    }
    moduleModal.style.display = "block";
}

function populateModuleList(clienteSelecionado) {
    moduleListContainer.innerHTML = '';
    if (!clienteSelecionado) {
        moduleListContainer.innerHTML = '<li style="text-align: center; color: #888;">Selecione um cliente acima...</li>';
        return;
    }
    const pecasDoCliente = pecasEmMemoria.filter(p => extractSafeValue(p[FIELD_CLIENTE_FABRICANDO]) === clienteSelecionado);
    if (pecasDoCliente.length === 0) {
        moduleListContainer.innerHTML = '<li>Nenhuma peça encontrada para este cliente.</li>';
        return;
    }
    const moduleStats = {};
    pecasDoCliente.forEach(p => {
        const rawModName = p[FIELD_AMBIENTE_COMPLETO] ? String(p[FIELD_AMBIENTE_COMPLETO]).trim() : "";
        const modName = rawModName.length > 0 ? rawModName : "(Sem Item/Módulo Definido)";
        if (!moduleStats[modName]) moduleStats[modName] = { total: 0, done: 0 };
        moduleStats[modName].total++;
        if (p[FIELD_STATUS_PREMONTAGEM_TXT] && p[FIELD_STATUS_PREMONTAGEM_TXT].trim() !== '') {
            moduleStats[modName].done++;
        }
    });
    const modulesNames = Object.keys(moduleStats).sort();
    modulesNames.forEach((modName, index) => {
        const stats = moduleStats[modName];
        const li = document.createElement('li');
        const isChecked = (selectedClientFilter === clienteSelecionado && selectedModules.includes(modName));
        const progressLabel = `<span style="font-size: 0.8em; color: #888; margin-left: 5px;">(${stats.done}/${stats.total})</span>`;
        const style = (stats.done >= stats.total && stats.total > 0) ? 'color: var(--status-online); text-decoration: line-through;' : '';
        li.innerHTML = `
            <input type="checkbox" id="mod-${index}" value="${modName}" ${isChecked ? 'checked' : ''}>
            <label for="mod-${index}" style="${style}">${modName} ${progressLabel}</label>
        `;
        moduleListContainer.appendChild(li);
    });
}

function closeModuleModal() { moduleModal.style.display = "none"; }

function filterModuleList() {
    const term = moduleSearchInput.value.toLowerCase();
    const items = moduleListContainer.querySelectorAll('li');
    items.forEach(li => {
        const text = li.textContent.toLowerCase();
        li.style.display = text.includes(term) ? 'flex' : 'none';
    });
}

function selectAllModulesInModal() {
    const checkboxes = moduleListContainer.querySelectorAll('input[type="checkbox"]');
    const visibleCheckboxes = Array.from(checkboxes).filter(cb => cb.parentElement.style.display !== 'none');
    const allChecked = visibleCheckboxes.every(cb => cb.checked);
    visibleCheckboxes.forEach(cb => cb.checked = !allChecked);
}

function confirmModuleSelection() {
    const cliente = modalClientSelect.value;
    if (!cliente) { alert("Por favor, selecione um Cliente."); return; }
    const checkboxes = moduleListContainer.querySelectorAll('input[type="checkbox"]:checked');
    const modulos = Array.from(checkboxes).map(cb => cb.value);
    if (modulos.length === 0) {
        if(!confirm("Nenhum item/módulo selecionado. Deseja limpar o filtro?")) return;
        selectedClientFilter = null;
        selectedModules = [];
    } else {
        selectedClientFilter = cliente;
        selectedModules = modulos;
    }
    closeModuleModal();
    updateFilterUI();
    updateProgressUI();
}

function updateFilterUI() {
    if (selectedClientFilter) {
        if(currentClienteDisplayEl) currentClienteDisplayEl.textContent = selectedClientFilter;
        activeFilterDisplay.innerHTML = `Filtro: <strong>${selectedClientFilter}</strong> <br> ${selectedModules.length} Itens/Módulos ativos`;
        activeFilterDisplay.style.display = 'block';
        displayFeedback(`Filtro Aplicado: ${selectedModules.length} itens de ${selectedClientFilter}`, 'success');
    } else {
        if(currentClienteDisplayEl) currentClienteDisplayEl.textContent = "--";
        activeFilterDisplay.style.display = 'none';
        displayFeedback('Filtro removido. Selecione um cliente para trabalhar.', 'info');
    }
}

// ============================================================================
// FUNÇÕES AUXILIARES DE VERIFICAÇÃO E EXTRAÇÃO
// ============================================================================
function isProcessRequired(peca, mode) {
    if (!peca) return false;
    if (mode === 'rebalho') return true;
    const maquinaContains = (text) => 
        peca[FIELD_NOME_MAQUINA_LKP] && Array.isArray(peca[FIELD_NOME_MAQUINA_LKP])
        ? peca[FIELD_NOME_MAQUINA_LKP].some(m => String(m).toUpperCase().includes(text.toUpperCase()))
        : false;
    switch (mode) {
        case 'nesting': return maquinaContains("NANXING - NESTING");
        case 'seccionadora': return maquinaContains("SECCIONADORA");
        case 'coladeira': return Number(peca?.[FIELD_REQ_FILETACAO] || 0) > 0;
        case 'holzer': return Number(peca?.[FIELD_REQ_CNC] || 0) > 0;
        case 'premontagem': return true; 
        default: return false;
    }
}

function isProcessDone(peca, mode) {
    if (!peca) return false;
    if (mode === 'rebalho') return false;
    switch (mode) {
        case 'nesting':       return !!(peca?.[FIELD_STATUS_NEST_TXT]?.trim());
        case 'seccionadora':  return !!(peca?.[FIELD_STATUS_SECC_TXT]?.trim());
        case 'coladeira':     return !!(peca?.[FIELD_STATUS_COLADEIRA_TXT]?.trim());
        case 'holzer':        return !!(peca?.[FIELD_STATUS_HOLZER_TXT]?.trim());
        case 'premontagem':   return !!(peca?.[FIELD_STATUS_PREMONTAGEM_TXT]?.trim());
        default: return false;
    }
}

function extractClienteAmbiente(peca) {
    if (!peca || !peca[FIELD_CLIENTE_AMBIENTE]) return "Desconhecido";
    const clienteAmbienteArray = peca[FIELD_CLIENTE_AMBIENTE];
    return Array.isArray(clienteAmbienteArray) && clienteAmbienteArray.length > 0 ? String(clienteAmbienteArray[0]).trim() : "Desconhecido";
}

// ============================================================================
// [OTIMIZADO] CARREGAMENTO E MAPA DE BUSCA
// ============================================================================
async function loadPecasFromDbToMemory() {
    try {
        const db = await getDb();
        pecasEmMemoria = await db.getAll('pecas_cache') || [];
        
        // Criar Mapa de busca por todos os códigos possíveis para busca O(1)
        pecasMap.clear();
        pecasEmMemoria.forEach(p => {
            const cods = [p[FIELD_CODIGO_BIPAGEM], p[FIELD_CODIGO_USI_1], p[FIELD_CODIGO_USI_2], p[FIELD_CODIGO_USI_3]];
            cods.forEach(c => { if(c) pecasMap.set(String(c).trim(), p); });
        });
        console.log(`Carregadas ${pecasEmMemoria.length} peças p/ memória.`);
    } catch (error) { console.error("Erro memória:", error); pecasEmMemoria = []; }
}

// ============================================================================
// [OTIMIZADO] LÓGICA DE BIPAGEM COM BUSCA ON-DEMAND
// ============================================================================
async function handleScan(event) {
    event.preventDefault();
    const barcodeBipado = String(barcodeInput.value).trim();
    const selectedMode = currentMode;

    if (!selectedMode) { showInterface('menu'); return displayFeedback("ERRO: Selecione um Serviço.", 'error'); }
    if (!barcodeBipado) return barcodeInput.focus();

    // 1. TENTA BUSCAR NO MAPA LOCAL (ULTRA RÁPIDO)
    let pecaEncontrada = pecasMap.get(barcodeBipado);
    
    // 2. BUSCA "ON-DEMAND" SE NÃO ACHOU NO CACHE (Para peças urgentes)
    if (!pecaEncontrada && navigator.onLine) {
        displayFeedback("Buscando peça nova no servidor...", "loading");
        try {
            const res = await fetch(`${N8N_BUSCA_UNICA_URL}?codigo=${barcodeBipado}`);
            if (res.ok) {
                const pUrgente = await res.json();
                if (pUrgente && pUrgente[FIELD_CODIGO_BIPAGEM]) {
                    pecaEncontrada = pUrgente;
                    const db = await getDb();
                    await db.put('pecas_cache', pUrgente); 
                    await loadPecasFromDbToMemory(); 
                }
            }
        } catch (e) { console.error("Erro busca urgente:", e); }
    }

    if (!pecaEncontrada) {
        displayFeedback(`ERRO: Peça [${barcodeBipado}] não encontrada.`, 'error');
        barcodeInput.value = ''; return;
    }

    const codigoPrincipalPeca = pecaEncontrada[FIELD_CODIGO_BIPAGEM] || barcodeBipado;
    const nomePeca = pecaEncontrada[FIELD_NOME_PECA] || 'Nome não encontrado';
    const pecaClienteFilter = extractSafeValue(pecaEncontrada[FIELD_CLIENTE_FABRICANDO]);
    const rawPecaModulo = pecaEncontrada[FIELD_AMBIENTE_COMPLETO] ? String(pecaEncontrada[FIELD_AMBIENTE_COMPLETO]).trim() : "";
    const pecaModulo = rawPecaModulo.length > 0 ? rawPecaModulo : "(Sem Item/Módulo Definido)";

    const pecaClienteAmbiente = extractClienteAmbiente(pecaEncontrada);
    if (pecaClienteAmbiente !== currentClienteAmbiente) {
        currentClienteAmbiente = pecaClienteAmbiente;
        if(!selectedClientFilter && currentClienteDisplayEl) currentClienteDisplayEl.textContent = currentClienteAmbiente;
    }

    const isReq = isProcessRequired(pecaEncontrada, selectedMode);
    const isDone = isProcessDone(pecaEncontrada, selectedMode);
    let feedbackType = 'error';
    let feedbackMessage = "";
    let scanShouldBeSaved = false;

    if (selectedMode === 'premontagem') {
        if (!selectedClientFilter || selectedModules.length === 0) {
            displayFeedback(`BLOQUEADO: Selecione "Cliente e Módulos"!`, 'error');
            barcodeInput.value = ''; return;
        }
        if (pecaClienteFilter !== selectedClientFilter || !selectedModules.includes(pecaModulo)) {
            displayFeedback(`BLOQUEADO: Peça fora do filtro selecionado!`, 'error');
            barcodeInput.value = ''; return;
        }
    }

    if (!isReq) {
        if (selectedMode === 'holzer') {
            feedbackType = 'warning'; feedbackMessage = "Peça s/ CNC - Registrada como CNC.";
            scanShouldBeSaved = true; sessionScanCount++; 
            pecaEncontrada[FIELD_STATUS_HOLZER_TXT] = codigoPrincipalPeca;
        } else {
            feedbackType = 'info'; feedbackMessage = `INFO: Peça não requer ${selectedMode}.`;
            scanShouldBeSaved = false;
        }
    } 
    else if (isDone && selectedMode !== 'rebalho') {
        feedbackType = 'warning'; feedbackMessage = `AVISO: ${selectedMode.toUpperCase()} já realizado.`;
        scanShouldBeSaved = false;
    } 
    else {
        scanShouldBeSaved = true;
        sessionScanCount++; 
        if (selectedMode === 'rebalho') {
            feedbackType = 'warning'; feedbackMessage = `⚠ RETRABALHO GERADO: ${nomePeca}`;
        } else {
            feedbackType = 'success'; feedbackMessage = `OK: ${selectedMode.toUpperCase()} - ${nomePeca}`;
            const mapS = {nesting: FIELD_STATUS_NEST_TXT, seccionadora: FIELD_STATUS_SECC_TXT, coladeira: FIELD_STATUS_COLADEIRA_TXT, holzer: FIELD_STATUS_HOLZER_TXT, premontagem: FIELD_STATUS_PREMONTAGEM_TXT};
            if(mapS[selectedMode]) pecaEncontrada[mapS[selectedMode]] = codigoPrincipalPeca;
        }
    }

    displayFeedback(feedbackMessage, feedbackType);

    if (scanShouldBeSaved) {
        try {
            const db = await getDb();
            await db.add('pending_scans', { 
                pecaId: codigoPrincipalPeca, timestamp: new Date().toISOString(), 
                mode: selectedMode, encontrada: true, clienteAmbiente: pecaClienteFilter
            });
        } catch (error) { console.error("Erro scan pendente:", error); }
    }

    barcodeInput.value = ''; barcodeInput.focus(); 
    updateSessionCounterUI(); updateProgressUI(); updateUI();
}

// ============================================================================
// [OTIMIZADO] SINCRONIZAÇÃO INCREMENTAL
// ============================================================================
async function syncPecasCache(isSilent = false) {
    if (!navigator.onLine || isCacheSyncing) return;
    isCacheSyncing = true;
    if (!isSilent) displayFeedback('Buscando atualizações...', 'loading');
    
    const lastSync = localStorage.getItem('last_sync_timestamp') || '2024-01-01T00:00:00.000Z';

    try {
        const response = await fetch(`${N8N_GET_PECAS_URL}?modifiedSince=${encodeURIComponent(lastSync)}`);
        if (!response.ok) throw new Error(`Erro ${response.status}`);
        const pecas = await response.json();

        if (Array.isArray(pecas) && pecas.length > 0) {
            const db = await getDb();
            const tx = db.transaction('pecas_cache', 'readwrite');
            for (const p of pecas) {
                if (p[FIELD_CODIGO_BIPAGEM]) await tx.store.put(p);
            }
            await tx.done;
            localStorage.setItem('last_sync_timestamp', new Date().toISOString());
            await loadPecasFromDbToMemory();
            if (!isSilent) alert(`${pecas.length} registros atualizados!`);
        } else if (!isSilent) {
            displayFeedback('Tudo atualizado.', 'success');
        }
    } catch (error) {
        console.error("Erro sync cache:", error);
        if (!isSilent) alert(`Erro ao baixar: ${error.message}`);
    } finally { isCacheSyncing = false; }
}

// ============================================================================
// SINCRONIZAÇÃO DE SCANS PENDENTES
// ============================================================================
async function syncPendingScans(isSilent = false) {
    if (!navigator.onLine || isScanSyncing) return;
    const db = await getDb();
    const allScans = await db.getAll('pending_scans');
    if (allScans.length === 0) { if(!isSilent) alert('Nenhuma bipagem pendente.'); return; }

    isScanSyncing = true;
    if (!isSilent) displayFeedback(`Enviando ${allScans.length} bipagens...`, 'loading');
    
    try {
        const reworkScans = allScans.filter(s => s.mode === 'rebalho');
        const normalScans = allScans.filter(s => s.mode !== 'rebalho');
        let errorOccurred = false;

        if (normalScans.length > 0) {
            const r1 = await fetch(N8N_POST_SCANS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(normalScans) });
            if (!r1.ok) errorOccurred = true;
        }
        if (reworkScans.length > 0) {
            const r2 = await fetch(N8N_POST_RETRABALHO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reworkScans) });
            if (!r2.ok) errorOccurred = true;
        }

        if (!errorOccurred) {
            const tx = db.transaction('pending_scans', 'readwrite');
            await tx.store.clear(); await tx.done;
            if (!isSilent) { alert(`Sincronizado!`); displayFeedback('Dados sincronizados!', 'success'); }
            await updateUI();
        } else if (!isSilent) displayFeedback('Erro parcial no envio.', 'error');
    } catch (error) { console.error("Falha sync scans:", error); } finally { isScanSyncing = false; }
}

// ============================================================================
// FUNÇÕES DO MODAL E LIMPEZA
// ============================================================================
async function openDeleteModal() {
    pendingScansListDelete.innerHTML = '<li>Carregando pendentes...</li>';
    deleteModal.style.display = "block";
    await renderPendingScansForDeletion();
    barcodeInput.blur();
}

function closeDeleteModal() { deleteModal.style.display = "none"; if (currentMode) barcodeInput.focus(); }

async function renderPendingScansForDeletion() {
    try {
        const db = await getDb();
        const pendingScans = await db.getAll('pending_scans');
        pendingScansListDelete.innerHTML = '';
        if (pendingScans.length === 0) { pendingScansListDelete.innerHTML = '<li>Nenhuma bipagem pendente.</li>'; btnDeleteSelected.disabled = true; btnDeleteAllPending.disabled = true; return; }
        btnDeleteSelected.disabled = false; btnDeleteAllPending.disabled = false;
        pendingScans.sort((a, b) => b.id - a.id).forEach(scan => {
            const li = document.createElement('li');
            li.innerHTML = `<input type="checkbox" id="scan-${scan.id}" data-pecaid="${scan.pecaId}" data-mode="${scan.mode}" value="${scan.id}">
                            <label for="scan-${scan.id}">[${scan.mode.toUpperCase()}] ${scan.pecaId}</label>`;
            pendingScansListDelete.appendChild(li);
        });
    } catch (e) { console.error(e); }
}

async function deleteSelectedScans() {
    const selected = pendingScansListDelete.querySelectorAll('input[type="checkbox"]:checked');
    if (selected.length === 0) return;
    if (!confirm(`Excluir ${selected.length} itens?`)) return;
    try {
        const db = await getDb();
        const tx = db.transaction('pending_scans', 'readwrite');
        for (const cb of selected) {
            revertOptimisticUpdate(cb.dataset.pecaid, cb.dataset.mode);
            await tx.store.delete(parseInt(cb.value));
        }
        await tx.done;
        displayFeedback("Excluído com sucesso", "success");
        await renderPendingScansForDeletion(); await updateUI(); updateProgressUI();
    } catch (error) { console.error(error); }
}

async function clearAllPendingScans() {
    if (!confirm(`Excluir TODAS as bipagens pendentes?`)) return;
    try {
        const db = await getDb();
        const all = await db.getAll('pending_scans');
        all.forEach(s => revertOptimisticUpdate(s.pecaId, s.mode));
        const tx = db.transaction('pending_scans', 'readwrite');
        await tx.store.clear(); await tx.done;
        await renderPendingScansForDeletion(); await updateUI(); updateProgressUI();
    } catch (error) { console.error(error); }
}

async function clearPartsCache() {
    if (!confirm("Limpar cache local? Isso exigirá novo download total.")) return;
    try {
        const db = await getDb();
        const tx = db.transaction('pecas_cache', 'readwrite');
        await tx.store.clear(); await tx.done;
        pecasEmMemoria = []; pecasMap.clear();
        alert("Cache limpo."); showInterface('menu');
    } catch (error) { console.error(error); }
}

function revertOptimisticUpdate(pecaId, mode) {
    if (!pecaId || !mode || mode === 'rebalho') return;
    const peca = pecasEmMemoria.find(p => p[FIELD_CODIGO_BIPAGEM] === pecaId);
    if (!peca) return;
    const maps = {nesting: FIELD_STATUS_NEST_TXT, seccionadora: FIELD_STATUS_SECC_TXT, coladeira: FIELD_STATUS_COLADEIRA_TXT, holzer: FIELD_STATUS_HOLZER_TXT, premontagem: FIELD_STATUS_PREMONTAGEM_TXT};
    if(maps[mode]) peca[maps[mode]] = null;
}

// ============================================================================
// ATUALIZAÇÃO DE UI
// ============================================================================
function updateProgressUI() {
    if (currentMode === 'rebalho') return;
    const mode = currentMode;
    const modeDisplay = currentModeDisplay;
    if (!mode || pecasEmMemoria.length === 0) { progressSection.style.display = 'none'; return; }
    
    let pecasEscopo = pecasEmMemoria;
    let textoFiltro = "";

    if (currentMode === 'premontagem' && selectedClientFilter) {
        pecasEscopo = pecasEscopo.filter(p => {
            const mesmoCli = extractSafeValue(p[FIELD_CLIENTE_FABRICANDO]) === selectedClientFilter;
            const rawMod = p[FIELD_AMBIENTE_COMPLETO] ? String(p[FIELD_AMBIENTE_COMPLETO]).trim() : "(Sem Módulo)";
            return mesmoCli && selectedModules.includes(rawMod);
        });
        textoFiltro = " [Filtro]";
    } else if (currentMode === 'premontagem') { progressSection.style.display = 'none'; return; }

    const pecasRequeridas = pecasEscopo.filter(p => isProcessRequired(p, mode));
    const pecasFeitas = pecasRequeridas.filter(p => isProcessDone(p, mode));
    const percentage = pecasRequeridas.length > 0 ? (pecasFeitas.length / pecasRequeridas.length) * 100 : 0;

    progressText.textContent = `${modeDisplay}: ${pecasFeitas.length} / ${pecasRequeridas.length} (${percentage.toFixed(0)}%)${textoFiltro}`;
    progressBar.style.width = percentage + '%';
    progressBar.style.backgroundColor = MODE_COLORS[mode];
    progressSection.style.display = 'block';
}

async function updateUI() {
    try {
        const db = await getDb();
        const count = await db.count('pending_scans');
        pendingCountEl.textContent = count;
        pendingCountSyncBtn.textContent = count;
    } catch (e) {}

    lastScansList.innerHTML = '';
    try {
        const db = await getDb();
        let last5 = [];
        let cursor = await db.transaction('pending_scans').store.openCursor(null, 'prev');
        while (cursor && last5.length < 5) { last5.push(cursor.value); cursor = await cursor.continue(); }
        last5.forEach(scan => {
            const li = document.createElement('li');
            li.innerHTML = `<span class="cliente-tag">${scan.clienteAmbiente || ''}</span> [${scan.mode.toUpperCase()}] ${scan.pecaId}`;
            lastScansList.appendChild(li);
        });
    } catch (e) {}
}

function updateOnlineStatus(isOnline) {
    statusOnlineEl.textContent = isOnline ? 'Online' : 'Offline';
    statusOnlineEl.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
}

function displayFeedback(message, type) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackArea.textContent = message; feedbackArea.className = `feedback ${type}`;
    feedbackTimer = setTimeout(() => { if(currentMode) { feedbackArea.textContent = 'Pronto!'; feedbackArea.className = 'feedback info'; } }, 3000);
}

function updateSessionCounterUI() { if (sessionCountEl) sessionCountEl.textContent = sessionScanCount; }

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(reg => console.log('SW OK')).catch(err => console.error(err));
        });
    }
}