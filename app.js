// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const N8N_GET_PECAS_URL = 'http://192.168.18.190:5678/webhook/da1a3dc7-b5ca-46ff-9ced-600102b22bec';
const N8N_POST_SCANS_URL = 'http://192.168.18.190:5678/webhook/dd0a9938-fd80-4308-8ecc-c317b61a032e'; // URL para enviar bipagens normais

// *** NOVA CONFIGURAÇÃO ***
// Substitua o final da URL abaixo pelo seu UUID correto do N8N para Retrabalho
const N8N_POST_RETRABALHO_URL = 'http://192.168.18.190:5678/webhook/a8a4cf0d-1334-4fcc-ba54-8ba92c652da9'; 

// ============================================================================
// CONSTANTES DE NOMES DE CAMPOS e CORES
// ============================================================================
const FIELD_CODIGO_BIPAGEM = 'CODIGO_BIPAGEM_TXT';
const FIELD_CODIGO_USI_1 = 'CODIGO_BIPAGEM_USI_1_TXT'; 
const FIELD_CODIGO_USI_2 = 'CODIGO_BIPAGEM_USI_2_TXT'; 
const FIELD_CODIGO_USI_3 = 'CODIGO_BIPAGEM_USI_3_TXT'; 

const FIELD_NOME_PECA = 'CHAVE_PEÇAS_FX';
const FIELD_CLIENTE_AMBIENTE = 'CLIENTE_AMBIENTE_LKP';
const FIELD_NOME_MAQUINA_LKP = 'NOME_MAQUINA_LKP'; // Para Nesting/Seccionadora

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
    rebalho: 'var(--rebalho-color)', // <<< NOVA COR ADICIONADA
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
let isCacheSyncing = false; // Flag de controle para timer
let isScanSyncing = false; // Flag de controle para timer

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
// Botão de Atualizar Peças (agora duplicado, pegamos o global)
const btnSyncCacheGlobal = document.querySelector('.global-actions #btn-sync-cache');


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
    // Esconde todos os elementos principais
    mainTitle.style.display = 'none';
    serviceSelectionMenu.style.display = 'none';
    mainInterface.style.display = 'none';
    progressSection.style.display = 'none';
    
    console.log(`Mostrando interface: ${interfaceToShow}`);

    if (interfaceToShow === 'main' && currentMode) {
        mainInterface.style.display = 'block';
        currentModeDisplayEl.textContent = currentModeDisplay;
        
        // Ajuste de cor para Retrabalho
        if (currentMode === 'rebalho') {
            currentModeDisplayEl.style.color = 'var(--rebalho-color)';
        } else {
            currentModeDisplayEl.style.color = MODE_COLORS[currentMode] || MODE_COLORS.default;
        }

        currentClienteAmbiente = null;
        currentClienteAmbienteDisplayEl.textContent = '--';
        
        // Visual da barra de progresso para Retrabalho vs Normal
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
    } else { // 'menu'
        mainTitle.style.display = 'block'; // Mostra H1
        serviceSelectionMenu.style.display = 'block'; // Mostra seleção
        mainInterface.style.display = 'none'; // Esconde interface principal
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
function openSidebar() {
    console.log("Abrindo sidebar...");
    sidebarNav.classList.add('open');
    sidebarOverlay.classList.add('open');
}

function closeSidebar() {
    console.log("Fechando sidebar...");
    sidebarNav.classList.remove('open');
    sidebarOverlay.classList.remove('open');
}

// ============================================================================
// INICIALIZAÇÃO DO APP
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("DOM carregado. Iniciando PWA...");
    registerServiceWorker();

    // Listeners
    serviceButtons.forEach(button => { button.addEventListener('click', () => { selectMode(button.dataset.mode, button.dataset.display); }); });
    scanForm.addEventListener('submit', handleScan);
    btnSyncCache.addEventListener('click', () => syncPecasCache(false)); // Botão global chama com (isSilent = false)
    window.addEventListener('online', () => updateOnlineStatus(true));
    window.addEventListener('offline', () => updateOnlineStatus(false));

    // --- Listeners da Sidebar ---
    btnOpenMenu.addEventListener('click', openSidebar);
    btnCloseMenu.addEventListener('click', closeSidebar);
    sidebarOverlay.addEventListener('click', closeSidebar);
    
    btnSyncScans.addEventListener('click', () => { closeSidebar(); syncPendingScans(false); }); // Botão manual chama com (isSilent = false)
    btnManagePending.addEventListener('click', () => { closeSidebar(); openDeleteModal(); });
    btnClearCache.addEventListener('click', () => { closeSidebar(); clearPartsCache(); });
    btnChangeService.addEventListener('click', () => { closeSidebar(); showInterface('menu'); });

    // Listeners Modal
    closeDeleteModalBtn.addEventListener('click', closeDeleteModal);
    btnDeleteSelected.addEventListener('click', deleteSelectedScans);
    btnDeleteAllPending.addEventListener('click', clearAllPendingScans);
    window.addEventListener('click', (event) => { if (event.target == deleteModal) closeDeleteModal(); });
    window.addEventListener('keydown', (event) => { if (event.key === "Escape" && deleteModal.style.display === "block") closeDeleteModal(); });

    // Inicializa
    updateOnlineStatus(navigator.onLine);
    resetSelections();
    showInterface('menu');
    console.log("Carregando peças do DB para memória...");
    await loadPecasFromDbToMemory();
    console.log(`Cache memória inicializado: ${pecasEmMemoria.length} peças.`);
    await updateUI();
    console.log("PWA inicializado. Aguardando seleção de serviço.");

    // ** NOVOS TIMERS AUTOMÁTICOS **
    // Timer 1: Buscar peças a cada 5 minutos
    setInterval(async () => {
        console.log("Timer (5 min): Verificando se deve atualizar peças...");
        if (!navigator.onLine || isCacheSyncing) {
            return;
        }
        await syncPecasCache(true); // 'true' para modo silencioso
    }, 300000); // 5 minutos

    // Timer 2: Enviar bipagens a cada 10 minutos
    setInterval(async () => {
        console.log("Timer (10 min): Verificando se deve enviar bipagens...");
        if (!navigator.onLine || isScanSyncing) {
            return;
        }
        await syncPendingScans(true); // 'true' para modo silencioso
    }, 600000); // 10 minutos
});

