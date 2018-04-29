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
    let localStorageSettingdName = 'bombpartySmartBotSettings';
    let currentWord;
    let alreadyUsedWords = [];

    let settings = {
        // default settings, must be override by settings in local storage
        learningEnabled: false,
        typingEnabled: false
    };

    function saveWord(word, myself = false) {
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

        let findResult = currentStorage.findIndex(w => {
            return w['word'] === word;
        });

        // if word is not already present is locale storage
        if (findResult === -1) {
            log('New word learned:', word);
            currentStorage.push({
                word: word,
                popularity: 0
            });
        } else if (!myself || !settings.typingEnabled) {
            currentStorage[findResult] = {
                word: word,
                popularity: currentStorage[findResult]['popularity'] + 1
            }
        }

        localStorage.setItem(localStorageName, JSON.stringify(currentStorage));
    }

    function deleteWord(word) {
        let parsedData = getWords();
        localStorage.setItem(localStorageName, JSON.stringify(parsedData.filter(w => {
            return w['word'] !== word;
        })));
    }

    function getWords(){
        return JSON.parse(localStorage.getItem(localStorageName));
    }

    function onCorrectWord(word, myself = false) {
        if(settings.learningEnabled || myself){
            saveWord(word, myself);
        }
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
            let lcWord = w['word'].toLowerCase();
            return (!alreadyUsedWords.includes(lcWord)) && lcWord.includes(channel.data['wordRoot'].toLowerCase());
        });

        if (correctWords.length > 0) {
            // get the more popular and shorter word
            let word = correctWords.sort(function (a, b) {
                // if same popularity get the shorter one
                if (a['popularity'] === b['popularity']) {
                    return a.length - b.length;
                }

                return b['popularity'] - a['popularity'];
            })[0]['word'];

            if(settings.typingEnabled){
                log('Typing:', word);
                setTimeout(() => {
                    humanTyping(word, 0);
                }, rand(950, 950 + word.length * 100));
            }
        } else {
            log('No words match: ', channel.data['wordRoot'])
        }
    }

    function onEndGame() {
        alreadyUsedWords = [];
    }

    function loadSettings(){
        let storedSettings = {};
        try{
            storedSettings = JSON.parse(localStorage.getItem(localStorageSettingdName));
        }catch (e) {

        }

        if(storedSettings){
            settings = Object.assign(settings, storedSettings);
        }
    }
    
    function saveSettings() {
        localStorage.setItem(localStorageSettingdName, JSON.stringify(settings));
    }

    function rand(min, max) {
        return Math.trunc(Math.random() * (max - min) + min);
    }

    function log(...messages) {
        console.log(`%c[BOT]%c ${messages.join(' ')}`, 'color: red;', 'color: initial;');
    }

    function init() {
        loadSettings();
        log(`Typing ${settings.typingEnabled ? 'is' : 'is not'} enabled`);
        log(`Learning ${settings.learningEnabled ? 'is' : 'is not'} enabled`);

        channel.socket.on('setWord', word => {
            // word is like: {playerAuthId: "***", word: "***"}
            currentWord = word;
        });

        channel.socket.on('winWord', winWord => {
            // winWord is like: {playerAuthId: "***"}
            if (currentWord && winWord['playerAuthId'] === currentWord['playerAuthId']) {
                onCorrectWord(currentWord['word'].toLowerCase(), winWord['playerAuthId'] === app.user.authId);
            }
        });

        channel.socket.on('setActivePlayerIndex', playerIndex => {
            // detect if it's your turn
            if (channel.data.actors[playerIndex].authId === app.user.authId) {
                log('It\'s my turn');
                onPlayerTurn();
            }
        });

        channel.socket.on('failWord', player => {
            // detect if it's your turn
            if (player['playerAuthId'] === app.user.authId) {
                log('I try again');
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

        // set global function
        window.bot = {};
        window.bot.addWord = saveWord;
        window.bot.getWords = getWords;
        window.bot.deleteWord = deleteWord;
        window.bot.enableLearning = (param = true) => {
            settings.learningEnabled = param === true;
            log(`Learning is now ${settings.learningEnabled ? 'enabled' : 'disabled'}`);
            saveSettings();
        };

        window.bot.enableTyping = (param = true) => {
            settings.typingEnabled = param === true;
            log(`Typing is now ${settings.typingEnabled ? 'enabled' : 'disabled'}`);
            saveSettings();
        };
    }

    // wait for socket
    let waitInterval = setInterval(() => {
        if (channel && channel.socket) {
            log('Socket is ready');
            clearInterval(waitInterval);
            init();
        }
    }, 250);
})();