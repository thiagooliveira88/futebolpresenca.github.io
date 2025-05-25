// Cole aqui o objeto de configuração do Firebase que você copiou do console
 const firebaseConfig = {
    apiKey: "AIzaSyAUEJ-tqQ26B4m7-9CG8C8frevBpZvsvLI",
    authDomain: "futebolpresenca.firebaseapp.com",
    databaseURL: "https://futebolpresenca-default-rtdb.firebaseio.com",
    projectId: "futebolpresenca",
    storageBucket: "futebolpresenca.firebasestorage.app",
    messagingSenderId: "410645587358",
    appId: "1:410645587358:web:5777a493ef77112f16228f",
    measurementId: "G-LJBYMWJM9C"
  };

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// --- Constantes de Configuração da Lista ---
const MAX_FIELD_PLAYERS = 20; // Máximo de jogadores de linha
const MAX_GOALKEEPERS = 4;    // Máximo de goleiros
// MAX_TOTAL_PLAYERS não é mais usado diretamente para exibição principal, mas a lógica interna usa os limites específicos.

// --- Referências do DOM ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const confirmPresenceButton = document.getElementById('confirm-presence-button');
const isGoalkeeperCheckbox = document.getElementById('is-goalkeeper');

const confirmedGoalkeepersListElement = document.getElementById('confirmed-goalkeepers-list');
const confirmedFieldPlayersListElement = document.getElementById('confirmed-fieldplayers-list');
const waitingListElement = document.getElementById('waiting-list');

const confirmedGkCountSpan = document.getElementById('confirmed-gk-count');
const maxGoalkeepersDisplaySpan = document.getElementById('max-goalkeepers-display');
const confirmedFpCountSpan = document.getElementById('confirmed-fp-count');
const maxFieldplayersDisplaySpan = document.getElementById('max-fieldplayers-display');
const waitingCountSpan = document.getElementById('waiting-count');
const errorMessageElement = document.getElementById('error-message');

// --- Estado do Usuário ---
let currentUser = null;

// --- Lógica de Autenticação (sem alterações) ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        userInfo.textContent = `Logado como: ${user.displayName || user.email}`;
        loginButton.style.display = 'none';
        logoutButton.style.display = 'inline-block';
        mainContent.style.display = 'block';
        loadLists();
    } else {
        userInfo.textContent = 'Por favor, faça login para participar.';
        loginButton.style.display = 'inline-block';
        logoutButton.style.display = 'none';
        mainContent.style.display = 'none';
        clearListsUI();
    }
});

loginButton.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(error => {
        console.error("Erro no login:", error);
        displayErrorMessage("Falha no login. Tente novamente.");
    });
});

logoutButton.addEventListener('click', () => {
    auth.signOut().catch(error => {
        console.error("Erro no logout:", error);
        displayErrorMessage("Falha ao deslogar.");
    });
});

// --- Lógica da Lista de Presença ---
const confirmedPlayersRef = database.ref('listaFutebol/jogadoresConfirmados');
const waitingListRef = database.ref('listaFutebol/listaEspera');

// Atualiza os spans de máximo na UI
maxGoalkeepersDisplaySpan.textContent = MAX_GOALKEEPERS;
maxFieldplayersDisplaySpan.textContent = MAX_FIELD_PLAYERS;

function displayErrorMessage(message) {
    errorMessageElement.textContent = message;
    setTimeout(() => {
        errorMessageElement.textContent = '';
    }, 5000);
}

// --- Funções de confirmação, remoção e promoção (lógica central sem grandes alterações) ---
// A lógica de QUEM entra e QUANDO já diferencia goleiros/linha e seus limites.
// A mudança é em COMO eles são exibidos.