// ============================================================================
// FUNÇÃO CHAMADA AO SELECIONAR UM SERVIÇO (MODO)
// ============================================================================
function selectMode(modeValue, modeDisplayName) {
    console.log(`Serviço selecionado: ${modeDisplayName} (${modeValue})`);
    currentMode = modeValue;
    currentModeDisplay = modeDisplayName;
    sessionScanCount = 0;
    showInterface('main');
}


// ============================================================================
// FUNÇÕES AUXILIARES DE VERIFICAÇÃO E EXTRAÇÃO (ATUALIZADAS)
// ============================================================================
function isProcessRequired(peca, mode) {
    if (!peca) return false;
    
    // *** LÓGICA NOVA: Retrabalho sempre é permitido ***
    if (mode === 'rebalho') return true;

    // Helper para checar se o array de máquinas contém o texto
    const maquinaContains = (text) => 
        peca[FIELD_NOME_MAQUINA_LKP] && Array.isArray(peca[FIELD_NOME_MAQUINA_LKP])
        ? peca[FIELD_NOME_MAQUINA_LKP].some(m => String(m).toUpperCase().includes(text.toUpperCase()))
        : false;

    switch (mode) {
        case 'nesting':
            return maquinaContains("NANXING - NESTING");
        case 'seccionadora':
            return maquinaContains("SECCIONADORA");
        case 'coladeira':
            return Number(peca?.[FIELD_REQ_FILETACAO] || 0) > 0;
        case 'holzer': // CENTRO DE CNC (HOLZER)
            return Number(peca?.[FIELD_REQ_CNC] || 0) > 0;
        case 'premontagem':
            return true; // Todas as peças precisam de conferência
        default: 
            console.warn(`Modo 'isProcessRequired' desconhecido: ${mode}`);
            return false;
    }
}

