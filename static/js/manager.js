const SONG_TABLE_ID = "songTable"
const SONG_TABLE_CONTAINER_ID = "tableContainer"
let initTableHTML = undefined
let chosenPlaylists = [];
let storedData = {}
const EXTRA_LAST_COLUMNS = 4

window.onload = function () {
    initTableHTML = document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML;
}

async function updateTable(id, name) {
    toggleToList({id, name})
    await getPlaylistTracks(chosenPlaylists, (data) => {
        storedData = data;
        let options = {
            "ordering": true,
            "order": [],
            "paging": false,
            "createdRow": function (row, data, index) {
                const imageUrl = data.images[2] ? data.images[2].url : "";
                const songName = data.Song;
                formatSongColumn(row, 0, imageUrl, songName);
                for (let i = 2; i < storedData.columns.length - EXTRA_LAST_COLUMNS; i++) {
                    let payload = {
                        songId: data.id,
                        playlistId: storedData.columns[i].id
                    };
                    formatCheckboxColumns(row, i, payload, Boolean(data[storedData.columns[i].data]));
                }

            },
            "rowCallback": function (row, data, displayNum, displayIndex, dataIndex) {
            },
        }

        const optionWithData = Object.assign(options, storedData)
        optionWithData.columns.push({title: 'BPM', data: 'tempo'})
        optionWithData.columns.push({title: 'Danceability', data: 'danceability'})
        optionWithData.columns.push({title: 'Energy', data: 'energy'})
        optionWithData.columns.push({title: 'Instrument', data: 'instrumentalness'})
        if ($.fn.DataTable.isDataTable(prefixHash(SONG_TABLE_ID))) {
            //clear old data table
            const dtApi = $(prefixHash(SONG_TABLE_ID)).DataTable();
            dtApi.destroy();
            document.getElementById(SONG_TABLE_CONTAINER_ID).innerHTML = initTableHTML;
        }
        $(prefixHash(SONG_TABLE_ID)).DataTable(optionWithData);
    })

}

function formatSongColumn(row, columnIndex, imageUrl, songName) {
    let imgHTML = `<div class="valign-wrapper">
                        <img src="${imageUrl}" alt="album art" class="circle" height="32">
                        <span class="song-name">${songName}</span>
                    </div>`
    $(`td:eq(${columnIndex})`, row).html(imgHTML);
}

function formatCheckboxColumns(row, columnIndex, payload, isChecked) {
    let isCheckedAttr = isChecked ? "checked" : "";
    let pld = JSON.stringify(payload);
    let checkbox = `<label>
                        <input type="checkbox" ${isCheckedAttr} onclick='handleCheckbox(this, ${pld})'>
                        <span></span>
                  </label>`
    $(`td:eq(${columnIndex})`, row).html(checkbox);
}

function handleCheckbox(target, payload) {
    console.log("To do api request to add and remove from playlist");
    console.log(target.checked);
    console.log(payload.songId);
}

async function getPlaylistTracks(playlists, callback) {
    fetch(`/playlist`, {method: 'post', body: JSON.stringify(playlists)})
        .then(response => response.json())
        .then(callback);
}

function toggleToList(playlist) {
    let isPlaylistAlreadyChosen = chosenPlaylists.some(plst => plst.id === playlist.id)
    if (isPlaylistAlreadyChosen) {
        chosenPlaylists = chosenPlaylists.filter(function (el) {
            return el.id !== playlist.id;
        })
        document.getElementById(playlist.id).classList.remove("added-playlist");
    } else {
        chosenPlaylists.push(playlist)
        document.getElementById(playlist.id).classList.add("added-playlist");
    }
}

function prefixHash(val) {
    return '#' + val;
}