confirmPresenceButton.addEventListener('click', async () => {
    if (!currentUser) {
        displayErrorMessage("Você precisa estar logado para confirmar presença.");
        return;
    }

    const isGoalkeeper = isGoalkeeperCheckbox.checked;
    const playerId = currentUser.uid;
    const playerName = currentUser.displayName || "Jogador Anônimo";

    try {
        const confirmedSnapshot = await confirmedPlayersRef.once('value');
        const confirmedPlayers = confirmedSnapshot.val() || {};
        const waitingSnapshot = await waitingListRef.once('value');
        const waitingPlayers = waitingSnapshot.val() || {};

        if (confirmedPlayers[playerId] || waitingPlayers[playerId]) {
            displayErrorMessage("Você já está na lista ou na espera.");
            return;
        }

        const confirmedPlayersArray = Object.values(confirmedPlayers);
        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        if (isGoalkeeper) {
            if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                await confirmedPlayersRef.child(playerId).set({
                    name: playerName,
                    isGoalkeeper: true,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                displayErrorMessage("Presença como goleiro confirmada!");
            } else {
                displayErrorMessage("Limite de goleiros atingido. Você foi adicionado à lista de espera.");
                await addToWaitingList(playerId, playerName, true);
            }
        } else {
            if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                await confirmedPlayersRef.child(playerId).set({
                    name: playerName,
                    isGoalkeeper: false,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                displayErrorMessage("Presença como jogador de linha confirmada!");
            } else {
                displayErrorMessage("Limite de jogadores de linha atingido. Você foi adicionado à lista de espera.");
                await addToWaitingList(playerId, playerName, false);
            }
        }
    } catch (error) {
        console.error("Erro ao confirmar presença:", error);
        displayErrorMessage("Ocorreu um erro ao confirmar sua presença.");
    }
});

async function addToWaitingList(playerId, playerName, isGoalkeeper) {
    try {
        await waitingListRef.child(playerId).set({
            name: playerName,
            isGoalkeeper: isGoalkeeper,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
    } catch (error) {
        console.error("Erro ao adicionar à lista de espera:", error);
        displayErrorMessage("Erro ao entrar na lista de espera.");
    }
}

async function removePlayer(playerId, listType) { // listType é 'confirmed' ou 'waiting'
    if (!currentUser || currentUser.uid !== playerId) {
        // Lógica de permissão simplificada: apenas o próprio jogador se remove.
        // Se esta função pudesse ser chamada por um admin, a verificação seria diferente.
        const playerRef = listType === 'confirmed' ? confirmedPlayersRef.child(playerId) : waitingListRef.child(playerId);
        const playerSnapshot = await playerRef.once('value');
        if (!playerSnapshot.exists()) {
            displayErrorMessage("Jogador não encontrado para remover.");
            return;
        }
        // Neste ponto, o botão de remover só aparece para o próprio jogador,
        // então a verificação currentUser.uid === playerId já foi feita implicitamente pela UI.
    }

    try {
        if (listType === 'confirmed') {
            await confirmedPlayersRef.child(playerId).remove();
            displayErrorMessage("Você foi removido da lista principal.");
            await checkWaitingListAndPromote();
        } else if (listType === 'waiting') {
            await waitingListRef.child(playerId).remove();
            displayErrorMessage("Você foi removido da lista de espera.");
        }
    } catch (error) {
        console.error(`Erro ao remover jogador da lista ${listType}:`, error);
        displayErrorMessage("Erro ao remover da lista.");
    }
}

async function checkWaitingListAndPromote() {
    try {
        const confirmedSnapshot = await confirmedPlayersRef.once('value');
        const confirmedPlayersData = confirmedSnapshot.val() || {};
        const confirmedPlayersArray = Object.values(confirmedPlayersData);

        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const waitingSnapshot = await waitingListRef.orderByChild('timestamp').once('value');
        const waitingPlayersData = waitingSnapshot.val();

        if (!waitingPlayersData) return;

        const waitingPlayersArray = Object.entries(waitingPlayersData)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => a.timestamp - b.timestamp);

        for (const playerToPromote of waitingPlayersArray) {
            let promoted = false;
            if (playerToPromote.isGoalkeeper) {
                if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Goleiro ${playerToPromote.name} promovido.`);
                    promoted = true;
                }
            } else {
                if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Jogador de linha ${playerToPromote.name} promovido.`);
                    promoted = true;
                }
            }
            if (promoted) {
                break; 
            }
        }
    } catch (error) {
        console.error("Erro ao promover jogador:", error);
        displayErrorMessage("Erro ao tentar promover jogador da espera.");
    }
}

// --- Funções de Renderização da UI (GRANDES MUDANÇAS AQUI) ---

function renderPlayerListItem(player, index, listTypeIdentifier) {
    const li = document.createElement('li');
    
    const orderSpan = document.createElement('span');
    orderSpan.classList.add('player-order');
    orderSpan.textContent = `${index + 1}. `; // Numeração
    li.appendChild(orderSpan);

    const nameSpan = document.createElement('span');
    nameSpan.classList.add('player-name');
    nameSpan.textContent = player.name;
    li.appendChild(nameSpan);

    if (player.isGoalkeeper) {
        const gkIndicator = document.createElement('span');
        gkIndicator.classList.add('player-info');
        gkIndicator.textContent = ' (Goleiro)';
        // Só adiciona o indicador se não for a lista específica de goleiros já
        if (listTypeIdentifier !== 'confirmed-gk' && listTypeIdentifier !== 'waiting-gk-explicit') {
             li.appendChild(gkIndicator); // Adiciona (Goleiro) na lista de espera geral
        }
    }

    // Adiciona botão de remover se o usuário logado for o jogador
    if (currentUser && currentUser.uid === player.id) {
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-button');
        removeBtn.textContent = 'Sair';
        // Determina de qual lista remover (confirmados ou espera)
        const listTypeForRemove = listTypeIdentifier.startsWith('confirmed') ? 'confirmed' : 'waiting';
        removeBtn.onclick = () => removePlayer(player.id, listTypeForRemove);
        li.appendChild(removeBtn);
    }
    return li;
}

function renderConfirmedLists(confirmedPlayersObject) {
    confirmedGoalkeepersListElement.innerHTML = '';
    confirmedFieldPlayersListElement.innerHTML = '';

    if (!confirmedPlayersObject) {
        confirmedGkCountSpan.textContent = 0;
        confirmedFpCountSpan.textContent = 0;
        return;
    }

    const allConfirmedArray = Object.entries(confirmedPlayersObject)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp); // Ordena por ordem de entrada

    const goalkeepers = [];
    const fieldPlayers = [];

    allConfirmedArray.forEach(player => {
        if (player.isGoalkeeper) {
            goalkeepers.push(player);
        } else {
            fieldPlayers.push(player);
        }
    });

    goalkeepers.forEach((player, index) => {
        confirmedGoalkeepersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-gk'));
    });
    confirmedGkCountSpan.textContent = goalkeepers.length;

    fieldPlayers.forEach((player, index) => {
        confirmedFieldPlayersListElement.appendChild(renderPlayerListItem(player, index, 'confirmed-fp'));
    });
    confirmedFpCountSpan.textContent = fieldPlayers.length;
}