function isProcessDone(peca, mode) {
    if (!peca) return false;

    // *** LÓGICA NOVA: Retrabalho NUNCA está "pronto" para permitir repetição ***
    if (mode === 'rebalho') return false;

    // Verifica os novos campos de status.
    switch (mode) {
        case 'nesting':       return !!(peca?.[FIELD_STATUS_NEST_TXT]?.trim());
        case 'seccionadora':  return !!(peca?.[FIELD_STATUS_SECC_TXT]?.trim());
        case 'coladeira':     return !!(peca?.[FIELD_STATUS_COLADEIRA_TXT]?.trim());
        case 'holzer':        return !!(peca?.[FIELD_STATUS_HOLZER_TXT]?.trim());
        case 'premontagem':   return !!(peca?.[FIELD_STATUS_PREMONTAGEM_TXT]?.trim());
        default: 
            console.warn(`Modo 'isProcessDone' desconhecido: ${mode}`);
            return false;
    }
}

function extractClienteAmbiente(peca) {
    if (!peca || !peca[FIELD_CLIENTE_AMBIENTE]) {
        return "Desconhecido";
    }
    const clienteAmbienteArray = peca[FIELD_CLIENTE_AMBIENTE];
    return Array.isArray(clienteAmbienteArray) && clienteAmbienteArray.length > 0
            ? String(clienteAmbienteArray[0]).trim()
            : "Desconhecido";
}

