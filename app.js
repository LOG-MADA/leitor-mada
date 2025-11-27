// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const N8N_GET_PECAS_URL = 'http://192.168.18.190:5678/webhook/da1a3dc7-b5ca-46ff-9ced-600102b22bec';
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

// Campos de Requisito
const FIELD_REQ_FILETACAO = 'PEÇA_FILETAÇÃO_NUM';
const FIELD_REQ_CNC = 'PEÇA_USINAGEM_CNC_NUM';

// Campos de Status (Conclusão)
const FIELD_STATUS_NEST_TXT = 'BIPAGEM_NEST_TXT';
const FIELD_STATUS_SECC_TXT = 'BIPAGEM_SECC_TXT';
const FIELD_STATUS_COLADEIRA_TXT = 'BIPAGEM_COLADEIRA_TXT';
const FIELD_STATUS_HOLZER_TXT = 'BIPAGEM_HOLZER_TXT';
const FIELD_STATUS_PREMONTAGEM_TXT = 'BIPAGEM_PREMONTAGEM_TXT';

// Cores dos Serviços
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
let sessionScanCount = 0;
let currentMode = null;
let currentModeDisplay = 'Nenhum';
let currentClienteAmbiente = null;
let feedbackTimer = null;
let isCacheSyncing = false; 
let isScanSyncing = false; 

// ============================================================================
// MAPEAMENTO DOS ELEMENTOS DA INTERFACE (DOM)
// ============================================================================
const mainTitle = document.getElementById('main-title');
const serviceSelectionMenu = document.getElementById('service-selection-menu');
const mainInterface = document.getElementById('main-interface');
const serviceButtons = document.querySelectorAll('#service-selection-menu .button-service');
const currentModeDisplayEl = document.getElementById('current-mode-display');
const currentClienteAmbienteDisplayEl = document.getElementById('current-cliente-ambiente-display');
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
    
    if (interfaceToShow === 'main' && currentMode) {
        mainInterface.style.display = 'block';
        currentModeDisplayEl.textContent = currentModeDisplay;
        
        if (currentMode === 'rebalho') {
            currentModeDisplayEl.style.color = 'var(--rebalho-color)';
        } else {
            currentModeDisplayEl.style.color = MODE_COLORS[currentMode] || MODE_COLORS.default;
        }

        currentClienteAmbiente = null;
        currentClienteAmbienteDisplayEl.textContent = '--';
        
        if (currentMode === 'rebalho') {
            progressText.textContent = 'Modo Retrabalho Ativo (Bipagem Livre)';
            progressBar.style.width = '100%';
            progressBar.style.backgroundColor = 'var(--rebalho-color)';
            progressSection.style.display = 'block';
        } else {
            progressText.textContent = 'Aguardando bipagem para calcular progresso...';
            progressBar.style.width = '0%';
        }
        
        updateSessionCounterUI();
        updateUI();
        displayFeedback('Pronto para bipar!', 'info');
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
}

