// ==UserScript==
// @name         bombparty-smart-bot
// @namespace    *
// @version      0.0.1
// @description  No description yet
// @author       branchard
// @match        http://bombparty.sparklinlabs.com/play/*
// @grant        none
// ==/UserScript==

(() => {
    let localStorageName = 'bombpartySmartBot';
    let learningEnabled = true;
    let currentWord;
    let alreadyUsedWords = [];

    function saveWord(word) {
        if(!learningEnabled){
            return;
        }
        let currentStorage = [];
        let localStorageItem = localStorage.getItem(localStorageName);

        if (localStorageItem) {
            try {
                let parsedData = JSON.parse(localStorageItem);
                if (Array.isArray(parsedData)) {
                    currentStorage = parsedData;
                }
            } catch (e) {

            }
        }

        // if word is not already present is locale storage
        if (currentStorage.indexOf(word) === -1) {
            log('New word learned:', word);
            currentStorage.push(word);
        }

        localStorage.setItem(localStorageName, JSON.stringify(currentStorage));
    }

    function onCorrectWord(word) {
        //log('Correct word is:', word);
        //setTimeout(() => {
        saveWord(word);
        //}, 0);
        alreadyUsedWords.push(word);
    }

    function humanTyping(word, i) {
        if (i >= word.length) {
            return;
        }
        let waitingTime = rand(95, 265);
        setTimeout(() => {
            // 5% luck to do mistake
            if (Math.random() < 0.05) {
                let mistake = '';
                for (let i = 0; i < rand(1, 2); i++) {
                    mistake += String.fromCharCode(
                        Math.floor(Math.random() * 26) + 97
                    );
                }
                channel.socket.emit("setWord", {
                    word: word.substring(0, i) + mistake,
                    validate: false
                });
                humanTyping(word, i);
            } else {
                channel.socket.emit("setWord", {
                    word: word.substring(0, i + 1),
                    validate: (i + 1 >= word.length)
                });
                humanTyping(word, i + 1);
            }
        }, waitingTime);
    }

    function stopTyping() {

    }

    function onPlayerTurn() {
        let dic = JSON.parse(localStorage.getItem(localStorageName));
        let correctWords = dic.filter(w => {
            let lcWord = w.toLowerCase();
            return (!alreadyUsedWords.includes(lcWord)) && lcWord.includes(channel.data['wordRoot'].toLowerCase());
        });

        if (correctWords.length > 0) {
            // get the shorter word
            let word = correctWords.sort(function (a, b) {
                return a.length - b.length;
            })[0];

            log('Typing:', word);
            setTimeout(() => {
                humanTyping(word, 0);
            }, rand(850, 850 + word.length * 100));
        } else {
            log('No words match: ', channel.data['wordRoot'])
        }
    }

    function onEndGame() {
        alreadyUsedWords = [];
    }

    function rand(min, max) {
        return Math.trunc(Math.random() * (max - min) + min);
    }

    function log(...messages){
        console.log(`%c[BOT]%c ${messages.join(' ')}`, 'color: red;', 'color: initial;');
    }

    function init() {
        log(`Learning ${learningEnabled ? 'is' : 'is not'} enabled`);

        channel.socket.on('setWord', word => {
            // word is like: {playerAuthId: "***", word: "***"}
            currentWord = word;
        });

        channel.socket.on('winWord', winWord => {
            // winWord is like: {playerAuthId: "***"}
            if (currentWord && winWord['playerAuthId'] === currentWord['playerAuthId']) {
                onCorrectWord(currentWord['word'].toLowerCase());
            }
        });

        channel.socket.on('setActivePlayerIndex', playerIndex => {
            // detect if it's your turn
            if (channel.data.actors[playerIndex].authId === app.user.authId) {
                log('ITS YOUR TURN!!');
                onPlayerTurn();
            }
        });

        channel.socket.on('failWord', player => {
            // detect if it's your turn
            if (player['playerAuthId'] === app.user.authId) {
                log('TRY AGAIN');
                alreadyUsedWords.push(currentWord['word']);
                // remove word
                channel.socket.emit("setWord", {
                    word: '',
                    validate: false
                });

                onPlayerTurn();
            }
        });

        channel.socket.on('endGame', () => {
            onEndGame();
        });
    }

    // wait for socket
    let waitInterval = setInterval(() => {
        if (channel && channel.socket) {
            log('Socket is ready!');
            clearInterval(waitInterval);
            init();
        }
    }, 250);
})();