function renderWaitingList(waitingPlayersObject) {
    waitingListElement.innerHTML = '';
    if (!waitingPlayersObject) {
        waitingCountSpan.textContent = 0;
        return;
    }

    const waitingArray = Object.entries(waitingPlayersObject)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => a.timestamp - b.timestamp); // Já ordenado pelo Firebase, mas re-sort para garantir

    waitingArray.forEach((player, index) => {
        waitingListElement.appendChild(renderPlayerListItem(player, index, 'waiting'));
    });
    waitingCountSpan.textContent = waitingArray.length;
}


function clearListsUI() {
    confirmedGoalkeepersListElement.innerHTML = '';
    confirmedFieldPlayersListElement.innerHTML = '';
    waitingListElement.innerHTML = '';
    confirmedGkCountSpan.textContent = '0';
    confirmedFpCountSpan.textContent = '0';
    waitingCountSpan.textContent = '0';
}

// --- Listeners do Firebase para Atualizações em Tempo Real ---
function loadLists() {
    if (confirmedPlayersRef) {
        confirmedPlayersRef.on('value', snapshot => {
            const players = snapshot.val();
            renderConfirmedLists(players);
            // A chamada para checkWaitingListAndPromote é crucial após uma remoção,
            // e também quando a lista de espera é atualizada.
        }, error => {
            console.error("Erro ao carregar listas de confirmados:", error);
            displayErrorMessage("Não foi possível carregar as listas de confirmados.");
        });
    }

    if (waitingListRef) {
        waitingListRef.on('value', snapshot => {
            const players = snapshot.val();
            renderWaitingList(players);
            checkWaitingListAndPromote(); // Tenta promover sempre que a lista de espera ou principal mudar
        }, error => {
            console.error("Erro ao carregar lista de espera:", error);
            displayErrorMessage("Não foi possível carregar a lista de espera.");
        });
    }
}

// Inicializa a carga das listas se o usuário já estiver logado
if (auth.currentUser) {
    loadLists();
}
