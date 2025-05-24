// Cole aqui o objeto de configuração do Firebase que você copiou do console
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "SEU_AUTH_DOMAIN",
    databaseURL: "SEU_DATABASE_URL", // Importante: Verifique se é o URL do Realtime Database
    projectId: "SEU_PROJECT_ID",
    storageBucket: "SEU_STORAGE_BUCKET",
    messagingSenderId: "SEU_MESSAGING_SENDER_ID",
    appId: "SEU_APP_ID"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();

// --- Constantes de Configuração da Lista ---
const MAX_PLAYERS = 20; // Ou 24 se tiver 4 goleiros
const MAX_GOALKEEPERS = 2; // Altere para 4 se MAX_PLAYERS for 24

// --- Referências do DOM ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const confirmPresenceButton = document.getElementById('confirm-presence-button');
const isGoalkeeperCheckbox = document.getElementById('is-goalkeeper');
const confirmedPlayersList = document.getElementById('confirmed-players-list');
const waitingListElement = document.getElementById('waiting-list'); // Renomeado para evitar conflito
const confirmedCountSpan = document.getElementById('confirmed-count');
const maxPlayersSpan = document.getElementById('max-players');
const goalkeeperCountSpan = document.getElementById('goalkeeper-count');
const maxGoalkeepersSpan = document.getElementById('max-goalkeepers');
const waitingCountSpan = document.getElementById('waiting-count');
const errorMessageElement = document.getElementById('error-message');

// --- Estado do Usuário ---
let currentUser = null;

