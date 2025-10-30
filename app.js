// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
const N8N_GET_PECAS_URL = 'http://192.168.18.190:5678/webhook/da1a3dc7-b5ca-46ff-9ced-600102b22bec';
const N8N_POST_SCANS_URL = 'http://192.168.18.190:5678/webhook/dd0a9938-fd80-4308-8ecc-c317b61a032e'; // URL para enviar bipagens

// ============================================================================
// CONSTANTES DE NOMES DE CAMPOS e CORES
// ============================================================================
const FIELD_CODIGO_BIPAGEM = 'CODIGO_BIPAGEM_TXT';
const FIELD_CODIGO_USI_1 = 'CODIGO_BIPAGEM_USI_1_TXT'; // <<< NOVO
const FIELD_CODIGO_USI_2 = 'CODIGO_BIPAGEM_USI_2_TXT'; // <<< NOVO
const FIELD_CODIGO_USI_3 = 'CODIGO_BIPAGEM_USI_3_TXT'; // <<< NOVO

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
                // A chave principal AINDA é o CODIGO_BIPAGEM_TXT
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
        currentModeDisplayEl.style.color = MODE_COLORS[currentMode] || MODE_COLORS.default;
        currentClienteAmbiente = null;
        currentClienteAmbienteDisplayEl.textContent = '--';
        progressText.textContent = 'Aguardando bipagem para calcular progresso...';
        progressBar.style.width = '0%';
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
            console.log("Timer (5 min): Ignorando (Offline ou Sincronização em andamento).");
            return;
        }
        await syncPecasCache(true); // 'true' para modo silencioso
    }, 300000); // 5 minutos = 300,000 ms

    // Timer 2: Enviar bipagens a cada 10 minutos
    setInterval(async () => {
        console.log("Timer (10 min): Verificando se deve enviar bipagens...");
        if (!navigator.onLine || isScanSyncing) {
            console.log("Timer (10 min): Ignorando (Offline ou Sincronização em andamento).");
            return;
        }
        await syncPendingScans(true); // 'true' para modo silencioso
    }, 600000); // 10 minutos = 600,000 ms
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

    // *** INÍCIO DA MODIFICAÇÃO ***
    // Agora, procuramos em 4 campos dentro da memória
    let pecaEncontrada = pecasEmMemoria.find(p => {
        if (!p) return false;
        
        // Verifica o campo principal
        if (p[FIELD_CODIGO_BIPAGEM] && String(p[FIELD_CODIGO_BIPAGEM]).trim() === barcodeBipado) {
            return true;
        }
        // Verifica USI_1
        if (p[FIELD_CODIGO_USI_1] && String(p[FIELD_CODIGO_USI_1]).trim() === barcodeBipado) {
            return true;
        }
        // Verifica USI_2
        if (p[FIELD_CODIGO_USI_2] && String(p[FIELD_CODIGO_USI_2]).trim() === barcodeBipado) {
            return true;
        }
        // Verifica USI_3
        if (p[FIELD_CODIGO_USI_3] && String(p[FIELD_CODIGO_USI_3]).trim() === barcodeBipado) {
            return true;
        }
        
        return false;
    });
    
    let origem = "Memória"; // A busca agora é sempre na memória.
    
    // O bloco 'if (!pecaEncontrada)' que buscava no DB foi removido.
    // 'pecasEmMemoria' deve ser a fonte única da verdade.
    // *** FIM DA MODIFICAÇÃO ***


    let feedbackType = 'error';
    // Usamos 'barcodeBipado' na mensagem de erro, pois é o que o usuário digitou
    let feedbackMessage = `ERRO: Peça [${barcodeBipado}] não encontrada no cache local. Atualize a lista.`;
    let scanShouldBeSaved = false;

    if (pecaEncontrada) {
        // Nas mensagens de sucesso, usamos o código principal da peça (FIELD_CODIGO_BIPAGEM)
        const codigoPrincipalPeca = pecaEncontrada[FIELD_CODIGO_BIPAGEM] || barcodeBipado;
        const nomePeca = pecaEncontrada[FIELD_NOME_PECA] || 'Nome não encontrado';
        const pecaClienteAmbiente = extractClienteAmbiente(pecaEncontrada);

        if (pecaClienteAmbiente !== currentClienteAmbiente) {
            console.log(`Mudança de Cliente/Ambiente detectada: ${pecaClienteAmbiente}`);
            currentClienteAmbiente = pecaClienteAmbiente;
            currentClienteAmbienteDisplayEl.textContent = currentClienteAmbiente;
            updateProgressUI();
        }

        const isReq = isProcessRequired(pecaEncontrada, selectedMode);
        const isDone = isProcessDone(pecaEncontrada, selectedMode);
        console.log(`Encontrada (${origem}): ${nomePeca}. Modo: ${selectedMode}. Req:${isReq}. Feito:${isDone}`);

        if (!isReq) {
            feedbackType = 'info'; feedbackMessage = `INFO: Peça [${nomePeca}] (${codigoPrincipalPeca}) não requer ${selectedMode}.`; scanShouldBeSaved = false;
        } else if (isDone) {
            feedbackType = 'warning'; feedbackMessage = `AVISO: ${selectedMode.toUpperCase()} para [${nomePeca}] (${codigoPrincipalPeca}) já foi registrado.`; scanShouldBeSaved = false;
        } else {
            feedbackType = 'success'; feedbackMessage = `OK: ${selectedMode.toUpperCase()} - ${nomePeca} (${codigoPrincipalPeca})`; scanShouldBeSaved = true;
            sessionScanCount++; updateSessionCounterUI();

            // Atualização Otimista
            console.log("Atualizando cache memória otimisticamente...");
            // Usamos o código principal da peça (chave do DB) para o status
            switch (selectedMode) {
                case 'nesting':       pecaEncontrada[FIELD_STATUS_NEST_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                case 'seccionadora':  pecaEncontrada[FIELD_STATUS_SECC_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                case 'coladeira':     pecaEncontrada[FIELD_STATUS_COLADEIRA_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                case 'holzer':        pecaEncontrada[FIELD_STATUS_HOLZER_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
                case 'premontagem':   pecaEncontrada[FIELD_STATUS_PREMONTAGEM_TXT] = pecaEncontrada[FIELD_CODIGO_BIPAGEM]; break;
            }
              console.log(`Cache memória para ${codigoPrincipalPeca} atualizado p/ modo ${selectedMode}.`);
              updateProgressUI();
        }
    } else { scanShouldBeSaved = false; }

    displayFeedback(feedbackMessage, feedbackType);
    console.log(`Feedback: [${feedbackType}] ${feedbackMessage}`);

    if (scanShouldBeSaved) {
        try {
            const db = await getDb();
            // Salvamos o CÓDIGO PRINCIPAL (keyPath) no 'pecaId' pendente
            await db.add('pending_scans', { pecaId: pecaEncontrada[FIELD_CODIGO_BIPAGEM], timestamp: new Date().toISOString(), mode: selectedMode, encontrada: !!pecaEncontrada, clienteAmbiente: currentClienteAmbiente });
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

        console.log(`2. DADOS BRUTOS RECEBIDOS DO N8N: ${pecas.length} itens.`);
        if (pecas.length > 0) console.log("Amostra 3 primeiros BRUTOS:", JSON.stringify(pecas.slice(0, 3), null, 2));

        const pecasValidas = []; const pecasRejeitadas = [];
        pecas.forEach((p, index) => {
            if (typeof p !== 'object' || p === null) { pecasRejeitadas.push({ index: index, item: String(p), reason: 'Item não é objeto' }); return; }
            
            // A validação principal (keyPath)
            const codigo = p[FIELD_CODIGO_BIPAGEM] ? String(p[FIELD_CODIGO_BIPAGEM]).trim() : null;
            const clienteAmb = p[FIELD_CLIENTE_AMBIENTE];
            
            // Filtro principal: Precisa do código principal (keyPath) E cliente/ambiente
            if (codigo && codigo !== '' && clienteAmb && Array.isArray(clienteAmb) && clienteAmb.length > 0) {
                pecasValidas.push(p);
            } else {
                let reason = !codigo ? `Campo ${FIELD_CODIGO_BIPAGEM} (keyPath) ausente/vazio` : `Campo ${FIELD_CLIENTE_AMBIENTE} ausente, vazio ou não é array`;
                pecasRejeitadas.push({ index: index, item: JSON.stringify(p).substring(0, 100) + '...', reason: reason });
            }
        });
        console.log(`3. Peças VÁLIDAS (com ${FIELD_CODIGO_BIPAGEM} E ${FIELD_CLIENTE_AMBIENTE}): ${pecasValidas.length}.`);

        if (pecas.length > 0 && pecasValidas.length === 0) {
            console.error(`ERRO GRAVE: Nenhuma peça válida! Verifique campos ${FIELD_CODIGO_BIPAGEM} e ${FIELD_CLIENTE_AMBIENTE}.`);
            console.error("Detalhes REJEITADOS:", JSON.stringify(pecasRejeitadas, null, 2));
            alert(`ERRO: Nenhuma peça válida. Verifique console (F12).`);
            displayFeedback('Erro ao processar dados.', 'error'); 
            isCacheSyncing = false; // <<< Libera trava no erro
            return;
        } else if (pecasRejeitadas.length > 0) {
            console.warn(`ATENÇÃO: ${pecasRejeitadas.length} itens rejeitados.`);
            console.warn("Amostra rejeitados:", JSON.stringify(pecasRejeitadas.slice(0, 3), null, 2));
        }

        console.log("4. Atualizando DB...");
        const db = await getDb();
        const tx = db.transaction('pecas_cache', 'readwrite');
        await tx.store.clear();
        console.log("5. Cache DB limpo. Adicionando/Atualizando...");
        let count = 0;
        for (const peca of pecasValidas) {
            try {
                // Garante que a keyPath está correta
                peca[FIELD_CODIGO_BIPAGEM] = String(peca[FIELD_CODIGO_BIPAGEM]).trim();
                
                // Normaliza outros campos
                peca[FIELD_REQ_FILETACAO] = Number(peca[FIELD_REQ_FILETACAO] || 0);
                peca[FIELD_REQ_CNC] = Number(peca[FIELD_REQ_CNC] || 0);
                
                await tx.store.put(peca);
                count++;
            } catch (innerError) { console.error(`Erro salvar peça ${peca[FIELD_CODIGO_BIPAGEM]}:`, innerError); }
        }
        await tx.done;
        pecasEmMemoria = pecasValidas;
        
        console.log(`6. ${count} peças salvas. Cache memória atualizado.`);
        if (!isSilent) {
            alert(`Lista atualizada! (${pecasValidas.length} válidas)`);
            displayFeedback('Seleção de serviço necessária.', 'info');
            showInterface('menu');
        } else {
            if (serviceSelectionMenu.style.display === 'block') {
                // populatePedidoSelect(); 
            }
            console.log("--- Sync Cache Peças: SUCESSO (Silencioso) ---");
        }
        
    } catch (error) {
        console.error("Falha GERAL sync cache:", error);
        if (!isSilent) {
            alert(`Erro ao baixar/atualizar: ${error.message}`);
            displayFeedback('Falha ao atualizar lista.', 'error');
        }
        console.error("--- Sync Cache Peças: FALHOU ---");
    } finally {
        isCacheSyncing = false; // Libera a trava
    }
}


async function syncPendingScans(isSilent = false) {
    if (!navigator.onLine) {
        if (!isSilent) alert('Precisa estar online p/ sincronizar!');
        return;
    }
     if (isScanSyncing) {
         console.log("SyncPendingScans: Ignorando, sincronização já em andamento.");
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
    console.log(`--- Sync Scans Pendentes: INICIANDO (${allScans.length} scans) ---`);
    
    // O payload envia o 'pecaId' que é o FIELD_CODIGO_BIPAGEM_TXT
    const payload = allScans.map(s => ({ pecaId: s.pecaId, timestamp: s.timestamp, mode: s.mode, clienteAmbiente: s.clienteAmbiente }));
    console.log("Payload:", JSON.stringify(payload));

    try {
        const response = await fetch(N8N_POST_SCANS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) { let e = ''; try { e = await response.text(); } catch {} throw new Error(`Erro N8N ${response.status}: ${response.statusText}. ${e}`); }
        
        console.log("Sucesso envio. Limpando pendentes...");
        const tx = db.transaction('pending_scans', 'readwrite');
        await tx.store.clear(); await tx.done;
        
        if (!isSilent) {
            alert(`${allScans.length} bipagens sincronizadas!`);
            displayFeedback('Dados sincronizados!', 'success');
        }
        await updateUI();
        console.log("--- Sync Scans Pendentes: SUCESSO ---");
        
    } catch (error) {
        console.error("Falha sync scans:", error);
        if (!isSilent) {
            alert(`Erro ao sincronizar: ${error.message}`);
            displayFeedback('Falha na sincronização.', 'error');
        }
        console.error("--- Sync Scans Pendentes: FALHOU ---");
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
            const modeText = scan.mode ? scan.mode.toUpperCase() : 'DESCONHECIDO';
            li.innerHTML = `
                <input type="checkbox" id="${checkboxId}" data-pecaid="${scan.pecaId}" data-mode="${scan.mode}" value="${scan.id}">
                <label for="${checkboxId}">
                    <span class="scan-mode">[${modeText}]</span>
                    <span class="scan-details">${scan.pecaId}</span>
                    <span class="scan-time">${timeString}</span>
                </label>
            `;
            pendingScansListDelete.appendChild(li);
        });
         console.log(`${pendingScans.length} scans pendentes renderizados.`);
    } catch (error) { console.error("Erro renderizar scans exclusão:", error); pendingScansListDelete.innerHTML = '<li>Erro ao carregar lista.</li>'; btnDeleteSelected.disabled = true; btnDeleteAllPending.disabled = true; }
}

async function deleteSelectedScans() {
    const selectedCheckboxes = pendingScansListDelete.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) return alert("Nenhuma bipagem selecionada.");

    const scansToDelete = Array.from(selectedCheckboxes).map(cb => ({
        id: parseInt(cb.value, 10),
        pecaId: cb.dataset.pecaid, // Este é o FIELD_CODIGO_BIPAGEM_TXT
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
    if (!pecaId || !mode) return;
    // pecaId aqui é o FIELD_CODIGO_BIPAGEM_TXT
    const peca = pecasEmMemoria.find(p => p[FIELD_CODIGO_BIPAGEM] === pecaId);
    if (!peca) {
        console.warn(`Tentativa de reverter status da peça ${pecaId}, mas não foi encontrada na memória.`);
        return;
    }

    console.log(`Revertendo status otimista para ${pecaId}, modo ${mode}`);
    // Define os campos de status de volta para null
    switch (mode) {
        case 'nesting':
            peca[FIELD_STATUS_NEST_TXT] = null;
            break;
        case 'seccionadora':
            peca[FIELD_STATUS_SECC_TXT] = null; 
            break;
        case 'coladeira':
            peca[FIELD_STATUS_COLADEIRA_TXT] = null;
            break;
        case 'holzer':
            peca[FIELD_STATUS_HOLZER_TXT] = null;
            break;
        case 'premontagem':
            peca[FIELD_STATUS_PREMONTAGEM_TXT] = null;
            break;
    }
}


// ============================================================================
// FUNÇÃO: ATUALIZA BARRA DE PROGRESSO
// ============================================================================
function updateProgressUI() {
    const clienteAmbiente = currentClienteAmbiente;
    const mode = currentMode;
    const modeDisplay = currentModeDisplay;

    if (!clienteAmbiente || !mode || pecasEmMemoria.length === 0) {
        progressSection.style.display = 'none'; return;
    }
    console.log(`Calculando progresso para Cliente/Amb: ${clienteAmbiente}, Modo:${mode}`);

    const pecasDoGrupo = pecasEmMemoria.filter(p => extractClienteAmbiente(p) === clienteAmbiente);
    const pecasRequeridas = pecasDoGrupo.filter(p => isProcessRequired(p, mode));
    const pecasFeitas = pecasRequeridas.filter(p => isProcessDone(p, mode));
    const totalRequeridas = pecasRequeridas.length;
    const totalFeitas = pecasFeitas.length;

    console.log(`Tot Grupo: ${pecasDoGrupo.length}, Req ${mode}: ${totalRequeridas}, Feitas: ${totalFeitas}`);

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
                const statusIcon = scan.encontrada ? '✔️' : '❓';
                const statusClass = scan.encontrada ? 'success' : 'error';
                const clienteAmbienteTag = scan.clienteAmbiente ? `<span class="cliente-tag">${scan.clienteAmbiente.substring(0, 30)}...</span>` : '';
                const modeTag = scan.mode ? `<span class="mode-tag">${scan.mode.toUpperCase()}</span>` : '';
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
            navigator.serviceWorker.register('/sw.js') // Garanta que este caminho esteja correto
                .then(reg => console.log('Service Worker registrado!', reg))
                .catch(err => console.error('Falha registro SW:', err));
        });
    } else { console.warn("Service Worker não suportado."); }
}