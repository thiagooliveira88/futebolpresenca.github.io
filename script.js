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
const MAX_TOTAL_PLAYERS = MAX_FIELD_PLAYERS + MAX_GOALKEEPERS; // Total na lista principal (24)

// --- Referências do DOM ---
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const userInfo = document.getElementById('user-info');
const mainContent = document.getElementById('main-content');
const confirmPresenceButton = document.getElementById('confirm-presence-button');
const isGoalkeeperCheckbox = document.getElementById('is-goalkeeper');
const confirmedPlayersList = document.getElementById('confirmed-players-list');
const waitingListElement = document.getElementById('waiting-list');
const confirmedCountSpan = document.getElementById('confirmed-count');
const maxPlayersSpan = document.getElementById('max-players'); // Mostra o total (24)
const goalkeeperCountSpan = document.getElementById('goalkeeper-count');
const maxGoalkeepersSpan = document.getElementById('max-goalkeepers'); // Mostra o limite de goleiros (4)
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
maxPlayersSpan.textContent = MAX_TOTAL_PLAYERS;
maxGoalkeepersSpan.textContent = MAX_GOALKEEPERS;

function displayErrorMessage(message) {
    errorMessageElement.textContent = message;
    setTimeout(() => {
        errorMessageElement.textContent = '';
    }, 5000);
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
                displayErrorMessage("Limite de goleiros atingido na lista principal. Você foi adicionado à lista de espera.");
                await addToWaitingList(playerId, playerName, true);
            }
        } else { // Jogador de linha
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

async function removePlayer(playerId, listType) {
    // A lógica de permissão para remover (apenas o próprio jogador) permanece a mesma.
    // Se precisar de admin, essa lógica seria expandida aqui.
    if (!currentUser || currentUser.uid !== playerId) {
        // Esta verificação é simples, se precisar de um admin para remover outros,
        // a lógica de permissão precisa ser mais elaborada.
        // Neste ponto, consideramos que apenas o próprio usuário pode se remover.
        // Se um admin fosse permitido, uma verificação de UID de admin seria necessária.
        // Por agora, vamos manter a remoção apenas pelo próprio usuário para simplificar.
        // Idealmente, você verificaria se o currentUser.uid é igual ao playerId
        // ANTES de permitir a remoção, o que já está implícito na UI
        // mas é bom ter aqui também caso essa função seja chamada de outro lugar.
         const playerSnapshot = await (listType === 'confirmed' ? confirmedPlayersRef : waitingListRef).child(playerId).once('value');
         if (!playerSnapshot.exists()){
            displayErrorMessage("Jogador não encontrado para remover.");
            return;
         }
         // Adicionar uma verificação mais explícita se necessário, por exemplo:
         // if (currentUser.uid !== playerId && !isCurrentUserAdmin()) {
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
        const confirmedPlayersData = confirmedSnapshot.val() || {};
        const confirmedPlayersArray = Object.values(confirmedPlayersData);

        const numConfirmedGoalkeepers = confirmedPlayersArray.filter(p => p.isGoalkeeper).length;
        const numConfirmedFieldPlayers = confirmedPlayersArray.filter(p => !p.isGoalkeeper).length;

        const waitingSnapshot = await waitingListRef.orderByChild('timestamp').once('value');
        const waitingPlayersData = waitingSnapshot.val();

        if (!waitingPlayersData) {
            return; // Lista de espera vazia
        }

        const waitingPlayersArray = Object.entries(waitingPlayersData)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => a.timestamp - b.timestamp); // Garante a ordem

        for (const playerToPromote of waitingPlayersArray) {
            let promoted = false;
            if (playerToPromote.isGoalkeeper) {
                if (numConfirmedGoalkeepers < MAX_GOALKEEPERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Goleiro ${playerToPromote.name} promovido da lista de espera.`);
                    promoted = true;
                }
            } else { // Jogador de linha
                if (numConfirmedFieldPlayers < MAX_FIELD_PLAYERS) {
                    await confirmedPlayersRef.child(playerToPromote.id).set(playerToPromote);
                    await waitingListRef.child(playerToPromote.id).remove();
                    console.log(`Jogador de linha ${playerToPromote.name} promovido da lista de espera.`);
                    promoted = true;
                }
            }
            if (promoted) {
                // Se promoveu alguém, precisamos reavaliar as contagens e tentar promover o próximo se ainda houver vagas
                // Para simplificar, vamos sair e a próxima atualização de dados ou remoção chamará checkWaitingListAndPromote novamente.
                // Ou, para uma promoção mais agressiva em uma única chamada:
                // return checkWaitingListAndPromote(); // Chamada recursiva para preencher mais vagas se possível
                // Por ora, promover um por vez ao liberar vaga é suficiente e mais simples.
                break; // Sai do loop após promover o primeiro jogador elegível
            }
        }

    } catch (error) {
        console.error("Erro ao promover jogador:", error);
        displayErrorMessage("Erro ao tentar promover jogador da espera.");
    }
}


// --- Funções de Renderização da UI (a lógica de contagem aqui é apenas para exibição)---
function renderList(listElement, playersObject, listType) {
    listElement.innerHTML = '';
    if (!playersObject) {
        if (listType === 'confirmed') {
            confirmedCountSpan.textContent = 0;
            goalkeeperCountSpan.textContent = 0;
        } else if (listType === 'waiting') {
            waitingCountSpan.textContent = 0;
        }
        return;
    }

    const playersArray = Object.entries(playersObject).map(([id, data]) => ({ id, ...data }));

    if (listType === 'waiting') {
        playersArray.sort((a, b) => a.timestamp - b.timestamp);
    } else if (listType === 'confirmed') {
        playersArray.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    let currentConfirmedTotal = 0;
    let currentGoalkeepersInList = 0;

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
                currentGoalkeepersInList++;
            }
        }

        if (currentUser && currentUser.uid === player.id) {
            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-button');
            removeBtn.textContent = 'Sair';
            removeBtn.onclick = () => removePlayer(player.id, listType);
            li.appendChild(removeBtn);
        }
        listElement.appendChild(li);
        if (listType === 'confirmed') {
            currentConfirmedTotal++;
        }
    });

    if (listType === 'confirmed') {
        confirmedCountSpan.textContent = currentConfirmedTotal; // Total de confirmados (linha + goleiros)
        goalkeeperCountSpan.textContent = currentGoalkeepersInList; // Total de goleiros confirmados
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
            // Não é ideal chamar checkWaitingListAndPromote diretamente aqui
            // pois pode causar loops se a promoção também disparar 'value'.
            // A promoção já é chamada após uma remoção.
            // Se um jogador é adicionado diretamente à lista de espera,
            // a lógica de promoção ao remover alguém da lista principal cobrirá.
            // Considerar chamar checkWaitingListAndPromote se o número total de jogadores for menor que o máximo,
            // mas apenas se a lista de espera não estiver vazia.
            // Por ora, a chamada em removePlayer é o principal gatilho.
        }, error => {
            console.error("Erro ao carregar lista de confirmados:", error);
            displayErrorMessage("Não foi possível carregar a lista de confirmados.");
        });
    }

    if (waitingListRef) {
        waitingListRef.on('value', snapshot => {
            const players = snapshot.val();
            renderList(waitingListElement, players, 'waiting');
            // Se a lista de espera mudar (alguém entrou ou saiu da espera diretamente),
            // e houver vagas na lista principal, podemos tentar promover.
             checkWaitingListAndPromote(); // Tenta promover sempre que a lista de espera mudar e houver vagas.
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