// --- Lógica de Autenticação ---
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        userInfo.textContent = `Logado como: ${user.displayName || user.email}`;
        loginButton.style.display = 'none';
        logoutButton.style.display = 'inline-block';
        mainContent.style.display = 'block';
        loadLists(); // Carrega as listas quando o usuário está logado
    } else {
        userInfo.textContent = 'Por favor, faça login para participar.';
        loginButton.style.display = 'inline-block';
        logoutButton.style.display = 'none';
        mainContent.style.display = 'none';
        clearListsUI(); // Limpa as listas da UI se o usuário deslogar
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

maxPlayersSpan.textContent = MAX_PLAYERS;
maxGoalkeepersSpan.textContent = MAX_GOALKEEPERS;

function displayErrorMessage(message) {
    errorMessageElement.textContent = message;
    setTimeout(() => {
        errorMessageElement.textContent = '';
    }, 5000); // Limpa a mensagem após 5 segundos
}

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

        // Verificar se já está em alguma lista
        if (confirmedPlayers[playerId] || waitingPlayers[playerId]) {
            displayErrorMessage("Você já está na lista ou na espera.");
            return;
        }

        const numConfirmed = Object.keys(confirmedPlayers).length;
        const numGoalkeepers = Object.values(confirmedPlayers).filter(p => p.isGoalkeeper).length;

        if (numConfirmed < MAX_PLAYERS) {
            if (isGoalkeeper && numGoalkeepers >= MAX_GOALKEEPERS) {
                displayErrorMessage("Limite de goleiros atingido na lista principal. Você será adicionado à lista de espera.");
                await addToWaitingList(playerId, playerName, isGoalkeeper);
            } else {
                await confirmedPlayersRef.child(playerId).set({
                    name: playerName,
                    isGoalkeeper: isGoalkeeper,
                    timestamp: firebase.database.ServerValue.TIMESTAMP
                });
                displayErrorMessage("Presença confirmada!");
            }
        } else {
            displayErrorMessage("Lista principal cheia. Você foi adicionado à lista de espera.");
            await addToWaitingList(playerId, playerName, isGoalkeeper);
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

async function removePlayer(playerId, listType) {
    if (!currentUser || currentUser.uid !== playerId) {
        // Permitir que o admin (se implementado) ou o próprio jogador se remova.
        // Para simplificar, aqui só o próprio jogador pode se remover.
        // Se você quiser que o "criador" da lista possa remover outros,
        // precisará de uma lógica de permissões mais complexa no Firebase.
        const playerSnapshot = await (listType === 'confirmed' ? confirmedPlayersRef : waitingListRef).child(playerId).once('value');
        const playerData = playerSnapshot.val();
        if (!playerData) {
             displayErrorMessage("Jogador não encontrado para remover.");
            return;
        }
        // Aqui poderia ter uma verificação se o usuário logado é um "admin"
        // if (currentUser.uid !== playerId && !isAdmin(currentUser.uid)) {
        //    displayErrorMessage("Você não tem permissão para remover este jogador.");
        //    return;
        // }
    }


    try {
        if (listType === 'confirmed') {
            await confirmedPlayersRef.child(playerId).remove();
            displayErrorMessage("Você foi removido da lista principal.");
            await checkWaitingListAndPromote(); // Verifica se alguém da espera pode subir
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
        const confirmedPlayers = confirmedSnapshot.val() || {};
        const numConfirmed = Object.keys(confirmedPlayers).length;
        const numGoalkeepersConfirmed = Object.values(confirmedPlayers).filter(p => p.isGoalkeeper).length;

        if (numConfirmed < MAX_PLAYERS) {
            const waitingSnapshot = await waitingListRef.orderByChild('timestamp').limitToFirst(1).once('value');
            const waitingPlayersData = waitingSnapshot.val();

            if (waitingPlayersData) {
                const firstWaitingPlayerId = Object.keys(waitingPlayersData)[0];
                const firstWaitingPlayer = waitingPlayersData[firstWaitingPlayerId];

                if (firstWaitingPlayer.isGoalkeeper && numGoalkeepersConfirmed >= MAX_GOALKEEPERS) {
                    console.log("Não pode promover goleiro, limite atingido. Esperando próximo não-goleiro ou vaga de goleiro.");
                    // Poderia tentar promover o próximo não-goleiro se houver.
                    // Para simplificar, esperamos uma vaga adequada.
                    return;
                }

                // Promove o jogador
                await confirmedPlayersRef.child(firstWaitingPlayerId).set(firstWaitingPlayer);
                await waitingListRef.child(firstWaitingPlayerId).remove();
                console.log(`Jogador ${firstWaitingPlayer.name} promovido da lista de espera.`);
            }
        }
    } catch (error) {
        console.error("Erro ao promover jogador:", error);
        displayErrorMessage("Erro ao tentar promover jogador da espera.");
    }
}


// --- Funções de Renderização da UI ---
function renderList(listElement, playersObject, listType) {
    listElement.innerHTML = ''; // Limpa a lista atual
    if (!playersObject) {
        if (listType === 'confirmed') confirmedCountSpan.textContent = 0;
        if (listType === 'waiting') waitingCountSpan.textContent = 0;
        if (listType === 'confirmed') goalkeeperCountSpan.textContent = 0;
        return;
    }

    const playersArray = Object.entries(playersObject).map(([id, data]) => ({ id, ...data }));

    // Ordena por timestamp para a lista de espera (mais antigo primeiro)
    if (listType === 'waiting') {
        playersArray.sort((a, b) => a.timestamp - b.timestamp);
    } else if (listType === 'confirmed') {
        // Pode ordenar por nome ou manter a ordem do Firebase (geralmente por chave ou timestamp de adição)
         playersArray.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }


    let currentGoalkeepers = 0;
    playersArray.forEach(player => {
        const li = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.classList.add('player-name');
        nameSpan.textContent = player.name;
        li.appendChild(nameSpan);

        if (player.isGoalkeeper) {
            const gkIndicator = document.createElement('span');
            gkIndicator.classList.add('player-info');
            gkIndicator.textContent = ' (Goleiro)';
            li.appendChild(gkIndicator);
            if (listType === 'confirmed') {
                currentGoalkeepers++;
            }
        }

        // Adiciona botão de remover se o usuário logado for o jogador em questão
        // ou se você implementar uma lógica de admin
        if (currentUser && currentUser.uid === player.id) {
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-button');
            removeBtn.textContent = 'Sair';
            removeBtn.onclick = () => removePlayer(player.id, listType);
            li.appendChild(removeBtn);
        }
        listElement.appendChild(li);
    });

    if (listType === 'confirmed') {
        confirmedCountSpan.textContent = playersArray.length;
        goalkeeperCountSpan.textContent = currentGoalkeepers;
    } else if (listType === 'waiting') {
        waitingCountSpan.textContent = playersArray.length;
    }
}

function clearListsUI() {
    confirmedPlayersList.innerHTML = '';
    waitingListElement.innerHTML = '';
    confirmedCountSpan.textContent = '0';
    goalkeeperCountSpan.textContent = '0';
    waitingCountSpan.textContent = '0';
}

// --- Listeners do Firebase para Atualizações em Tempo Real ---
function loadLists() {
    if (confirmedPlayersRef) {
        confirmedPlayersRef.on('value', snapshot => {
            const players = snapshot.val();
            renderList(confirmedPlayersList, players, 'confirmed');
            checkWaitingListAndPromote(); // Verifica se precisa promover após alguma mudança na lista principal
        }, error => {
            console.error("Erro ao carregar lista de confirmados:", error);
            displayErrorMessage("Não foi possível carregar a lista de confirmados.");
        });
    }

    if (waitingListRef) {
        waitingListRef.on('value', snapshot => {
            const players = snapshot.val();
            renderList(waitingListElement, players, 'waiting');
        }, error => {
            console.error("Erro ao carregar lista de espera:", error);
            displayErrorMessage("Não foi possível carregar a lista de espera.");
        });
    }
}

// Inicializa a carga das listas se o usuário já estiver logado ao carregar a página
if (auth.currentUser) {
    loadLists();
}