// ============================================================================
// LÓGICA PRINCIPAL DE BIPAGEM (ATUALIZADA)
// ============================================================================
async function handleScan(event) {
    event.preventDefault();
    const barcodeBipado = String(barcodeInput.value).trim();
    const selectedMode = currentMode;

    if (!selectedMode) { showInterface('menu'); return displayFeedback("ERRO: Selecione um Serviço.", 'error'); }
    if (!barcodeBipado) return barcodeInput.focus();

    console.log(`--- Scan [${selectedMode}] Cod:${barcodeBipado} ---`);

    // Busca na memória
    let pecaEncontrada = pecasEmMemoria.find(p => {
        if (!p) return false;
        if (p[FIELD_CODIGO_BIPAGEM] && String(p[FIELD_CODIGO_BIPAGEM]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_1] && String(p[FIELD_CODIGO_USI_1]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_2] && String(p[FIELD_CODIGO_USI_2]).trim() === barcodeBipado) return true;
        if (p[FIELD_CODIGO_USI_3] && String(p[FIELD_CODIGO_USI_3]).trim() === barcodeBipado) return true;
        return false;
    });
    
    let origem = "Memória";

    let feedbackType = 'error';
    let feedbackMessage = `ERRO: Peça [${barcodeBipado}] não encontrada no cache local. Atualize a lista.`;
    let scanShouldBeSaved = false;

    if (pecaEncontrada) {
        const codigoPrincipalPeca = pecaEncontrada[FIELD_CODIGO_BIPAGEM] || barcodeBipado;
        const nomePeca = pecaEncontrada[FIELD_NOME_PECA] || 'Nome não encontrado';
        const pecaClienteAmbiente = extractClienteAmbiente(pecaEncontrada);

        if (pecaClienteAmbiente !== currentClienteAmbiente) {
            console.log(`Mudança de Cliente/Ambiente detectada: ${pecaClienteAmbiente}`);
            currentClienteAmbiente = pecaClienteAmbiente;
            currentClienteAmbienteDisplayEl.textContent = currentClienteAmbiente;
            // Só atualiza barra de progresso se NÃO for retrabalho
            if (selectedMode !== 'rebalho') updateProgressUI();
        }

        const isReq = isProcessRequired(pecaEncontrada, selectedMode);
        const isDone = isProcessDone(pecaEncontrada, selectedMode);
        console.log(`Encontrada (${origem}): ${nomePeca}. Modo: ${selectedMode}. Req:${isReq}. Feito:${isDone}`);

        if (!isReq) {
            feedbackType = 'info'; feedbackMessage = `INFO: Peça [${nomePeca}] (${codigoPrincipalPeca}) não requer ${selectedMode}.`; scanShouldBeSaved = false;
        } else if (isDone) {
            feedbackType = 'warning'; feedbackMessage = `AVISO: ${selectedMode.toUpperCase()} para [${nomePeca}] (${codigoPrincipalPeca}) já foi registrado.`; scanShouldBeSaved = false;
        } else {
            // SUCESSO
            scanShouldBeSaved = true;
            sessionScanCount++; updateSessionCounterUI();

            if (selectedMode === 'rebalho') {
                // === FLUXO DE RETRABALHO ===
                feedbackType = 'warning'; // Alerta visual
                feedbackMessage = `⚠ RETRABALHO GERADO: ${nomePeca} (${codigoPrincipalPeca})`;
                // OBS: Não fazemos atualização otimista de status para Retrabalho
            } else {
                // === FLUXO NORMAL ===
                feedbackType = 'success'; 
                feedbackMessage = `OK: ${selectedMode.toUpperCase()} - ${nomePeca} (${codigoPrincipalPeca})`;

                // Atualização Otimista (status)
                console.log("Atualizando cache memória otimisticamente...");
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
    console.log(`Feedback: [${feedbackType}] ${feedbackMessage}`);

    if (scanShouldBeSaved) {
        try {
            const db = await getDb();
            // Salvamos o scan nos pendentes
            await db.add('pending_scans', { 
                pecaId: pecaEncontrada[FIELD_CODIGO_BIPAGEM], 
                timestamp: new Date().toISOString(), 
                mode: selectedMode, 
                encontrada: !!pecaEncontrada, 
                clienteAmbiente: currentClienteAmbiente 
            });
            console.log("Scan adicionado aos pendentes com contexto.");
        } catch (error) { console.error("Erro ao adicionar scan pendente:", error); displayFeedback(`Erro salvar scan: ${error.message}`, 'error'); }
    }

    barcodeInput.value = ''; barcodeInput.focus(); await updateUI();
    console.log(`--- Fim da busca [${selectedMode}] ---`);
}


// ============================================================================
// SINCRONIZAÇÃO E CACHE (ATUALIZADO com flags e modo silencioso)
// ============================================================================
async function loadPecasFromDbToMemory() {
    try {
        const db = await getDb();
        pecasEmMemoria = await db.getAll('pecas_cache') || [];
        console.log(`Carregadas ${pecasEmMemoria.length} peças do DB p/ memória.`);
    } catch (error) { console.error("Erro carregar peças p/ memória:", error); pecasEmMemoria = []; }
}

async function syncPecasCache(isSilent = false) { // Adicionado parâmetro
    if (!navigator.onLine) {
        if (!isSilent) alert('Precisa estar online p/ baixar/atualizar!');
        return;
    }
    if (isCacheSyncing) {
        console.log("SyncPecasCache: Ignorando, sincronização já em andamento.");
        return;
    }

    isCacheSyncing = true; // Trava
    if (!isSilent) displayFeedback('Baixando/Atualizando lista...', 'loading');
    console.log("--- Sync Cache Peças: INICIANDO ---");
    
    try {
        console.log("1. Buscando URL:", N8N_GET_PECAS_URL);
        const response = await fetch(N8N_GET_PECAS_URL);
        if (!response.ok) throw new Error(`Erro ${response.status}: ${response.statusText}`);
        const pecas = await response.json();

        const pecasValidas = []; const pecasRejeitadas = [];
        pecas.forEach((p, index) => {
            if (typeof p !== 'object' || p === null) { return; }
            
            // A validação principal (keyPath)
            const codigo = p[FIELD_CODIGO_BIPAGEM] ? String(p[FIELD_CODIGO_BIPAGEM]).trim() : null;
            const clienteAmb = p[FIELD_CLIENTE_AMBIENTE];
            
            // Filtro principal
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

        console.log("4. Atualizando DB...");
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
        isCacheSyncing = false; // Libera a trava
    }
}

// *** FUNÇÃO DE UPLOAD ATUALIZADA PARA SEPARAR FLUXOS ***
async function syncPendingScans(isSilent = false) {
    if (!navigator.onLine) {
        if (!isSilent) alert('Precisa estar online p/ sincronizar!');
        return;
    }
    if (isScanSyncing) {
        return;
    }

    const db = await getDb();
    const allScans = await db.getAll('pending_scans');
    if (allScans.length === 0) {
        if (!isSilent) alert('Nenhuma bipagem pendente.');
        return;
    }

    isScanSyncing = true; // Trava
    if (!isSilent) displayFeedback(`Enviando ${allScans.length} bipagens...`, 'loading');
    console.log(`--- Sync Scans: INICIANDO (${allScans.length} scans) ---`);
    
    try {
        // 1. Separar scans de Retrabalho dos normais
        const reworkScans = allScans.filter(s => s.mode === 'rebalho');
        const normalScans = allScans.filter(s => s.mode !== 'rebalho');
        let errorOccurred = false;

        // 2. Enviar scans NORMAIS
        if (normalScans.length > 0) {
            const payloadNormal = normalScans.map(s => ({ pecaId: s.pecaId, timestamp: s.timestamp, mode: s.mode, clienteAmbiente: s.clienteAmbiente }));
            console.log(`Enviando ${normalScans.length} normais...`);
            try {
                const r1 = await fetch(N8N_POST_SCANS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadNormal) });
                if (!r1.ok) throw new Error(`Erro N8N Normal: ${r1.statusText}`);
            } catch (e) {
                console.error(e); errorOccurred = true;
            }
        }

        // 3. Enviar scans de RETRABALHO (Nova URL)
        if (reworkScans.length > 0) {
            const payloadRework = reworkScans.map(s => ({ pecaId: s.pecaId, timestamp: s.timestamp, mode: 'rebalho', clienteAmbiente: s.clienteAmbiente, motivo: 'App Mobile' }));
            console.log(`Enviando ${reworkScans.length} retrabalhos...`);
            try {
                const r2 = await fetch(N8N_POST_RETRABALHO_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadRework) });
                if (!r2.ok) throw new Error(`Erro N8N Retrabalho: ${r2.statusText}`);
            } catch (e) {
                console.error(e); errorOccurred = true;
            }
        }

        // 4. Limpeza se não houve erro
        if (!errorOccurred) {
            console.log("Sucesso envio. Limpando pendentes...");
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
        isScanSyncing = false; // Libera a trava
    }
}

// ============================================================================
// FUNÇÕES DO MODAL E LIMPEZA (CORRIGIDAS)
// ============================================================================
async function openDeleteModal() {
    console.log("Abrindo modal de exclusão...");
    pendingScansListDelete.innerHTML = '<li>Carregando pendentes...</li>';
    deleteModal.style.display = "block";
    await renderPendingScansForDeletion();
    barcodeInput.blur();
}

function closeDeleteModal() {
    console.log("Fechando modal de exclusão.");
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
            
            // Estilo diferenciado na lista para retrabalho
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

    const scansToDelete = Array.from(selectedCheckboxes).map(cb => ({
        id: parseInt(cb.value, 10),
        pecaId: cb.dataset.pecaid, 
        mode: cb.dataset.mode
    }));
    if (!confirm(`Excluir ${scansToDelete.length} bipagens selecionadas?`)) return;

    try {
        scansToDelete.forEach(scan => {
            revertOptimisticUpdate(scan.pecaId, scan.mode);
        });
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
        allScans.forEach(scan => {
            if (scan.encontrada && scan.pecaId && scan.mode) {
                revertOptimisticUpdate(scan.pecaId, scan.mode);
            }
        });
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

// ============================================================================
// FUNÇÃO: REVERTE STATUS OTIMISTA (CORRIGIDA)
// ============================================================================
function revertOptimisticUpdate(pecaId, mode) {
    // Retrabalho não afeta status otimista, então não precisa reverter nada
    if (!pecaId || !mode || mode === 'rebalho') return;
    
    const peca = pecasEmMemoria.find(p => p[FIELD_CODIGO_BIPAGEM] === pecaId);
    if (!peca) {
        return;
    }

    console.log(`Revertendo status otimista para ${pecaId}, modo ${mode}`);
    switch (mode) {
        case 'nesting': peca[FIELD_STATUS_NEST_TXT] = null; break;
        case 'seccionadora': peca[FIELD_STATUS_SECC_TXT] = null; break;
        case 'coladeira': peca[FIELD_STATUS_COLADEIRA_TXT] = null; break;
        case 'holzer': peca[FIELD_STATUS_HOLZER_TXT] = null; break;
        case 'premontagem': peca[FIELD_STATUS_PREMONTAGEM_TXT] = null; break;
    }
}


// ============================================================================
// FUNÇÃO: ATUALIZA BARRA DE PROGRESSO
// ============================================================================
function updateProgressUI() {
    // Retrabalho não usa barra de progresso calculada
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


// ============================================================================
// FUNÇÕES AUXILIARES DA INTERFACE
// ============================================================================
async function updateUI() {
    // Atualiza contadores gerais
    try {
        const db = await getDb();
        const count = await db.count('pending_scans');
        pendingCountEl.textContent = count;
        pendingCountSyncBtn.textContent = count;
    } catch (error) { console.error("Erro atualizar contagem pendentes:", error); }

    // Atualiza histórico recente (GERAL)
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
                if (isRework) {
                    modeTag = `<span class="mode-tag" style="color:var(--rebalho-color); font-weight:bold;">RETRABALHO</span>`;
                } else {
                    modeTag = scan.mode ? `<span class="mode-tag">${scan.mode.toUpperCase()}</span>` : '';
                }

                li.innerHTML = `${clienteAmbienteTag}${modeTag}<span class="status-icon ${statusClass}">${statusIcon}</span><span>${scan.pecaId}</span><small>(${new Date(scan.timestamp).toLocaleTimeString()})</small>`;
                lastScansList.appendChild(li);
            });
        }
    } catch (error) {
        console.error("Erro ao atualizar histórico:", error);
        lastScansList.innerHTML = '<li>Erro ao carregar histórico.</li>';
    }
}

function updateOnlineStatus(isOnline) {
    statusOnlineEl.textContent = isOnline ? 'Online' : 'Offline';
    statusOnlineEl.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
}

function displayFeedback(message, type) {
    if (feedbackTimer) {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
    }
    console.log(`Feedback: [${type}] ${message}`);
    feedbackArea.textContent = message;
    feedbackArea.className = `feedback ${type}`;

    if (type === 'success' || type === 'error' || type === 'warning') {
        feedbackTimer = setTimeout(() => {
            if(currentMode) {
                displayFeedback('Pronto para bipar!', 'info');
            }
        }, 3000); // 3 segundos
    }
}

function updateSessionCounterUI() {
    if (sessionCountEl) sessionCountEl.textContent = sessionScanCount;
}

// ============================================================================
// SERVICE WORKER
// ============================================================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
         console.log("Registrando Service Worker...");
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js') 
                .then(reg => console.log('Service Worker registrado!', reg))
                .catch(err => console.error('Falha registro SW:', err));
        });
    } else { console.warn("Service Worker não suportado."); }
}