// ============================================================================
// CONTROLE DA SIDEBAR
// ============================================================================
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
    sidebarOverlay.addEventListener('click', closeSidebar);
    
    btnSyncScans.addEventListener('click', () => { closeSidebar(); syncPendingScans(false); });
    btnManagePending.addEventListener('click', () => { closeSidebar(); openDeleteModal(); });
    btnClearCache.addEventListener('click', () => { closeSidebar(); clearPartsCache(); });
    btnChangeService.addEventListener('click', () => { closeSidebar(); showInterface('menu'); });

    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    btnDeleteSelected.addEventListener('click', deleteSelectedScans);
    btnDeleteAllPending.addEventListener('click', clearAllPendingScans);
    window.addEventListener('click', (event) => { if (event.target == deleteModal) closeDeleteModal(); });
    window.addEventListener('keydown', (event) => { if (event.key === "Escape" && deleteModal.style.display === "block") closeDeleteModal(); });

    updateOnlineStatus(navigator.onLine);
    resetSelections();
    showInterface('menu');
    await loadPecasFromDbToMemory();
    await updateUI();

    // Timers
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
// LÓGICA PRINCIPAL DE BIPAGEM
// ============================================================================
async function handleScan(event) {
    event.preventDefault();
    const barcodeBipado = String(barcodeInput.value).trim();
    const selectedMode = currentMode;

    if (!selectedMode) { showInterface('menu'); return displayFeedback("ERRO: Selecione um Serviço.", 'error'); }
    if (!barcodeBipado) return barcodeInput.focus();

    let pecaEncontrada = pecasEmMemoria.find(p => {
        if (!p) return false;
        if (p[FIELD_CODIGO_BIPAGEM] && String(p[FIELD_CODIGO_BIPAGEM]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_1] && String(p[FIELD_CODIGO_USI_1]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_2] && String(p[FIELD_CODIGO_USI_2]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_3] && String(p[FIELD_CODIGO_USI_3]).trim() === barcodeBipado) return true;
        return false;
    });
    
    let feedbackType = 'error';
    let feedbackMessage = `ERRO: Peça [${barcodeBipado}] não encontrada no cache local. Atualize a lista.`;
    let scanShouldBeSaved = false;

    if (pecaEncontrada) {
        const codigoPrincipalPeca = pecaEncontrada[FIELD_CODIGO_BIPAGEM] || barcodeBipado;
        const nomePeca = pecaEncontrada[FIELD_NOME_PECA] || 'Nome não encontrado';
        const pecaClienteAmbiente = extractClienteAmbiente(pecaEncontrada);

        if (pecaClienteAmbiente !== currentClienteAmbiente) {
            currentClienteAmbiente = pecaClienteAmbiente;
            currentClienteAmbienteDisplayEl.textContent = currentClienteAmbiente;
            if (selectedMode !== 'rebalho') updateProgressUI();
        }

        const isReq = isProcessRequired(pecaEncontrada, selectedMode);
        const isDone = isProcessDone(pecaEncontrada, selectedMode);

        if (!isReq) {
            // ============================================================
            // INICIO DA ALTERAÇÃO SOLICITADA (Exceção CNC)
            // ============================================================
            if (selectedMode === 'holzer') {
                // Permite salvar, mas com aviso amarelo e mensagem específica
                feedbackType = 'warning'; 
                feedbackMessage = "Essa peça não é necessario cnc mas vai ser bipada normalmente em nome da CNC";
                scanShouldBeSaved = true;

                // Conta para a sessão do usuário
                sessionScanCount++; 
                updateSessionCounterUI();

                // Atualiza localmente para evitar bipar 2x, mas NÃO conta para o progresso da barra
                pecaEncontrada[FIELD_STATUS_HOLZER_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM];
                
                // NOTA: updateProgressUI() não é chamado aqui de propósito,
                // pois como isReq é false, essa peça não faz parte do total esperado.
            } else {
                // Comportamento padrão para os outros setores
                feedbackType = 'info'; 
                feedbackMessage = `INFO: Peça [${nomePeca}] (${codigoPrincipalPeca}) não requer ${selectedMode}.`; 
                scanShouldBeSaved = false;
            }
            // ============================================================
            // FIM DA ALTERAÇÃO SOLICITADA
            // ============================================================
        } 
        else if (isDone) {
            feedbackType = 'warning'; 
            feedbackMessage = `AVISO: ${selectedMode.toUpperCase()} para [${nomePeca}] (${codigoPrincipalPeca}) já foi registrado.`; 
            scanShouldBeSaved = false;
        } 
        else {
            // SUCESSO (Fluxo Normal)
            scanShouldBeSaved = true;
            sessionScanCount++; updateSessionCounterUI();

            if (selectedMode === 'rebalho') {
                feedbackType = 'warning'; 
                feedbackMessage = `⚠ RETRABALHO GERADO: ${nomePeca} (${codigoPrincipalPeca})`;
            } else {
                feedbackType = 'success'; 
                feedbackMessage = `OK: ${selectedMode.toUpperCase()} - ${nomePeca} (${codigoPrincipalPeca})`;

                // Atualização Otimista
                switch (selectedMode) {
                    case 'nesting':       pecaEncontrada[FIELD_STATUS_NEST_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                    case 'seccionadora':  pecaEncontrada[FIELD_STATUS_SECC_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                    case 'coladeira':     pecaEncontrada[FIELD_STATUS_COLADEIRA_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                    case 'holzer':        pecaEncontrada[FIELD_STATUS_HOLZER_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                    case 'premontagem':   pecaEncontrada[FIELD_STATUS_PREMONTAGEM_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                }
                updateProgressUI();
            }
        }
    } else { scanShouldBeSaved = false; }

    displayFeedback(feedbackMessage, feedbackType);

    if (scanShouldBeSaved) {
        try {
            const db = await getDb();
            await db.add('pending_scans', { 
                pecaId: pecaEncontrada[FIELD_CODIGO_BIPAGEM], 
                timestamp: new Date().toISOString(), 
                mode: selectedMode, 
                encontrada: !!pecaEncontrada, 
                clienteAmbiente: currentClienteAmbiente 
            });
        } catch (error) { console.error("Erro ao adicionar scan pendente:", error); displayFeedback(`Erro salvar scan: ${error.message}`, 'error'); }
    }

    barcodeInput.value = ''; barcodeInput.focus(); await updateUI();
}

// ============================================================================
// SINCRONIZAÇÃO E CACHE
// ============================================================================
async function loadPecasFromDbToMemory() {
    try {
        const db = await getDb();
        pecasEmMemoria = await db.getAll('pecas_cache') || [];
        console.log(`Carregadas ${pecasEmMemoria.length} peças do DB p/ memória.`);
    } catch (error) { console.error("Erro carregar peças p/ memória:", error); pecasEmMemoria = []; }
}

async function syncPecasCache(isSilent = false) {
    if (!navigator.onLine) {
        if (!isSilent) alert('Precisa estar online p/ baixar/atualizar!');
        return;
    }
    if (isCacheSyncing) return;

    isCacheSyncing = true;
    if (!isSilent) displayFeedback('Baixando/Atualizando lista...', 'loading');
    
    try {
        const response = await fetch(N8N_GET_PECAS_URL);
        if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
        const pecas = await response.json();

        const pecasValidas = [];
        pecas.forEach((p) => {
            if (typeof p !== 'object' || p === null) return;
            const codigo = p[FIELD_CODIGO_BIPAGEM] ? String(p[FIELD_CODIGO_BIPAGEM]).trim() : null;
            const clienteAmb = p[FIELD_CLIENTE_AMBIENTE];
            if (codigo && codigo !== '' && clienteAmb && Array.isArray(clienteAmb) && clienteAmb.length > 0) {
                pecasValidas.push(p);
            }
        });

        if (pecas.length > 0 && pecasValidas.length === 0) {
            alert(`ERRO: Nenhuma peça válida.`);
            displayFeedback('Erro ao processar dados.', 'error'); 
            isCacheSyncing = false; 
            return;
        }

        const db = await getDb();
        const tx = db.transaction('pecas_cache', 'readwrite');
        await tx.store.clear();
        
        for (const peca of pecasValidas) {
            try {
                peca[FIELD_CODIGO_BIPAGEM] = String(peca[FIELD_CODIGO_BIPAGEM]).trim();
                peca[FIELD_REQ_FILETACAO] = Number(peca[FIELD_REQ_FILETACAO] || 0);
                peca[FIELD_REQ_CNC] = Number(peca[FIELD_REQ_CNC] || 0);
                await tx.store.put(peca);
            } catch (innerError) { console.error(`Erro salvar peça ${peca[FIELD_CODIGO_BIPAGEM]}:`, innerError); }
        }
        await tx.done;
        pecasEmMemoria = pecasValidas;
        
        if (!isSilent) {
            alert(`Lista atualizada! (${pecasValidas.length} válidas)`);
            displayFeedback('Seleção de serviço necessária.', 'info');
            showInterface('menu');
        }
        
    } catch (error) {
        console.error("Falha GERAL sync cache:", error);
        if (!isSilent) {
            alert(`Erro ao baixar/atualizar: ${error.message}`);
            displayFeedback('Falha ao atualizar lista.', 'error');
        }
    } finally {
        isCacheSyncing = false;
    }
}

async function syncPendingScans(isSilent = false) {
    if (!navigator.onLine) {
        if (!isSilent) alert('Precisa estar online p/ sincronizar!');
        return;
    }
    if (isScanSyncing) return;

    const db = await getDb();
    const allScans = await db.getAll('pending_scans');
    if (allScans.length === 0) {
        if (!isSilent) alert('Nenhuma bipagem pendente.');
        return;
    }

    isScanSyncing = true;
    if (!isSilent) displayFeedback(`Enviando ${allScans.length} bipagens...`, 'loading');
    
    try {
        const reworkScans = allScans.filter(s => s.mode === 'rebalho');
        const normalScans = allScans.filter(s => s.mode !== 'rebalho');
        let errorOccurred = false;

        if (normalScans.length > 0) {
            const payloadNormal = normalScans.map(s => ({ pecaId: s.pecaId, timestamp: s.timestamp, mode: s.mode, clienteAmbiente: s.clienteAmbiente }));
            try {
                const r1 = await fetch(N8N_POST_SCANS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadNormal) });
                if (!r1.ok) throw new Error(`Erro N8N Normal: ${r1.statusText}`);
            } catch (e) { console.error(e); errorOccurred = true; }
        }

        if (reworkScans.length > 0) {
            const payloadRework = reworkScans.map(s => ({ pecaId: s.pecaId, timestamp: s.timestamp, mode: 'rebalho', clienteAmbiente: s.clienteAmbiente, motivo: 'App Mobile' }));
            try {
                const r2 = await fetch(N8N_POST_RETRABALHO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadRework) });
                if (!r2.ok) throw new Error(`Erro N8N Retrabalho: ${r2.statusText}`);
            } catch (e) { console.error(e); errorOccurred = true; }
        }

        if (!errorOccurred) {
            const tx = db.transaction('pending_scans', 'readwrite');
            await tx.store.clear(); await tx.done;
            
            if (!isSilent) {
                alert(`${allScans.length} bipagens sincronizadas!`);
                displayFeedback('Dados sincronizados!', 'success');
            }
            await updateUI();
        } else {
            if (!isSilent) displayFeedback('Erro parcial no envio.', 'error');
        }
    } catch (error) {
        console.error("Falha sync scans:", error);
        if (!isSilent) {
            alert(`Erro ao sincronizar: ${error.message}`);
            displayFeedback('Falha na sincronização.', 'error');
        }
    } finally {
        isScanSyncing = false;
    }
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

function closeDeleteModal() {
    deleteModal.style.display = "none";
    if (currentMode) { barcodeInput.focus(); }
}

async function renderPendingScansForDeletion() {
    try {
        const db = await getDb();
        const pendingScans = await db.getAll('pending_scans');
        pendingScansListDelete.innerHTML = '';
        if (pendingScans.length === 0) { pendingScansListDelete.innerHTML = '<li>Nenhuma bipagem pendente.</li>'; btnDeleteSelected.disabled = true; btnDeleteAllPending.disabled = true; return; }
        
        btnDeleteSelected.disabled = false; btnDeleteAllPending.disabled = false;
        pendingScans.sort((a, b) => b.id - a.id);
        
        pendingScans.forEach(scan => {
            const li = document.createElement('li');
            const checkboxId = `scan-${scan.id}`;
            const timeString = new Date(scan.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
            const modeText = scan.mode === 'rebalho' ? 'RETRABALHO' : (scan.mode ? scan.mode.toUpperCase() : 'DESCONHECIDO');
            const styleColor = scan.mode === 'rebalho' ? 'color: var(--rebalho-color); font-weight:bold;' : 'color: var(--primary-color);';

            li.innerHTML = `
                <input type="checkbox" id="${checkboxId}" data-pecaid="${scan.pecaId}" data-mode="${scan.mode}" value="${scan.id}">
                <label for="${checkboxId}">
                    <span class="scan-mode" style="${styleColor}">[${modeText}]</span>
                    <span class="scan-details">${scan.pecaId}</span>
                    <span class="scan-time">${timeString}</span>
                </label>
            `;
            pendingScansListDelete.appendChild(li);
        });
    } catch (error) { console.error("Erro renderizar scans exclusão:", error); pendingScansListDelete.innerHTML = '<li>Erro ao carregar lista.</li>'; btnDeleteSelected.disabled = true; btnDeleteAllPending.disabled = true; }
}

async function deleteSelectedScans() {
    const selectedCheckboxes = pendingScansListDelete.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) return alert("Nenhuma bipagem selecionada.");

    const scansToDelete = Array.from(selectedCheckboxes).map(cb => ({ id: parseInt(cb.value, 10), pecaId: cb.dataset.pecaid, mode: cb.dataset.mode }));
    if (!confirm(`Excluir ${scansToDelete.length} bipagens selecionadas?`)) return;

    try {
        scansToDelete.forEach(scan => { revertOptimisticUpdate(scan.pecaId, scan.mode); });
        const db = await getDb();
        const tx = db.transaction('pending_scans', 'readwrite');
        await Promise.all(scansToDelete.map(scan => tx.store.delete(scan.id)));
        await tx.done;
        displayFeedback(`${scansToDelete.length} bipagens pendentes excluídas.`, 'success');
        await renderPendingScansForDeletion();
        await updateUI();
        updateProgressUI();
    } catch (error) { console.error("Erro excluir selecionados:", error); alert(`Erro: ${error.message}`); displayFeedback('Erro ao excluir.', 'error'); }
}

async function clearAllPendingScans() {
    const db = await getDb();
    const allScans = await db.getAll('pending_scans');
    if (allScans.length === 0) return alert("Não há bipagens pendentes.");
    if (!confirm(`Excluir TODAS as ${allScans.length} bipagens pendentes?`)) return;

    try {
        allScans.forEach(scan => { if (scan.encontrada && scan.pecaId && scan.mode) revertOptimisticUpdate(scan.pecaId, scan.mode); });
        const tx = db.transaction('pending_scans', 'readwrite');
        await tx.store.clear();
        await tx.done;
        displayFeedback(`Todas as ${allScans.length} bipagens pendentes foram excluídas.`, 'success');
        await renderPendingScansForDeletion();
        await updateUI();
        updateProgressUI();
    } catch (error) { console.error("Erro limpar pendentes:", error); alert(`Erro: ${error.message}`); displayFeedback('Erro ao limpar.', 'error'); }
}

async function clearPartsCache() {
    if (!confirm("ATENÇÃO!\n\nLimpar TODO o cache de peças local?\n\nSerá necessário 'Baixar/Atualizar Peças' novamente.")) return;
    displayFeedback('Limpando cache de peças...', 'loading');
    try {
        const db = await getDb();
        const tx = db.transaction('pecas_cache', 'readwrite');
        await tx.store.clear(); await tx.done;
        pecasEmMemoria = [];
        alert("Cache de peças local foi limpo.\nClique em 'Baixar/Atualizar Peças'.");
        displayFeedback('Cache limpo. Atualize a lista.', 'warning');
        sessionScanCount = 0; updateSessionCounterUI();
        showInterface('menu');
    } catch (error) { console.error("Erro ao limpar cache:", error); alert(`Erro: ${error.message}`); displayFeedback('Erro ao limpar cache.', 'error'); }
}

function revertOptimisticUpdate(pecaId, mode) {
    if (!pecaId || !mode || mode === 'rebalho') return;
    const peca = pecasEmMemoria.find(p => p[FIELD_CODIGO_BIPAGEM] === pecaId);
    if (!peca) return;

    switch (mode) {
        case 'nesting': peca[FIELD_STATUS_NEST_TXT] = null; break;
        case 'seccionadora': peca[FIELD_STATUS_SECC_TXT] = null; break;
        case 'coladeira': peca[FIELD_STATUS_COLADEIRA_TXT] = null; break;
        case 'holzer': peca[FIELD_STATUS_HOLZER_TXT] = null; break;
        case 'premontagem': peca[FIELD_STATUS_PREMONTAGEM_TXT] = null; break;
    }
}

// ============================================================================
// ATUALIZAÇÃO DE UI
// ============================================================================
function updateProgressUI() {
    if (currentMode === 'rebalho') return;

    const clienteAmbiente = currentClienteAmbiente;
    const mode = currentMode;
    const modeDisplay = currentModeDisplay;

    if (!clienteAmbiente || !mode || pecasEmMemoria.length === 0) {
        progressSection.style.display = 'none'; return;
    }
    
    const pecasDoGrupo = pecasEmMemoria.filter(p => extractClienteAmbiente(p) === clienteAmbiente);
    const pecasRequeridas = pecasDoGrupo.filter(p => isProcessRequired(p, mode));
    const pecasFeitas = pecasRequeridas.filter(p => isProcessDone(p, mode));
    const totalRequeridas = pecasRequeridas.length;
    const totalFeitas = pecasFeitas.length;

    if (totalRequeridas === 0) {
        progressText.textContent = `${modeDisplay}: Nenhuma peça requer este serviço para este Cliente/Ambiente.`;
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = MODE_COLORS.default;
        progressSection.style.display = 'block';
    } else {
        const percentage = totalRequeridas > 0 ? (totalFeitas / totalRequeridas) * 100 : 0;
        const clienteAmbTrunc = clienteAmbiente.length > 50 ? clienteAmbiente.substring(0, 47) + '...' : clienteAmbiente;
        progressText.textContent = `${modeDisplay} [${clienteAmbTrunc}]: ${totalFeitas} / ${totalRequeridas} (${percentage.toFixed(0)}%)`;
        progressBar.style.width = percentage + '%';
        progressBar.style.backgroundColor = MODE_COLORS[mode] || MODE_COLORS.default;
        progressSection.style.display = 'block';
    }
}

async function updateUI() {
    try {
        const db = await getDb();
        const count = await db.count('pending_scans');
        pendingCountEl.textContent = count;
        pendingCountSyncBtn.textContent = count;
    } catch (error) { console.error("Erro atualizar contagem pendentes:", error); }

    lastScansList.innerHTML = '<li>Atualizando...</li>';
    try {
        const db = await getDb();
        let last5Scans = [];
        let cursor = await db.transaction('pending_scans').store.openCursor(null, 'prev');
        while (cursor && last5Scans.length < 5) {
            last5Scans.push(cursor.value);
            cursor = await cursor.continue();
        }
        
        lastScansList.innerHTML = '';
        if (last5Scans.length === 0) {
            lastScansList.innerHTML = '<li>Nenhuma bipagem recente.</li>';
        } else {
            last5Scans.forEach(scan => {
                const li = document.createElement('li');
                const isRework = scan.mode === 'rebalho';
                const statusIcon = isRework ? '⚠' : (scan.encontrada ? '✔️' : '❓');
                const statusClass = scan.encontrada ? 'success' : 'error';
                const clienteAmbienteTag = scan.clienteAmbiente ? `<span class="cliente-tag">${scan.clienteAmbiente.substring(0, 30)}...</span>` : '';
                
                let modeTag = '';
                if (isRework) modeTag = `<span class="mode-tag" style="color:var(--rebalho-color); font-weight:bold;">RETRABALHO</span>`;
                else modeTag = scan.mode ? `<span class="mode-tag">${scan.mode.toUpperCase()}</span>` : '';

                li.innerHTML = `${clienteAmbienteTag}${modeTag}<span class="status-icon ${statusClass}">${statusIcon}</span><span>${scan.pecaId}</span><small>(${new Date(scan.timestamp).toLocaleTimeString()})</small>`;
                lastScansList.appendChild(li);
            });
        }
    } catch (error) { lastScansList.innerHTML = '<li>Erro ao carregar histórico.</li>'; }
}

function updateOnlineStatus(isOnline) {
    statusOnlineEl.textContent = isOnline ? 'Online' : 'Offline';
    statusOnlineEl.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
}

function displayFeedback(message, type) {
    if (feedbackTimer) { clearTimeout(feedbackTimer); feedbackTimer = null; }
    feedbackArea.textContent = message;
    feedbackArea.className = `feedback ${type}`;
    if (type === 'success' || type === 'error' || type === 'warning') {
        feedbackTimer = setTimeout(() => { if(currentMode) displayFeedback('Pronto para bipar!', 'info'); }, 3000); 
    }
}

function updateSessionCounterUI() { if (sessionCountEl) sessionCountEl.textContent = sessionScanCount; }

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js').then(reg => console.log('Service Worker registrado!', reg)).catch(err => console.error('Falha registro SW:', err));
        });
    }
}