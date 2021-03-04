// //TODO: Handle toggle switch while connected to Web SDK (diusconnect and play preview)
// //TODO: make player UI nicer, truncate text, nicer icons/buttons, make icons hoverable etc
// //TODO: clean up code
// //TODO: add seleect listing device
// //TODO: add image preview in in player if possible
// //TODO: handle error paths :)
//
let currentAudio = null;
let isSpotifyPlayer = false;
let isSpotifyPlayerReady = false;
let player;
let deviceId;
let seekBarInterval;
let isPaused = true;


document.addEventListener('DOMContentLoaded', function () {
    seekBarInterval = setInterval(() => {
        if (!isPaused) {
            const seekbar = document.getElementById('sp_seekbar');
            seekbar.value = parseInt(seekbar.value) + 10;
        }
    }, 10)
    console.log('init player');
});

window.onSpotifyWebPlaybackSDKReady = listener => {
    fetch(`api/sp/accessToken`, {method: 'GET'})
        .then((response) => {
            return response.json()
        }).then(token => {
        player = new Spotify.Player({
            name: 'Playlist Manager Player',
            getOAuthToken: cb => {
                cb(token.token);
            }
        });
        addListeners();
        player.connect();

    })

    function addListeners() {

        // Error handling
        player.addListener('initialization_error', ({message}) => {
            console.error(message);
        });
        player.addListener('authentication_error', ({message}) => {
            console.error(message);
        });
        player.addListener('account_error', ({message}) => {
            console.error(message);
        });
        player.addListener('playback_error', ({message}) => {
            console.error(message);
        });

        // Playback status updates
        player.addListener('player_state_changed', state => {
            const {paused, position, duration, track_window: {current_track: {uri, name}}} = state;
            updatePlayerTitle(name)
            updateSpotifyPlayer(position, duration);
            isPaused = paused;
            if (isPaused) {
                showPlayState();
            } else {
                showPauseState();
            }
            updateTableSelection(uri);
        });

        // Ready
        player.addListener('ready', ({device_id}) => {
            isSpotifyPlayerReady = true;
            updateToggleState();
            deviceId = device_id;
        });

        // Not Ready
        player.addListener('not_ready', ({device_id}) => {
            console.log('Device ID has gone offline', device_id);
        });
    }


};

function updateToggleState() {
    let toggle = document.getElementById('toggle');
    if (isSpotifyPlayerReady) {
        toggle.classList.remove('hide');
    } else {
        toggle.classList.add('hide');
    }

}

function updateSpotifyPlayer(position, duration) {
    const seekbar = document.getElementById('sp_seekbar');
    seekbar.max = duration;
    seekbar.value = position;

}

function playSong(song, tableData) {
    if (!isSpotifyPlayer) {
        loadMusic(song.preview_url);
        updatePlayerTitle(song.Song);
        document.getElementById('playerImage').src = song.images[0].url;
        onPlayerPlay();
    } else {
        stopAudioIfPlaying();
        const uris = tableData.map(a => a.uri);
        const offset = {position: tableData.findIndex(x => x.uri === song.uri)}
        const data = {deviceId, uris, offset};
        fetch(`api/sp/play`, {method: 'POST', body: JSON.stringify(data)}).catch(err => console.error(err))
    }

}

function updatePlayerTitle(name) {
    Array.from(document.getElementsByClassName('playerSongTitle')).forEach(ele => ele.innerText = name);
}

function showPlayState() {
    if (!isSpotifyPlayer) {
        let playButton = document.getElementById('playButton');
        let pauseButton = document.getElementById('pauseButton');
        playButton.classList.remove('hide');
        pauseButton.classList.add('hide');
    } else {
        let spPlayButton = document.getElementById('sp_playButton');
        let spPauseButton = document.getElementById('sp_pauseButton');
        spPlayButton.classList.remove('hide');
        spPauseButton.classList.add('hide');
    }

}

function showPauseState() {
    if (!isSpotifyPlayer) {
        let playButton = document.getElementById('playButton');
        let pauseButton = document.getElementById('pauseButton');
        playButton.classList.add('hide');
        pauseButton.classList.remove('hide');
    } else {
        let spPlayButton = document.getElementById('sp_playButton');
        let spPauseButton = document.getElementById('sp_pauseButton');
        spPlayButton.classList.add('hide');
        spPauseButton.classList.remove('hide');
    }

}

function onPlayerPause() {
    if (currentAudio) {
        currentAudio.pause()
        showPlayState();
    } else {
        player.pause().then(() => {
            console.log('Paused!');
        });
    }
}

function onPlayerPlay() {
    if (currentAudio) {
        currentAudio.play()
        showPauseState();
    } else {
        player.resume().then(() => {
            console.log('Resumed!');
        });
    }
}

function onNext() {
    player.nextTrack().then(() => {
        console.log('Skipped to next track!');
    });
}

function onSeek(state) {
    const pos = parseInt(state.value);
    player.seek(pos).then(() => {
        console.log('Changed position!');
    });
}

function onPrevious() {
    player.previousTrack().then(() => {
        console.log('Set to previous track!');
    });
}

function stopAudioIfPlaying() {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null
    }
}

function loadMusic(url) {
    if (!currentAudio) {
        currentAudio = new Audio();
    }
    currentAudio.onended = function () {
        showPlayState();
    };
    currentAudio.setAttribute('src', url);
    currentAudio.load();
}

function onSpotifyConnectionToggle(state) {
    isSpotifyPlayer = state.checked;
    const previewPlayer = document.getElementById('preview-player').classList;
    const spotifyPlayer = document.getElementById('spotifyPlayer').classList;
    if (isSpotifyPlayer) {
        previewPlayer.add('hide');
        spotifyPlayer.remove('hide');
    } else {
        previewPlayer.remove('hide');
        spotifyPlayer.add('hide');
    }
    stopAudioIfPlaying();
    pla
}